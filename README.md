# Beyond Bandwidth · Monthly Crossword

The office's monthly crossword: a static web app hosted on GitHub Pages, with no build step or backend.

## Features
- **Data-driven**: the grid, clues, edition, title and submission email all live in [`puzzle.json`](puzzle.json).
- **Desktop**: a large grid sits beside a scrolling clue panel. The active-clue bar stays pinned at the top, and keyboard shortcuts cover moving, switching direction, jumping to the next clue, and undo/redo.
- **Mobile**: the active-clue bar stays visible while typing, clues are tap-to-jump, and a Zoom button enlarges the grid.
- **Auto-save** for each month in `localStorage`. Player details carry over between months.
- **Submit**: checks the player's details and downloads a two-page A4 PDF (details and grid, then clues) to email to the organisers. The grid in the PDF is drawn as an image, so the letters always print clearly.

## Monthly update (short version)
1. Put the source PDF or grid image in `Miscc/<Month><Year>/` (git-ignored), plus a private `answers.json`.
2. Edit `puzzle.json`, and **change its `id`** (e.g. `2026-12`).
3. Validate: `node tools/validate-puzzle.js puzzle.json --answers Miscc/<Month><Year>/answers.json`
4. Preview with VS Code Live Server or `python -m http.server`, then test a PDF export with some letters filled in.
5. Push to `main`.

Full details, how the code works and known pitfalls are in **[agent.md](agent.md)**.

## Files
| File | Purpose |
|---|---|
| `index.html` / `style.css` / `script.js` | The app |
| `puzzle.json` | This month's puzzle |
| `tools/validate-puzzle.js` | Pre-publish checker for `puzzle.json` (dev tool, not used by the site) |
| `agent.md` | Maintainer guide |
