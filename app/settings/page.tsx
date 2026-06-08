import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";
import { ApiKeySection } from "./api-key-section";
import { Button } from "@/components/ui/button";
import type { Profile, Goal } from "@/lib/types";
import { formatDistance, formatDuration, daysUntil } from "@/lib/format";
import { LogOut } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: activeGoal }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, max_hr, resting_hr, birthdate, api_key")
      .eq("id", user.id)
      .maybeSingle<Partial<Profile>>(),
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
  ]);

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Runner";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <AppShell title="Profilo">
      {/* Avatar & Name */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-lg">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-lg">{displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Profile Form */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Parametri atleta</h2>
        <p className="text-xs text-muted-foreground mb-5">
          HR max e a riposo servono per il calcolo delle zone.
        </p>
        <ProfileForm profile={profile ?? null} />
      </div>

      {/* Chiave API personale */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Integrazioni API</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Usa questa chiave per autenticare i tuoi script o Comandi Rapidi iOS su iPhone.
        </p>
        <ApiKeySection initialApiKey={profile?.api_key ?? null} />
      </div>

      {/* Guida Comandi Rapidi iOS */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <span>📲</span> Integrazione iPhone (Comandi Rapidi)
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configura il tuo iPhone per inviare corse a Zitto e Corri gratis.
        </p>
        
        <div className="space-y-4 text-xs">
          <div className="rounded-xl bg-muted/20 border border-white/[0.03] p-3.5">
            <h3 className="font-semibold text-foreground mb-1.5 flex items-center gap-1">
              <span>1.</span> Metodo Apple Health (Solo dati e cardio)
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Importa al volo l'ultimo allenamento di corsa salvato in Apple Health (registrato con Apple Watch, Strava o altre app). Non include la mappa.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground/90 pl-1">
              <li>Apri l'app <strong>Comandi Rapidi</strong> su iOS.</li>
              <li>Crea un nuovo comando: cerca l'azione <strong>"Trova allenamenti"</strong> (filtra per Corsa, ordina per data, limite 1).</li>
              <li>Aggiungi l'azione <strong>"Ottieni contenuto dell'URL"</strong>.</li>
              <li>Imposta come URL: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">https://[tuo-dominio]/api/import</code>.</li>
              <li>Usa il metodo <strong>POST</strong> ed aggiungi l'intestazione <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">Authorization: Bearer [tua_chiave_api]</code>.</li>
              <li>Passa i parametri in formato JSON (Dizionario): <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">started_at</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">distance_m</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">duration_s</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">avg_hr</code>.</li>
            </ol>
          </div>

          <div className="rounded-xl bg-muted/20 border border-white/[0.03] p-3.5">
            <h3 className="font-semibold text-foreground mb-1.5 flex items-center gap-1">
              <span>2.</span> Metodo File GPX (Mappa, grafici e split)
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Importa il file GPX completo (comprensivo di mappa GPS, grafici e split al km) condividendolo direttamente su iPhone.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground/90 pl-1">
              <li>Installa un'app gratuita per esportare GPX su iPhone (es. <strong>WorkoutGPX</strong> o <strong>GPX Export</strong>) oppure usa <strong>WorkOutDoors</strong>.</li>
              <li>Esporta la corsa in formato GPX e tocca <strong>Condividi</strong>.</li>
              <li>Crea un Comando Rapido abilitato nel foglio di condivisione per i file GPX.</li>
              <li>Imposta il comando per leggere il file condiviso come testo ed effettuare un <strong>POST</strong> a: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">https://[tuo-dominio]/api/import/gpx</code>.</li>
              <li>Usa l'intestazione <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">Authorization: Bearer [tua_chiave_api]</code> e invia il JSON: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">{"{ \"gpx\": testo_gpx, \"notes\": \"Importato da iPhone\" }"}</code>.</li>
            </ol>
            <p className="text-[10px] text-primary mt-2 font-medium">
              💡 Trovi i dettagli precisi per creare questi comandi passo-passo nel file <code className="bg-muted px-1 py-0.5 rounded font-mono">INSTRUCTIONS.md</code> nella cartella del progetto.
            </p>
          </div>
        </div>
      </div>

      {/* Obiettivo */}
      <Link href="/goals" className="block mb-6">
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 transition-colors active:scale-[0.98] hover:border-white/[0.12]" style={{ transition: 'transform 0.15s, border-color 0.15s' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Obiettivo attivo</h2>
            <span className="text-muted-foreground/50 text-xl leading-none">›</span>
          </div>
          {activeGoal ? (
            <div>
              <p className="font-medium">{activeGoal.race_name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatDistance(activeGoal.distance_m)}
                {activeGoal.target_time_s && ` · Target ${formatDuration(activeGoal.target_time_s)}`}
              </p>
              {activeGoal.race_date && (() => {
                const d = daysUntil(activeGoal.race_date);
                return (
                  <p className="text-sm text-primary font-medium mt-1">
                    {d === 0 ? "Oggi!" : d === 1 ? "1 giorno al via" : `${d} giorni al via`}
                    {" · "}{new Date(activeGoal.race_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun obiettivo impostato — tocca per aggiungerne uno.
            </p>
          )}
        </div>
      </Link>

      {/* Logout */}
      <div className="separator my-4" />
      <form action={signOut} className="flex justify-center">
        <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <LogOut size={16} />
          Esci
        </Button>
      </form>

      {/* Discrete version info and logo branding */}
      <div className="mt-12 flex flex-col items-center justify-center gap-2 opacity-40 text-[11px] text-muted-foreground pb-6">
        <img
          src="/logo.png"
          alt="Zitto e Corri Logo"
          className="w-6 h-6 rounded object-cover filter grayscale dark:invert dark:hue-rotate-180"
        />
        <span>Zitto e Corri v0.1.0</span>
      </div>
    </AppShell>
  );
}
