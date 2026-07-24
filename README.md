# Trivia Crossword Platform

This is a **self-contained web app** for hosting a monthly crossword puzzle. It includes:
- A **landing page** (`index.html`) to collect participant info (Name, ID, Email, Mobile).
- A dynamic **Crossword page** that loads any puzzle from `crossword/data/puzzle.json`, renders the grid/clues, and supports keyboard navigation, auto-save, and submission with PDF export.

- **Session management** using browser `localStorage` to remember user data and progress.
