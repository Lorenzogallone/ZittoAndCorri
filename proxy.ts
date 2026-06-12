import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: il Middleware è stato rinominato in Proxy (file `proxy.ts` di root).
// Qui rinfreschiamo la sessione Supabase a ogni richiesta.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Tutte le route tranne asset statici, immagini e file PWA (sw.js e
    // manifest devono restare raggiungibili anche senza sessione, altrimenti
    // registrazione del service worker e install della PWA falliscono).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
