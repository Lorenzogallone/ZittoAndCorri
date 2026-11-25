"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/haptics";

/** "Mark as done" button of the status form: haptic feedback on tap and,
 * when the session becomes done, a small pop of the check. */
export function MarkDoneButton({ done }: { done: boolean }) {
  const t = useTranslations("plan.detail");
  // Pop only on the switch to "done" happening here, not on every open.
  const [prevDone, setPrevDone] = useState(done);
  const [justDone, setJustDone] = useState(false);
  if (prevDone !== done) {
    setPrevDone(done);
    setJustDone(done);
  }

  return (
    <Button
      type="submit"
      variant={done ? "outline" : "default"}
      className="w-full"
      onClick={() => {
        if (!done) tap();
      }}
    >
      <Check size={16} className={justDone ? "animate-pop" : undefined} />
      {done ? t("markedDone") : t("markDone")}
    </Button>
  );
}
