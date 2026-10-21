import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { SESSION_COOKIE, getSessionUser, type SessionUser } from "@/lib/auth/core";
import type { Database } from "@/lib/db/client";
import { CalculationError } from "@/lib/finance/valuation";
import { NotFoundError } from "@/lib/services/user-data";
import { apiLimiter, heavyLimiter } from "@/lib/rate-limit";
import { DatabaseUnavailableError, db } from "./db";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`, "not_found");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Reject cross-site state-changing requests (CSRF defence in addition to SameSite cookies). */
export function isSameOriginRequest(req: Pick<NextRequest, "headers" | "method">): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function clientKey(req: NextRequest, user: SessionUser | null) {
  if (user) return `u:${user.id}`;
  return `ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
}

export interface ApiContext<P> {
  req: NextRequest;
  db: Database;
  user: SessionUser;
  params: P;
}

interface RouteOptions {
  /** Default true. When false, `user` may be a placeholder and must not be used. */
  auth?: boolean;
  /** Apply the stricter limiter for expensive endpoints. */
  heavy?: boolean;
}

type Handler<P> = (ctx: ApiContext<P>) => Promise<Response | unknown>;

export function route<P extends Record<string, string> = Record<string, never>>(
  handler: Handler<P>,
  opts: RouteOptions = {},
) {
  return async (req: NextRequest, segment?: { params?: Promise<P> }): Promise<Response> => {
    try {
      if (!isSameOriginRequest(req)) throw new ApiError(403, "Cross-site request rejected", "csrf");
      const database = await db();
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const user = await getSessionUser(database, token);
      if (opts.auth !== false && !user) throw new ApiError(401, "Sign in required", "unauthenticated");
      const limiter = opts.heavy ? heavyLimiter : apiLimiter;
      const rl = limiter.check(`${opts.heavy ? "h" : "a"}:${clientKey(req, user)}`);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Too many requests", code: "rate_limited" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
      }
      const params = ((await segment?.params) ?? {}) as P;
      const result = await handler({ req, db: database, user: user as SessionUser, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid input",
        code: "validation",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message, code: "not_found" }, { status: 404 });
  }
  if (err instanceof CalculationError) {
    return NextResponse.json({ error: err.message, code: "calculation" }, { status: 422 });
  }
  if (err instanceof DatabaseUnavailableError) {
    return NextResponse.json({ error: err.message, code: "db_unavailable" }, { status: 503 });
  }
  const pgCode = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === "23505") {
    return NextResponse.json({ error: "A record with that name already exists", code: "conflict" }, { status: 409 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Internal server error", code: "internal" }, { status: 500 });
}

export async function parseJson<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON", "bad_json");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: z.ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function intParam(value: string | undefined, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) throw new ApiError(400, `Invalid ${name}`, "bad_param");
  return n;
}

export function csvResponse(filename: string, body: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
