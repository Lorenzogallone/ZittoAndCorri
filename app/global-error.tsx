"use client";

import { useSyncExternalStore } from "react";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/config";

// Last-resort fallback: catches root layout errors. It must render
// <html>/<body> by itself and can't use app components or next-intl
// (the provider lives in the layout that just failed): the dictionary is here.
const TEXT: Record<Locale, { title: string; body: string; retry: string }> = {
  it: { title: "Qualcosa è andato storto", body: "Errore imprevisto dell'applicazione.", retry: "Riprova" },
  en: { title: "Something went wrong", body: "Unexpected application error.", retry: "Try again" },
};

// The language doesn't change while the page is open: nothing to observe.
const subscribeNothing = () => () => {};

/** Language from the app cookie, otherwise from the browser's. */
function detectLocale(): Locale {
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];
  return resolveLocale(cookie, navigator.language);
}

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // On the server (and during hydration) Italian; then the browser's language.
  const locale = useSyncExternalStore(subscribeNothing, detectLocale, () => "it" as Locale);
  const text = TEXT[locale];

  return (
    <html lang={locale}>
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
        <p style={{ fontWeight: 600 }}>{text.title}</p>
        <p style={{ fontSize: 14, color: "#a1a1aa", margin: 0 }}>{text.body}</p>
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
          {text.retry}
        </button>
      </body>
    </html>
  );
}
