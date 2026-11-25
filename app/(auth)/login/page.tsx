"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RunnerMark } from "@/components/runner-mark";

/** Google "G" in the four official colors. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="size-4.5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const RESEND_SECONDS = 30;
// Google is shown unless explicitly disabled (self-hosters without a Google OAuth client).
const SHOW_GOOGLE = process.env.NEXT_PUBLIC_AUTH_GOOGLE !== "false";

export default function LoginPage() {
  const t = useTranslations("home.login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || sending || cooldown > 0) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      const code = error.code ?? "";
      if (error.status === 429 || code.includes("rate_limit")) {
        setError(t("errorRateLimit"));
        setCooldown(RESEND_SECONDS);
      } else if (code === "validation_failed" || code === "email_address_invalid") {
        setError(t("errorInvalidEmail"));
      } else {
        setError(t("errorGeneric"));
      }
      return;
    }
    setSentTo(address);
    setCooldown(RESEND_SECONDS);
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google.
  }

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-10 bg-background px-6 py-12">
      <div className="animate-enter flex flex-col items-center text-center">
        {/* "Ink" tile like the splash: the little figure in the primary color. */}
        <span className="flex h-32 w-32 items-center justify-center rounded-3xl bg-hero text-primary shadow-(--hero-shadow)">
          <RunnerMark size={96} cutout="var(--hero)" node="var(--hero-foreground)" />
        </span>
        <h1 className="mt-7 font-display text-display font-bold tracking-tight">
          Zitto e <span className="text-primary">Corri</span>
        </h1>
        <p className="mt-2 text-body text-muted-foreground">{t("tagline")}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        {sentTo ? (
          <div className="flex w-full flex-col items-center gap-3 text-center" role="status">
            <p className="text-body font-semibold">{t("checkEmailTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("checkEmailBody", { email: sentTo })}</p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled={sending || cooldown > 0}
              onClick={signInWithEmail}
            >
              {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              {t("changeEmail")}
            </Button>
          </div>
        ) : (
          <form onSubmit={signInWithEmail} className="flex w-full flex-col gap-3">
            <label htmlFor="login-email" className="sr-only">
              {t("emailLabel")}
            </label>
            <Input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              aria-invalid={error ? true : undefined}
              className="h-12 text-base"
            />
            <Button type="submit" size="lg" className="w-full" disabled={sending || cooldown > 0 || !email.trim()}>
              {sending ? t("sending") : cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("emailSignIn")}
            </Button>
          </form>
        )}
        {SHOW_GOOGLE && (
          <>
            <div className="flex w-full items-center gap-3 text-micro text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={signInWithGoogle}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {/* The "G" on a white disc stays readable with any primary color. */}
              <span className="flex size-6 items-center justify-center rounded-full bg-white">
                <GoogleIcon />
              </span>
              {loading ? t("redirecting") : t("signIn")}
            </Button>
          </>
        )}
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <p className="text-center text-micro text-muted-foreground">{t("footnote")}</p>
      </div>
    </main>
  );
}
