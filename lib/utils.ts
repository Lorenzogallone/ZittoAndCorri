import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Le dimensioni della scala tipografica (globals.css) vanno dichiarate qui:
// senza, tailwind-merge scambia `text-micro` & co. per colori e li scarta
// quando nella stessa lista c'è un `text-<colore>`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display", "title", "heading", "body", "caption", "micro"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
