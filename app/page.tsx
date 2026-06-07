import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Difesa in profondità: il proxy già reindirizza, ma controlliamo anche qui
  // (più vicino al dato, come da auth doc di Next.js).
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">ZittoAndCorri</h1>
        <p className="text-muted-foreground text-sm">
          Sei autenticato come{" "}
          <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Esci
        </Button>
      </form>
    </main>
  );
}
