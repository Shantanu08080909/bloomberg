export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#1b1f23" />
            <path d="M6 22l6-7 5 4 9-11" fill="none" stroke="#4fb6b0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="text-[15px] font-semibold">OpenFinance Terminal</div>
            <div className="text-[11.5px] text-muted">Local research terminal for Indian markets</div>
          </div>
        </div>
        <div className="rounded-panel border border-line bg-panel p-5">{children}</div>
        <p className="mt-4 text-center text-[11px] text-faint">Runs on your computer. Accounts and data are stored in the local database.</p>
      </div>
    </div>
  );
}
