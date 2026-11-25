import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: Middleware was renamed to Proxy (root `proxy.ts` file).
// Here we refresh the Supabase session on every request.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // All routes except static assets, images and PWA files (sw.js and
    // manifest must stay reachable even without a session, otherwise
    // service worker registration and PWA install fail).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
