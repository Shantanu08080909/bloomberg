"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/cn";

export function SaveButton({ articleId, saved: initial }: { articleId: number; saved: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={saved}
      onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          await apiFetch(`/api/news/${articleId}/save`, { method: saved ? "DELETE" : "POST" });
          setSaved(!saved);
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      className={cn("flex items-center gap-1 rounded px-1.5 py-1 text-[11px]", saved ? "text-demo" : "text-faint hover:text-fg", error && "text-down")}
      title={error ? "Could not update" : saved ? "Remove from saved articles" : "Save article"}
    >
      {saved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
