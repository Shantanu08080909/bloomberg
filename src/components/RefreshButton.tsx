"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Re-render the page from the database. It does not fetch from external providers. */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<string | null>(null);
  return (
    <button
      type="button"
      className={buttonClass("default", "sm")}
      onClick={() =>
        start(() => {
          router.refresh();
          setAt(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "medium" }).format(new Date()));
        })
      }
      title={at ? `Reloaded from the local database at ${at} IST` : "Reload this view from the local database"}
      disabled={pending}
    >
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
      {label}
    </button>
  );
}
