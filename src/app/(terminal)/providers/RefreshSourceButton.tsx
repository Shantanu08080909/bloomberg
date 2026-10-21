"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

export function RefreshSourceButton({ sourceId, disabled, reason }: { sourceId: string; disabled?: boolean; reason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={buttonClass("default", "sm")}
        disabled={busy || disabled}
        title={disabled ? reason : "Fetch from this provider now"}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const { outcome } = await apiFetch<{ outcome: { status: string; message: string } }>(`/api/providers/${sourceId}/refresh`, { method: "POST" });
            setMsg({ ok: outcome.status !== "error", text: outcome.message });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh now
      </button>
      {msg ? <span className={`max-w-xs text-[11px] ${msg.ok ? "text-dim" : "text-down"}`}>{msg.text}</span> : null}
    </div>
  );
}
