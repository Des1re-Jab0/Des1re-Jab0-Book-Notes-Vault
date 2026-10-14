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

## Data model

A book (record):

```json
{
  "id": "rec_0001",
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "pages": 209,
  "tag": "Fiction",
  "dateAdded": "2026-10-10",
  "isbn": "9780435954239",
  "description": "Book club pick.",
  "createdAt": "2026-10-10T17:42:11.000Z",
  "updatedAt": "2026-10-10T17:42:11.000Z"
}
```

A notebook page (`bookId` is `""` when it isn't about a book, `page` is `null` when not given):

```json
{
  "id": "note_0001",
  "bookId": "rec_0001",
  "title": "Okonkwo and fear",
  "page": 13,
  "body": "His whole life was ruled by fear of failure.",
  "createdAt": "2026-10-13T09:55:55.243Z",
  "updatedAt": "2026-10-13T09:55:55.243Z"
}
```

Older saves used `notes` for the book description; they're still read and converted.
JSON exports look like `{ "records": [...], "notes": [...] }`.
More detail, wireframes and the accessibility plan are in [docs/spec.md](docs/spec.md).

## Regex catalog

All patterns live in [`scripts/validators.js`](scripts/validators.js).

| Field / use | Pattern | Passes | Fails |
|---|---|---|---|
| Title: no leading/trailing spaces | `^\S(?:.*\S)?$` | `Dune`, `C++ Primer` | ` Dune`, `Dune ` |
| Title/author: no double spaces | `\s{2,}` (must not match) | `War and Peace` | `War  and Peace` |
| Pages: whole number, no leading zeros | `^(?:0\|[1-9]\d*)$` (+ range 1 to 99,999) | `1`, `4215` | `007`, `12.5`, `-3` |
| Date added (YYYY-MM-DD) | `^\d{4}-(0[1-9]\|1[0-2])-(0[1-9]\|[12]\d\|3[01])$` (+ real-date check) | `2024-02-29` | `2025-02-29`, `2026-13-01` |
| Tag: letters, single spaces/hyphens | `^[A-Za-z]+(?:[ -][A-Za-z]+)*$` | `Non-Fiction`, `Science Fiction` | `Sci-Fi 2`, `Non--Fiction` |
| Author (Unicode letters) | `^\p{L}[\p{L}'’.-]*(?:(?:, \| & \| )\p{L}[\p{L}'’.-]*)*$` (flag `u`) | `Ngũgĩ wa Thiong'o`, `Le Guin, Ursula K.` | `R2 D2` |
| **Advanced:** ISBN with lookahead | `^(?:(?:\d[- ]?){9}[\dX]\|(?=97[89])(?:\d[- ]?){12}\d)$` (flag `i`) + checksum | `978-0-553-38016-3`, `080442005X` | `1234567890123`, bad check digit |
| **Advanced:** repeated word (back-reference) | `\b(\w+)\s+\1\b` (flag `i`) | flags `the the`, `The the` | ignores `the theory` |
| Settings: reading pace | `^(?:0\|[1-9]\d*)(?:\.\d{1,2})?$` | `2`, `1.5` | `1.555`, `.5` |
| Notebook: page number (optional) | `^(?:0\|[1-9]\d*)$` (+ at least 1) | `13`, empty | `12.5`, `0` |
| Notebook: tidy title on save | `/\s+/g` → one space, then trim | `"  Chapter   3 "` → `"Chapter 3"` | |
| Import: record / note id | `^rec_\d{4,}$`, `^note_\d{4,}$` | `rec_0001`, `note_0001` | `abc`, `rec_1` |

The repeated-word rule is a **warning**, not a blocking error: titles like
"Bora Bora" are legitimate, so you're told about it and can save anyway.
Notebook titles and page text get the same warning.

