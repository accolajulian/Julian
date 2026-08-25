import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

// Edits is a separate app living in this repo — it uses Supabase Auth
// directly (not Clerk), so its routes are excluded from isProtectedRoute
// above and handled by refreshEditsSession() instead.
const isEditsRoute = createRouteMatcher(["/edits(.*)"]);

// Security headers applied on every response
function addSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

// Refreshes the Supabase Auth session cookie for /edits routes on every
// request. Required by @supabase/ssr — without this, expired access tokens
// never get refreshed in Server Components.
async function refreshEditsSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return addSecurityHeaders(response);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return addSecurityHeaders(response);
}

// When Clerk keys are placeholder values, skip auth entirely so the app
// renders in dev without real credentials configured.
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  !clerkKey.includes("REPLACE_ME");

function passthroughMiddleware(request: NextRequest) {
  if (isEditsRoute(request)) return refreshEditsSession(request);
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export default clerkConfigured
  ? clerkMiddleware(async (auth, request: NextRequest) => {
      if (isEditsRoute(request)) return refreshEditsSession(request);
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
