# @myeongha/web

MyeongHa web UI. Existing multi-page URLs are being migrated incrementally to React and TypeScript with Vite while the current HTML, CSS, authentication, and API contracts remain active.

## Run

From the repository root:

```bash
npm run dev
```

Then open `http://localhost:4173`.

`npm run build:web` produces the Vercel static artifact in `public/`. Hall is the first React entry; the remaining pages continue to use their existing ES module entry points until each page is migrated.

## Implemented UI flow

- `index.html` — world landing; Saju-first entry with representative preview
- `hall.html` — returning Hall / guest first-encounter variation
- `chat.html` — relationship-first conversation, protected Reading seam, memory-scope choice
- `birth.html` — birth-profile input flow; demo-only, no persistence
- `reading.html` — desktop Chat + grounded Reading split view; responsive stack on mobile
- `records.html` — 명식록 / 현세록 / 인연록 management prototype

## UI invariants

- All character visuals/names are non-canon placeholders (`John Doe 01`–`05`).
- Demo pillar labels and Reading copy are not Saju Engine output and are explicitly marked as samples/placeholders.
- Character framing and grounded Saju-bearing blocks use separate visual treatment.
- Memory scope is user-selected; this prototype does not persist it.
- Day/night changes lighting/theme only; it does not imply a change in Saju meaning.
- Hall is a return/resume surface, not a recommendation dashboard or gamified lobby.

This prototype is intended to freeze the interaction grammar before Character Content/Art and a production web framework are selected.
