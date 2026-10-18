# Book & Notes Vault

A small, accessible catalog for your books. Tag them, track how many pages are
waiting, keep reading notes, and search everything with real regular expressions.
Built with plain HTML, CSS and JavaScript modules. No frameworks, no build step.

- **Live site:** https://des1re-jab0.github.io/Des1re-Jab0-Book-Notes-Vault/
- **Demo video:**[https://drive.google.com/file/d/1sEj5TPCiK7yBCtYllSRRGz7hzMZdedeH/view?usp=sharing]
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

**In short:** 8 validation rules check every form field as you type, plus 2 advanced rules
(a lookahead and a back-reference). Errors appear inline under the field and block saving;
warnings appear in amber and don't. All patterns live in
[`scripts/validators.js`](scripts/validators.js) and are tested in [`tests.html`](tests.html).

### Basic rules (block saving)

| Field | Pattern | In plain words | Passes | Fails |
|---|---|---|---|---|
| Title | `^\S(?:.*\S)?$` and no `\s{2,}` | No spaces at the start or end, no double spaces | `Dune`, `C++ Primer` | ` Dune`, `War  and Peace` |
| Pages | `^(?:0\|[1-9]\d*)$` | Whole number 1–99,999, no leading zeros | `1`, `4215` | `007`, `12.5`, `-3` |
| Date added | `^\d{4}-(0[1-9]\|1[0-2])-(0[1-9]\|[12]\d\|3[01])$` | `YYYY-MM-DD`, and a real calendar date | `2024-02-29` | `2025-02-29`, `2026-13-01` |
| Tag | `^[A-Za-z]+(?:[ -][A-Za-z]+)*$` | Letters; words joined by one space or hyphen | `Non-Fiction`, `Science Fiction` | `Sci-Fi 2`, `Non--Fiction` |
| Author | `^\p{L}[\p{L}'’.-]*(?:(?:, \| & \| )\p{L}[\p{L}'’.-]*)*$` (flag `u`) | Letters from any language; co-authors joined by `, ` or ` & ` | `Ngũgĩ wa Thiong'o`, `Le Guin, Ursula K.` | `R2 D2` |
| Reading pace | `^(?:0\|[1-9]\d*)(?:\.\d{1,2})?$` | Number with at most 2 decimals | `2`, `1.5` | `1.555`, `.5` |
| Notebook page no. | `^(?:0\|[1-9]\d*)$` | Optional; whole number from 1 | `13`, empty | `12.5`, `0` |
| Import ids | `^rec_\d{4,}$`, `^note_\d{4,}$` | Book and notebook-page id format | `rec_0001`, `note_0001` | `abc`, `rec_1` |

### Advanced rules

| Rule | Pattern | How it works | Passes | Fails |
|---|---|---|---|---|
| **ISBN (lookahead)** | `^(?:(?:\d[- ]?){9}[\dX]\|(?=97[89])(?:\d[- ]?){12}\d)$` (flag `i`) | 10 digits (last may be `X`), or 13 digits that must start with 978/979. `(?=97[89])` checks the start without consuming it. A check-digit test runs afterwards. | `978-0-553-38016-3`, `080442005X` | `1234567890123`, wrong check digit |
| **Repeated word (back-reference)** | `\b(\w+)\s+\1\b` (flag `i`) | `(\w+)` captures a word; `\1` means "that same word again" | flags `the the`, `The the` | ignores `the theory` |

The repeated-word rule is a **warning**, not an error: real titles like "Bora Bora" exist, so
you're told and can still save. It also runs on notebook titles and page text.

### Search patterns to try

Library search (set "Search in" where noted):

| Pattern                               | Finds                                                           |
|---                                    |---                                                              |
| `^the\b`                              | Titles starting with "The" (case-insensitive)                   |
| `\b(\w+)\s+\1\b`                      | Repeated words, e.g. "the the" in a description                 |
| `(\w+) & \w+ \1\b` (in Author)        | Co-authors sharing a surname: "Emily Bronte & Charlotte Bronte" |
| `\b97[89]\d{10}\b`                    | Books with an ISBN-13                                           |
| `(?<=ISBN )[\d-]+X?` (in Description) | ISBNs mentioned in descriptions (lookbehind)                    |
| `\b\d{2}:\d{2}\b`                     | Times written in descriptions, e.g. 18:30                       |
| `\+\+`                                | Escaped special characters: finds "C++ Primer"                  |
| `(unclosed`                           | Invalid on purpose: shows an error, nothing breaks              |


## Keyboard map

| Key                                              | Action                                                      |
|---                                               |---                                                          |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | Move between controls                                       |
| <kbd>Enter</kbd> / <kbd>Space</kbd>              | Activate buttons, links, column sort                        |
| <kbd>/</kbd>                                     | Jump to the search box (from anywhere outside a text field) |
| <kbd>N</kbd>                                     | Open the Add book form                                      |
| <kbd>Enter</kbd> (in a row being edited)         | Save the row                                                |
| <kbd>Esc</kbd> (in a row being edited)           | Cancel the edit                                             |
| <kbd>Esc</kbd> (in a dialog)                     | Close the dialog without deleting                           |

The first <kbd>Tab</kbd> on the page reveals a "Skip to main content" link.

## Accessibility notes

- Landmarks (`header`, `nav`, `main`, `section`, `footer`) and a clean heading order:
  one `h1`, an `h2` per view, `h3` inside.
- Changing views moves focus to the new view's heading, so screen reader users hear where they landed.
- Every input has a visible `<label>`. Hints and errors are tied in with `aria-describedby`,
  and invalid fields get `aria-invalid`. Errors use text and an icon, not only colour.
- Live regions: the toast (`role="status"`), the search result counts (books and notes), the
  import report (`role="alert"`), and the page cap (polite under the cap, assertive when over).
- The notebook's page list is a `<nav aria-label="Notebook pages">` of buttons; the open page is
  marked with `aria-current="true"`. The title, page text, book and page number all have labels,
  and autosave reports "Saving…" / "Saved" through a polite status message (written only when it
  changes, so typing doesn't flood a screen reader). Enter in the title moves to the page text.
- On phones the table is restyled as cards, but explicit `role="table|row|cell|columnheader"`
  keeps it a table for assistive tech.
- Sortable headers are real buttons with `aria-sort` on the `th`.
- Highlighting builds DOM nodes (`<mark>`) instead of injecting HTML, so a title like
  `<script>` stays text and sentences are read normally.
- Focus is always visible (3px outline in a colour that contrasts in both themes).
- Text colours meet WCAG AA (4.5:1) in light and dark themes. Checked with the WebAIM contrast checker.
- Touch targets are at least 44px tall for primary controls.
- `prefers-reduced-motion` disables the view fade, bar growth and row flash.

## Running locally

ES modules don't load from `file://`, so serve the folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Any static server works (VS Code Live Server, `npx serve`, …).
Click **Load sample books** to load [`seed.json`](seed.json) (13 records with edge cases:
leap day, 1-page and 4,215-page books, Unicode names, regex special characters,
duplicate words, ISBNs hidden in descriptions). Loading samples never touches your notes.

## Tests

- In the browser: open [`tests.html`](tests.html) (also linked in the app footer).
  It runs 107 assertions on the validators, regex compiler, highlighting, sorting,
  stats, cap logic, unit conversion, CSV escaping, import validation, and the notebook
  (validation, search, filters, ordering, export/import round-trip, old-data migration).
- In a terminal (Node 22+):

```bash
node tests/tests.js
```

## Project structure

```
index.html          app shell, all six views
tests.html          browser test page
seed.json           13 sample records
styles/main.css     mobile-first styles, light/dark tokens
scripts/
  main.js           routing, events, glue
  state.js          records, notes + settings, change notifications
  storage.js        localStorage load/save with recovery
  validators.js     every regex rule + record/import validation
  search.js         safe regex compiler, filter, highlight, sort
  stats.js          dashboard numbers, 7-day trend, cap status
  units.js          pages ↔ minutes ↔ hours
  io.js             JSON/CSV export, file reading, import parsing
  ui.js             DOM rendering helpers
tests/tests.js      assertions used by tests.html
assets/favicon.svg
docs/spec.md        M1 spec, wireframes, a11y plan
```




## References

- MDN Web Docs: [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog),
  [`aria-sort`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-sort),
  [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions),
  [Regular expressions guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) for colour checks
- The `compileRegex`, `highlight` and storage helpers grew out of the starter snippets in the
  assignment brief.
- ISBN check-digit rules: ISBN-10 weights 10 to 1 (mod 11), ISBN-13 alternating 1/3 (mod 10).
  ISBNs in `seed.json` are checksum-valid sample values.

## Contact

- GitHub: [Des1re-Jab0](https://github.com/Des1re-Jab0)
- Email: d.manzijabo@alustudent.com
