import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getConfig } from "@/lib/config";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  if (getConfig().ALLOW_REGISTRATION !== "true") redirect("/login");
  return (
    <>
      <h1 className="mb-4 text-[15px] font-semibold">Create account</h1>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
