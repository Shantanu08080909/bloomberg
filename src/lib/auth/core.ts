import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

export const SESSION_COOKIE = "of_session";
const BCRYPT_COST = 12;

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(40)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, dot, dash or underscore");

export const PasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use at least one letter and one number");

export const CredentialsSchema = z.object({ username: UsernameSchema, password: PasswordSchema });

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function countUsers(db: Database): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users);
  return Number(row?.n ?? 0);
}

export async function createUser(
  db: Database,
  input: { username: string; password: string; displayName?: string },
) {
  const { username, password } = CredentialsSchema.parse(input);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(s.users)
      .values({ username: username.toLowerCase(), passwordHash })
      .returning({ id: s.users.id, username: s.users.username });
    await tx.insert(s.profiles).values({ userId: user!.id, displayName: input.displayName?.trim() || username });
    await tx.insert(s.watchlists).values({ userId: user!.id, name: "My Watchlist" });
    await tx.insert(s.portfolios).values({ userId: user!.id, name: "Paper Portfolio" });
    return user!;
  });
}

/** Compare against a fixed hash when the user is unknown to keep timing similar. */
let dummyHash: Promise<string> | null = null;

export async function authenticate(db: Database, username: string, password: string) {
  const [user] = await db
    .select()
    .from(s.users)
    .where(eq(s.users.username, username.trim().toLowerCase()))
    .limit(1);
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  return ok && user ? { id: user.id, username: user.username } : null;
}

export async function createSession(db: Database, userId: string, ttlDays: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await db.insert(s.sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistic clean-up of expired sessions.
  await db.delete(s.sessions).where(lt(s.sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
}

export async function getSessionUser(db: Database, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ id: s.users.id, username: s.users.username, displayName: s.profiles.displayName })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .leftJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(and(eq(s.sessions.id, hashToken(token)), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return { id: row.id, username: row.username, displayName: row.displayName ?? row.username };
}

export async function deleteSession(db: Database, token: string) {
  await db.delete(s.sessions).where(eq(s.sessions.id, hashToken(token)));
}

export async function changePassword(db: Database, userId: string, current: string, next: string) {
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) return false;
  const hash = await hashPassword(PasswordSchema.parse(next));
  await db.update(s.users).set({ passwordHash: hash }).where(eq(s.users.id, userId));
  await db.delete(s.sessions).where(eq(s.sessions.userId, userId));
  return true;
}
