import { EmptyState, LinkButton } from "@/components/ui";

export default function SecurityNotFound() {
  return (
    <EmptyState title="Security not found" action={<LinkButton href="/explorer">Browse securities</LinkButton>}>
      No instrument with that exchange and symbol exists in the active data source. Press <kbd className="rounded border border-line px-1">/</kbd> to search.
    </EmptyState>
  );
}
