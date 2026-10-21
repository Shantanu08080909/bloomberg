"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(url: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { error?: string; issues?: { path: string; message: string }[] } | null;
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    const detail = d?.issues?.length ? `: ${d.issues.map((i) => (i.path ? `${i.path} — ${i.message}` : i.message)).join("; ")}` : "";
    throw new ClientApiError(`${d?.error ?? `Request failed (${res.status})`}${detail}`, res.status, d?.issues);
  }
  return data as T;
}

/** Minimal data-fetching hook with loading/error state and manual refresh. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url != null);
  const [tick, setTick] = useState(0);
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<T>(url, { signal: ctrl.signal })
      .then((d) => {
        if (urlRef.current === url) setData(d);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh, setData };
}

/** Download a server-generated CSV (keeps auth cookies, surfaces errors). */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
