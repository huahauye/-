import { type NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return new NextResponse("Origin required", { status: 403 });
  }
  try {
    const allowed = new Set([request.nextUrl.origin]);
    if (process.env.APP_BASE_URL) allowed.add(new URL(process.env.APP_BASE_URL).origin);
    if (!allowed.has(new URL(origin).origin)) {
      return new NextResponse("Cross-origin request rejected", { status: 403 });
    }
  } catch {
    return new NextResponse("Invalid origin", { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
