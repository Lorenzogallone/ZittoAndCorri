"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deletePlannedWorkout } from "../actions";
import { Button } from "@/components/ui/button";

/**
 * "Delete workout" button with two-step confirmation and error feedback.
 * Mirror of the pattern used for runs (edit-form.tsx): an accidental submit
 * deletes nothing, and if the delete fails the user sees it instead of going back
 * to the plan believing it went through. On success the server
 * action redirects to /plan (that is the positive feedback).
 */
export function DeleteWorkoutButton({ workoutId }: { workoutId: string }) {
  const t = useTranslations("plan.detail.delete");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  if (!confirm) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
      >
        {t("button")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-center text-muted-foreground">
        {t("confirm")}
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
          {t("cancel")}
        </Button>
        <form
          className="flex-1"
          action={(fd) => {
            startDelete(async () => {
              try {
                await deletePlannedWorkout(fd);
              } catch {
                // The success redirect does not end up here (Next handles it):
                // an exception reaching here is a real failure.
                setError(t("error"));
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
            {isDeleting ? t("deleting") : t("yes")}
          </Button>
        </form>
      </div>
    </div>
  );
}
