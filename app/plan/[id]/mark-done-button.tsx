"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/haptics";

/** Bottone "Segna come fatta" del form di stato: vibrazione al tocco e,
 *  quando la seduta diventa fatta, un piccolo pop del check. */
export function MarkDoneButton({ done }: { done: boolean }) {
  // Pop solo sul passaggio a "fatta" avvenuto qui, non a ogni apertura.
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
      {done ? "Segnata come fatta · annulla" : "Segna come fatta"}
    </Button>
  );
}
