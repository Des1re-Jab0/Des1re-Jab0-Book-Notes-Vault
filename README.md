# Book & Notes Vault

A small, accessible catalog for your books. Tag them, track how many pages are
waiting, keep reading notes, and search everything with real regular expressions.
Built with plain HTML, CSS and JavaScript modules. No frameworks, no build step.

- **Live site:** https://YOUR-GITHUB-USERNAME.github.io/book-notes-vault/
- **Demo video:** _add your unlisted link here_
- **Theme:** Book & Notes Vault

## Features

- **Dashboard:** total books, total pages with estimated reading time, top tag, longest book,
  a 7-day bar chart of pages added, and a page cap with a progress meter.
- **Page cap:** set a ceiling in Settings. The remaining/overage message is announced
  politely while you're under the cap and assertively once you go over.
- **Library:** table on tablet/desktop, cards on phones. Sort by title, author, pages,
  tag or date from the column headers or the "Sort by" menu.
- **Regex search:** live, case-insensitive by default (toggle "Match case"), limited to one
  field if you want. Invalid patterns show an inline message instead of crashing.
  Matches are wrapped in `<mark>`.
- **Inline editing:** edit a row in place (Enter saves, Esc cancels), or open "All fields"
  to edit ISBN and description in the full form. `updatedAt` changes only when something actually changed.
- **Delete with confirmation** through a native `<dialog>`.
- **Add form** with real-time validation, an error summary, and a helper that spots an ISBN
  pasted into the description and offers to fill it in.
- **Notebook (Notes page):** a reading notebook on lined paper with a red margin line. Pages are
  listed on the left; click one to open it on the paper and just write. Every page **autosaves**
  a moment after you stop typing (and straight away when you switch pages or leave), with a word
  count and a "Saved 12:10" status. A page can be linked to a book and a page number, or not.
  Search pages with regex (it also matches the linked book's title) and filter by book.
  Each book in the Library shows "2 notebook pages" linking straight to them. Deleting a book
  keeps its pages, just without the link, so nothing you wrote is lost.
- **Units:** reading pace (minutes per page) turns pages into minutes/hours. Choose which unit
  the library shows, and use the converter in Settings (pages ↔ minutes ↔ hours).
- **Tags:** editable list. New tags typed in the form are added automatically.
- **Persistence:** every change auto-saves to `localStorage`. Corrupt saved data is backed up
  and skipped instead of breaking the app.
- **Import/Export:** JSON export of books and notes, JSON import (merge or replace) with full
  validation and a readable error report, CSV export of books (escaped, formula-injection safe).
  A plain array of books (like `seed.json`) imports too, and leaves your notes alone.
- **Light/dark theme** that follows the system and can be toggled (saved).

