<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design and UX rules

Skills in `.claude/skills/`: `mobile-native` and `apple-design` (Emil Kowalski),
`web-design-guidelines` (Vercel). Use `mobile-native` for anything touching
layout, forms or gestures; run `web-design-guidelines` on changed UI files
before a merge. When they disagree:

- Copy is Italian, sentence case everywhere (overrides Vercel's Title Case).
- `overscroll-behavior: none` stays global: the app is a standalone iOS PWA.
- Tailwind `hover:` is already gated behind `(hover: hover)`; never write raw `:hover` CSS.
- Design tokens live in `app/globals.css` (`@theme`): no new hex colours or font sizes in components.
- Target device: iPhone 15 Pro as an installed PWA (393×852 pt, Dynamic Island, iOS 26).
