import "server-only";
import { asc } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ApiError } from "./api";

/** The owner is the first account created on this installation. */
export async function isOwner(db: Database, userId: string): Promise<boolean> {
  const [first] = await db.select({ id: s.users.id }).from(s.users).orderBy(asc(s.users.createdAt), asc(s.users.id)).limit(1);
  return first?.id === userId;
}

export async function requireOwner(db: Database, userId: string) {
  if (!(await isOwner(db, userId))) throw new ApiError(403, "Only the owner account can import or download market data", "owner_only");
}
