import { NextResponse, type NextRequest } from "next/server";

/** The dashboard shows private health conversations, so it needs a password (user: admin). */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return new NextResponse("Set DASHBOARD_PASSWORD to use the dashboard.", { status: 503 });
  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const [user, ...rest] = atob(encoded).split(":");
      if (user === "admin" && rest.join(":") === password) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse("Sign in required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Afya dashboard"' } });
}

export const config = { matcher: ["/dashboard/:path*", "/api/conversations/:path*"] };
