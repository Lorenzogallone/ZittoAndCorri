"use client";

import { useState, useTransition } from "react";
import { deletePlannedWorkout } from "../actions";
import { Button } from "@/components/ui/button";

/**
 * Bottone "Elimina allenamento" con conferma a due step e feedback d'errore.
 * Mirror del pattern usato per le corse (edit-form.tsx): un submit accidentale
 * non cancella nulla, e se il delete fallisce l'utente lo vede invece di tornare
 * al piano credendo che sia andato a buon fine. In caso di successo la server
 * action fa redirect a /plan (è quello il feedback positivo).
 */
export function DeleteWorkoutButton({ workoutId }: { workoutId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  if (!confirm) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
      >
        Elimina allenamento
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-center text-muted-foreground">
        Sei sicuro di voler eliminare questo allenamento? L&apos;operazione non è
        reversibile.
      </p>
      {error && (
        <p className="text-destructive text-sm text-center" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={isDeleting}
          onClick={() => setConfirm(false)}
        >
          Annulla
        </Button>
        <form
          className="flex-1"
          action={(fd) => {
            startDelete(async () => {
              try {
                await deletePlannedWorkout(fd);
              } catch {
                // Il redirect di successo non finisce qui (lo gestisce Next):
                // un'eccezione che arriva fin qui è un fallimento reale.
                setError("Errore durante l'eliminazione. Riprova.");
              }
            });
          }}
        >
          <input type="hidden" name="id" value={workoutId} />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={isDeleting}
          >
            {isDeleting ? "Eliminazione..." : "Sì, elimina"}
          </Button>
        </form>
      </div>
    </div>
  );
}
