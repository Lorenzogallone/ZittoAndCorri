import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Importa corsa" hideTabBar={false}>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Carica un file .gpx esportato da Strava, Garmin o Coros, oppure incolla
          un JSON ActivityInput.
        </p>
      </div>
      <ImportForm />
    </AppShell>
  );
}
