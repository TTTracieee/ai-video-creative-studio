import { NextRequest, NextResponse } from "next/server";
import { authorized, AUTH_COOKIE } from "@/lib/auth";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path === "/login" ||
    path === "/api/auth" ||
    path === "/api/health" ||
    path.startsWith("/_next/") ||
    path.startsWith("/mock/") ||
    path === "/favicon.ico"
  )
    return NextResponse.next();
  if (authorized(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  if (path.startsWith("/api/"))
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in to access this private studio." } },
      { status: 401 },
    );
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
