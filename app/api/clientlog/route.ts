// Endpoint diagnostico: riceve gli eventi del client logger e li stampa nei log
// del server (visibili nelle Functions di Vercel). Nessuna persistenza: serve
// solo a leggere cosa succede in PWA standalone su iOS, dove non c'è devtools.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.text();
    // Prefisso filtrabile nei log di Vercel: cerca "[clientlog]".
    console.log("[clientlog]", body);
  } catch {
    // ignora payload malformati
  }
  return new Response(null, { status: 204 });
}
