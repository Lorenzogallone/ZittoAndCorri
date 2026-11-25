import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale sizes (globals.css) must be declared here:
// without them, tailwind-merge mistakes `text-micro` & co. for colors and drops them
// when the same list has a `text-<color>`.
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
