import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { countUsers } from "@/lib/auth/core";
import { DatabaseError } from "@/components/DatabaseError";
import { db, DatabaseUnavailableError } from "@/lib/server/db";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "First-time setup" };

export default async function SetupPage() {
  let users: number;
  try {
    users = await countUsers(await db());
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return <DatabaseError message={err.message} />;
    throw err;
  }
  if (users > 0) redirect("/login");
  return (
    <>
      <h1 className="text-[15px] font-semibold">Create the owner account</h1>
      <p className="mb-4 mt-1 text-[12px] text-muted">
        There are no default credentials. This account is stored only in your local database. The terminal starts in demo mode with
        synthetic data — no API keys needed.
      </p>
      <Suspense>
        <AuthForm mode="setup" />
      </Suspense>
    </>
  );
}
