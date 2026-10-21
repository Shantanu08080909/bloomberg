"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { buttonClass, Field, inputClass } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "setup" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = mode !== "login";

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (creating && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(creating ? "/api/auth/setup" : "/api/auth/login", {
        body: creating ? { username, password, displayName: displayName || undefined } : { username, password },
      });
      router.push(safeNext);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Username" htmlFor="username">
        <input id="username" className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </Field>
      {creating ? (
        <Field label="Display name (optional)" htmlFor="displayName">
          <input id="displayName" className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        </Field>
      ) : null}
      <Field label="Password" htmlFor="password" hint={creating ? "At least 10 characters, with a letter and a number." : undefined}>
        <input
          id="password"
          type="password"
          className={inputClass}
          autoComplete={creating ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {creating ? (
        <Field label="Confirm password" htmlFor="confirm">
          <input id="confirm" type="password" className={inputClass} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-down/40 bg-down-soft px-2.5 py-1.5 text-[12px] text-down">
          {error}
        </p>
      ) : null}
      <button type="submit" className={buttonClass("primary")} disabled={busy || !username || !password}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
