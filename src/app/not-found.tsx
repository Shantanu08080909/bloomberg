import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="num text-[40px] font-semibold text-faint">404</p>
        <h1 className="text-[16px] font-semibold">Page not found</h1>
        <p className="mt-1 text-[12.5px] text-muted">That address does not exist in OpenFinance Terminal.</p>
        <Link href="/" className="mt-4 inline-block text-[12.5px] text-accent hover:underline">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
