import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EditActivityForm } from "./edit-form";
import type { Activity } from "@/lib/types";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Activity>();

  if (!activity) notFound();

  return (
    <AppShell
      title="Modifica attività"
      hideTabBar
      headerAction={
        <Button asChild variant="outline" size="sm">
          <Link href={`/activities/${activity.id}`} replace>
            Annulla
          </Link>
        </Button>
      }
    >
      <p className="text-muted-foreground text-sm mb-6">
        Modifica i dettagli del tuo allenamento. Passo e zone verranno ricalcolati.
      </p>
      <EditActivityForm activity={activity} />
    </AppShell>
  );
}
