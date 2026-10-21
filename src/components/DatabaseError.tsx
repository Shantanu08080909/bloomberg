export function DatabaseError({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-md border border-down/40 bg-panel p-6">
      <h1 className="text-[16px] font-semibold text-fg">Database unavailable</h1>
      <p className="mt-2 text-[13px] text-dim">OpenFinance could not open its database, so it cannot show any data.</p>
      <pre className="mt-3 overflow-x-auto rounded bg-bg p-3 text-[11.5px] text-down">{message}</pre>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[12.5px] text-dim">
        <li>
          Embedded mode (no <code>DATABASE_URL</code>): make sure no other OpenFinance process is using <code>./data/pglite</code>, then run{" "}
          <code>npm run db:setup</code>.
        </li>
        <li>
          PostgreSQL mode: check that the server in <code>DATABASE_URL</code> is running and reachable (<code>npm run db:health</code>).
        </li>
        <li>See README → Troubleshooting for more.</li>
      </ul>
    </div>
  );
}
