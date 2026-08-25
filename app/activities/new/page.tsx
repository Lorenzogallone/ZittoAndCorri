import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ActivityForm } from "./activity-form";

export const maxDuration = 240;

export default async function NewActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      title="Nuova corsa"
      backHref="/activities"
      backLabel="Corse"
      hideTabBar
    >
      <p className="text-muted-foreground text-sm mb-6">
        Passo e zone sono calcolati in automatico.
      </p>
      <ActivityForm />
    </AppShell>
  );
}
