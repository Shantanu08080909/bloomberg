import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast redirect for signed-out visitors. This only checks that a session
 * cookie is present; the session itself is verified on the server for every
 * page render and API call.
 */
const PUBLIC_PREFIXES = ["/login", "/setup", "/register", "/api", "/_next", "/icon.svg", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p + "?"))) {
    return NextResponse.next();
  }
  if (!req.cookies.get("of_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
