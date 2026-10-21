import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatIST } from "@/lib/dates";

export interface NewsItemDTO {
  id: number;
  title: string;
  summary: string | null;
  url: string | null;
  publisher: string;
  publishedAt: Date | string;
  categories: string[];
  tickers: string[];
  isSample: boolean;
}

export function NewsList({ items, compact = false }: { items: NewsItemDTO[]; compact?: boolean }) {
  if (items.length === 0) return <p className="px-3 py-6 text-center text-[12px] text-muted">No articles.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className="px-3 py-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[12.5px] font-medium text-fg hover:text-accent-strong">
                  {n.title} <ExternalLink className="mb-0.5 inline size-3 text-faint" aria-label="(opens original article)" />
                </a>
              ) : (
                <span className="text-[12.5px] font-medium text-fg">{n.title}</span>
              )}
              {!compact && n.summary ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{n.summary}</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
                {n.isSample ? <Badge tone="demo">Sample</Badge> : null}
                <span>{n.publisher}</span>
                <span>·</span>
                <time dateTime={new Date(n.publishedAt).toISOString()}>{formatIST(n.publishedAt)} IST</time>
                {n.tickers.slice(0, 3).map((t) => (
                  <span key={t} className="num text-accent">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
