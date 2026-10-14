# M1: Spec, data model & wireframes

Personal library catalog to track what I own, what I'm reading and what is in queue.
A tag is placed on each book, and the books are counted, along with optional description. Separately,
the Notes page is a reading notebook: lined pages for notes, quotes and
Saves questions as you type, with an option to add a book and page for referencing. The vault should be capable of answering questions such as, “how much”
place my books in case I need to find them later?".questions like 'where will I find all my books if I want to read them later?', 'which tag dominates my shelf?', 'reading is waiting for me?'.
write down that quote?".

The entire thing is served via the browser. No accounts, no server, no frameworks.


## Sections

| Section   | What it does                                                                                          |
|-----------|-------------------------------------------------------------------------------------------------------|
| Dashboard | Book count, total pages (+ reading time), top tag, longest book, 7-day chart, page cap                |
| Library   | Table on desktop, cards on mobile. Regex search, sort, inline edit, delete, link to each book's notes |
| Notes     | Notebook: page list + lined paper, autosave, optional book/page link, regex search, filter, delete    |
| Add book  | Full form with live validation. Also used to edit ISBN/description                                    |
| Settings  | Reading pace, display unit, page cap, unit converter, tags, import/export                             |
| About     | Purpose, keyboard shortcuts, contact                                                                  |


Notebook.page:

```json
{
  "id": "note_0001",
  "bookId": "rec_0001",
  "title": "Pyscology of money",
  "page": 13,
  "body": "Huge lessons on investment",
  "createdAt": "2026-10-13T09:55:55.243Z",
  "updatedAt": "2026-10-13T09:55:55.243Z"
}
```


- `id`: `note_` + at least 4 digits
- `bookId`: a book's id, or `""` for a general note
- `page`: whole number, or `null` when not given
- `title` is tidied on save (spaces collapsed, "Untitled page" if empty); `body` keeps line
  breaks exactly as typed, may be empty (new page), up to 20,000 characters
- Pages autosave 600 ms after typing stops, and immediately when switching pages or leaving
- Deleting a book doesn't delete its pages: they just lose the book link

Settings are stored separately:

```json
{ "minutesPerPage": 2, "displayUnit": "pages", "pageCap": 10000, "tags": ["Fiction", "..."], "theme": "system" }
```

localStorage keys: `vault:records`, `vault:notes`, `vault:settings`, plus
`vault:records:backup` and `vault:notes:backup` (written only if saved data
turns out to be corrupt).

## Wireframes

Mobile (360px):

```
+------------------------------+
| [logo] Book & Notes Vault [◐]|
| (Dashboard)(Library)(Notes)  |
| (Add)(Settings)(About)       |
+------------------------------+
| Dashboard                    |
| +-----------+ +-----------+  |
| | BOOKS 13  | | PAGES 4.6k|  |
| +-----------+ +-----------+  |
| +--------------------------+ |
| | TOP TAG  Fiction         | |
| +--------------------------+ |
| | Pages added, last 7 days | |
| |  █                    █  | |
| |  █  ▄  ▄     ▆     ▃  █  | |
| | Mon Tue ...          Sun | |
| +--------------------------+ |
| | Page cap  [■■■■■□□□□□]   | |
| | 5,347 pages left         | |
| +--------------------------+ |
+------------------------------+

Library cards:
+--------------------------+
| Things Fall Apart        |
| description excerpt…     |
| 2 notes                  |
|--------------------------|
| AUTHOR  Chinua Achebe    |
| PAGES   209              |
| TAG     (Fiction)        |
| ADDED   Oct 10, 2026     |
| [Edit] [Delete]          |
+--------------------------+

Notebook (page list first, then the open page):
+--------------------------+
| [     + New page     ]   |
| Search pages [________]  |
| Show [All pages      v]  |
| > Chapter 3 thoughts     |
|   Favourite quotes       |
+--------------------------+
|  | Chapter 3 thoughts    |
|--|-----------------------|
|  | Book [v]   Page [46]  |
|  | Okonkwo is afraid of__|
|  | being like his father_|
|  |_______________________|
+--------------------------+
 23 words · Saved 12:10  [Delete page]
```

Desktop (1024px+):

```
+--------------------------------------------------------------+
| [logo] Book & Notes Vault [◐ Dark]  Dashboard Library Notes … |
+--------------------------------------------------------------+
| Library                                                      |
| +----------------------------------------------------------+ |
| | Regex search [______________]   Search in [v] Sort [v] [] | |
| +----------------------------------------------------------+ |
| TITLE ↕          AUTHOR ↕     PAGES ↕  TAG ↕    ADDED ↓       |
| Things Fall…     C. Achebe       209   Fiction  Oct 10  [E][D]|
| [title____]      [author__]   [209_]   [tag__]  [date_] [Save]|  <- inline edit
+--------------------------------------------------------------+

Notebook: page list on the left, lined paper on the right
+--------------------------------------------------------------+
| Notes                                                        |
| +--------------+  +----------------------------------------+ |
| | + New page   |  |   | Chapter 3 thoughts                 | |
| | Search [___] |  |---|------------------------------------| |
| | Show [All v] |  |   | Book [Decolonising v]  Page [46]   | |
| | > Chapter 3  |  |   | Okonkwo is afraid of being like____| |
| |   Quotes     |  |   | his father.________________________| |
| |   Ideas      |  |   |____________________________________| |
| +--------------+  +----------------------------------------+ |
|                     23 words · Saved 12:10    [Delete page]   |
+--------------------------------------------------------------+
```


## Breakpoints

No icon in theme toggle for base (bigger than 360px).
- 360px: two-column stat cards next to each other as a select
This is a real table with a sticky header, two-column form and settings.A real table with a sticky header, two-column form and settings.
- 1024px and above: nav in one row with the brand, 3 column form, search toolbar on one line,
  (the notebook is with you from 768px)

## Accessibility plan

- Headers, navigation, main content, sections per view, and footers. One `h1` (site name), `h2` per view, `h3` inside.
The focus is kept on the view's h2 while clicking to the next view, and on `h2` when the view changes.
Each form input is accompanied by an <label for>. Hints and errors are associated to each other in the following manner: hints are associated with `aria-describedby` and invalid fields are associated with `aria-invalid="true"`.
- Errors are not only in colour, but with one of the icons in front of the text.
- Live regions: toast (`role="status"`), result count, import report (`role="alert"`), page cap (polite under the cap, assertive over it).
- Table maintains semantics on mobile with explicit `role="table|row|cell"` and CSS turns ‘rows’ into ‘cards’.
- Sortable headers are buttons within th that have the attribute aria-sort.
There is a `<nav>` of buttons that contains the pages of the notebook, with the one that is open marked with `aria-current`. Autosave
  status is a polite live message modified only when it changes.
- Delete: Native <dialog> (esc closes, focus returns).
Colour-coding for a minimum contrast of 4.5:1 for 2 themes.
- `prefers-reduced-motion` turns animations off.

## Milestones

1. Spec & wireframes (this file)
2. Create a means to accomplish semantic HTML & base CSS.
3. Validators + `tests.html`
4. Highlight, sort and search 4. Render.
5. Mark regions on the page and view stats and chart.View stats and chart on page with live regions.
6. How to use local storage, import/export, settings, and units.
7. Read and record the temperature.9. Give the temperature to the person who is waiting.