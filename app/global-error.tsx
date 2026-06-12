"use client";

// Fallback estremo: cattura gli errori del root layout. Deve renderizzare
// <html>/<body> da solo e non può usare componenti dell'app.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          background: "#121214",
          color: "#e4e4e7",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <p style={{ fontWeight: 600 }}>Qualcosa è andato storto</p>
        <p style={{ fontSize: 14, color: "#a1a1aa", margin: 0 }}>
          Errore imprevisto dell&apos;applicazione.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 12,
            border: "1px solid #3f3f46",
            background: "transparent",
            color: "#e4e4e7",
            cursor: "pointer",
          }}
        >
          Riprova
        </button>
      </body>
    </html>
  );
}
