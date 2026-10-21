"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

export default function TerminalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto mt-12 max-w-lg rounded-panel border border-down/40 bg-panel p-5">
      <h1 className="text-[15px] font-semibold">{offline ? "You appear to be offline" : "This view could not be loaded"}</h1>
      <p className="mt-1 text-[12.5px] text-dim">
        {offline
          ? "The terminal runs on this computer, but your browser reports no network connection to it."
          : "Something failed while loading data for this page. Other sections are unaffected."}
      </p>
      {error.digest ? <p className="num mt-2 text-[11px] text-faint">Reference: {error.digest}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" className={buttonClass("primary", "sm")} onClick={reset}>
          Try again
        </button>
        <Link href="/" className={buttonClass("ghost", "sm")}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
