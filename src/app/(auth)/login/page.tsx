import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { countUsers } from "@/lib/auth/core";
import { getConfig } from "@/lib/config";
import { DatabaseError } from "@/components/DatabaseError";
import { db, DatabaseUnavailableError } from "@/lib/server/db";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  let users: number;
  try {
    users = await countUsers(await db());
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return <DatabaseError message={err.message} />;
    throw err;
  }
  if (users === 0) redirect("/setup");
  return (
    <>
      <h1 className="mb-4 text-[15px] font-semibold">Sign in</h1>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
      {getConfig().ALLOW_REGISTRATION === "true" ? (
        <p className="mt-4 text-[12px] text-muted">
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      ) : null}
    </>
  );
}
