import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/login(.*)",
  "/signup(.*)",
  "/api/webhooks/(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/leads(.*)",
  "/bookings(.*)",
  "/targets(.*)",
  "/scripts(.*)",
  "/settings(.*)",
  "/reports(.*)",
  "/onboarding(.*)",
]);

// Security headers applied on every response
function addSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

// When Clerk keys are placeholder values, skip auth entirely so the app
// renders in dev without real credentials configured.
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  !clerkKey.includes("REPLACE_ME");

function passthroughMiddleware(request: NextRequest) {
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export default clerkConfigured
  ? clerkMiddleware(async (auth, request: NextRequest) => {
      if (isProtectedRoute(request)) {
        await auth.protect();
      }
      return addSecurityHeaders(NextResponse.next());
    })
  : passthroughMiddleware;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
