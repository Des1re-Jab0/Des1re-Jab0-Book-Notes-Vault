// App entry point: routing, event wiring, and glue between state and UI.

import * as state from './state.js';
import {
  validateField, validateBook, validatePace, validateCap, extractIsbns, patterns,
  validateNoteField, tidyTitle,
} from './validators.js';
import { compileRegex, filterRecords, sortRecords, filterNotes, sortNotes } from './search.js';
import { computeStats, capStatus, toISODate } from './stats.js';
import { convert, round, formatDuration } from './units.js';
import * as io from './io.js';
import * as ui from './ui.js';

const { $, $$ } = ui;

const VIEWS = {
  dashboard: 'Dashboard',
  library: 'Library',
  notes: 'Notes',
  add: 'Add book',
  settings: 'Settings',
  about: 'About',
};

// UI-only state (not persisted)
const view = {
  query: '',
  field: 'all',
  caseSensitive: false,
  sortKey: 'dateAdded',
  sortDir: 'desc',
  editingId: null,
  flashId: null,
  noteBook: 'any', // notebook filter: 'any', '' (pages without a book) or a book id
};

let search = compileRegex('');
let noteSearch = compileRegex('');
let lastCapMessage = null;
let pendingFocus = null;

/* ---------- routing ---------- */

function routeFromHash() {
  const name = location.hash.slice(1);
  return name in VIEWS ? name : null;
}

function showView(name, { moveFocus = true } = {}) {
  for (const section of $$('.view')) section.classList.toggle('is-active', section.id === name);
  for (const link of $$('.nav-list a')) {
    if (link.getAttribute('href') === `#${name}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${VIEWS[name]} · Book & Notes Vault`;

  if (!moveFocus) return;
  const target = (pendingFocus && $(pendingFocus)) || $(`#${name} h2`);
  pendingFocus = null;
  target.focus({ preventScroll: true });
  // wait a frame so this wins over the browser's jump to the #fragment
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    if (target.tagName !== 'H2') target.scrollIntoView({ block: 'center' });
  });
}

function go(name, focusSelector) {
  pendingFocus = focusSelector || null;
  if (routeFromHash() === name) showView(name);
  else location.hash = name;
}

window.addEventListener('hashchange', () => {
  const name = routeFromHash();
  if (name) showView(name);
});

document.addEventListener('click', e => {
  const link = e.target.closest('a[data-focus]');
  if (link) pendingFocus = `#${link.dataset.focus}`;
});

/* ---------- rendering ---------- */

function noteCountsByBook() {
  const counts = new Map();
  for (const n of state.getNotes()) {
    if (n.bookId) counts.set(n.bookId, (counts.get(n.bookId) || 0) + 1);
  }
  return counts;
}

const bookTitle = id => (id && state.findRecord(id)?.title) || '';

function renderLibrary() {
  const settings = state.getSettings();
  const all = state.getRecords();
  const visible = sortRecords(filterRecords(all, search.tester, view.field), view.sortKey, view.sortDir);

  ui.renderTable(visible, {
    re: search.re,
    tester: search.tester,
    editingId: view.editingId,
    flashId: view.flashId,
    unit: settings.displayUnit,
    pace: settings.minutesPerPage,
    noteCounts: noteCountsByBook(),
  });
  view.flashId = null;

  ui.updateSortHeaders(view.sortKey, view.sortDir);
  $('#sort-select').value = `${view.sortKey}:${view.sortDir}`;

  $('.table-wrap').hidden = visible.length === 0;
  $('#empty-library').hidden = all.length > 0;
  $('#empty-search').hidden = !(all.length && !visible.length);

  const count = $('#result-count');
  if (!all.length) setLiveText(count, '');
  else if (search.tester) setLiveText(count, `${visible.length} of ${all.length} books match.`);
  else setLiveText(count, `${all.length} ${all.length === 1 ? 'book' : 'books'}.`);
}

function renderDashboard({ announce = true } = {}) {
  const settings = state.getSettings();
  const stats = computeStats(state.getRecords());
  $('#dash-empty').hidden = stats.total > 0;
  ui.renderStats(stats, settings, state.getNotes().length);
  ui.renderTrend(stats.trend);

  const cap = capStatus(stats.totalPages, settings.pageCap);
  ui.renderCap(cap);

  const message = ui.capMessage(cap);
  if (announce && message !== lastCapMessage && cap.level !== 'off') {
    const polite = $('#cap-live-polite');
    const assertive = $('#cap-live-assertive');
    polite.textContent = '';
    assertive.textContent = '';
    (cap.level === 'over' ? assertive : polite).textContent = message;
  }
  lastCapMessage = message;
}

function renderSettings() {
  const used = state.getRecords().map(r => r.tag);
  ui.renderTags(state.getSettings().tags, used);
  updatePagesHint();
  updateConverter();
}

// Live regions re-announce on every write, and autosave re-renders a lot,
// so only write when the text actually changes.
function setLiveText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function renderNotesView() {
  const books = state.getRecords();
  ui.fillBookSelect($('#nb-book'), books, [['', 'No book']]);
  ui.fillBookSelect($('#notes-book'), books, [['any', 'All pages'], ['', 'Pages without a book']]);
  view.noteBook = $('#notes-book').value; // falls back to "all" if the filtered book was deleted

  const all = state.getNotes();
  const visible = visiblePages();

  // nothing open (first visit, or the open page was deleted): open the top page
  if (!state.findNote(notebook.openId)) {
    notebook.openId = null;
    if (visible.length) loadPage(visible[0]);
  }
  ui.renderPageList(visible, { re: noteSearch.re, bookTitle, openId: notebook.openId });

  $('#nb-editor').hidden = !notebook.openId;
  $('#notes-empty').hidden = all.length > 0;
  $('#notes-empty-search').hidden = !(all.length && !visible.length);

  const filtering = Boolean(noteSearch.tester) || view.noteBook !== 'any';
  setLiveText($('#notes-count'), !all.length
    ? ''
    : filtering
      ? `Showing ${visible.length} of ${all.length} pages.`
      : `${all.length} ${all.length === 1 ? 'page' : 'pages'}.`);
}

function renderAll(opts) {
  renderLibrary();
  renderDashboard(opts);
  renderSettings();
  renderNotesView();
}

/* ---------- search & sort ---------- */

const searchInput = $('#search-input');
let searchTimer;

function applySearch() {
  view.query = searchInput.value;
  search = compileRegex(view.query, { caseSensitive: view.caseSensitive });
  $('#search-error').textContent = search.error;
  searchInput.setAttribute('aria-invalid', search.error ? 'true' : 'false');
  renderLibrary();
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 150);
});

$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(searchTimer);
  applySearch();
});

$('#search-case').addEventListener('change', e => {
  view.caseSensitive = e.target.checked;
  applySearch();
});

$('#search-field').addEventListener('change', e => {
  view.field = e.target.value;
  renderLibrary();
});

$('#clear-search').addEventListener('click', () => {
  searchInput.value = '';
  applySearch();
  searchInput.focus();
});

$('#sort-select').addEventListener('change', e => {
  [view.sortKey, view.sortDir] = e.target.value.split(':');
  renderLibrary();
});

$('#records-table thead').addEventListener('click', e => {
  const btn = e.target.closest('[data-sort]');
  if (!btn) return;
  const key = btn.dataset.sort;
  if (view.sortKey === key) {
    view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    view.sortKey = key;
    // dates read best newest-first, everything else starts ascending
    view.sortDir = key === 'dateAdded' ? 'desc' : 'asc';
  }
  renderLibrary();
});

/* ---------- inline editing & delete ---------- */

const INLINE_FIELDS = ['title', 'author', 'pages', 'tag', 'dateAdded'];

function rowButton(id, action) {
  return $(`#records-body tr[data-id="${id}"] [data-action="${action}"]`);
}

function startEdit(id) {
  view.editingId = id;
  renderLibrary();
  $('#edit-title')?.focus();
}

function cancelEdit() {
  const id = view.editingId;
  view.editingId = null;
  renderLibrary();
  rowButton(id, 'edit')?.focus();
}

function saveInline(row) {
  const id = row.dataset.id;
  const values = {};
  let firstBad = null;

  for (const field of INLINE_FIELDS) {
    const input = row.querySelector(`[name="${field}"]`);
    const res = validateField(field, input.value);
    ui.setFieldMessage(input, res);
    if (res.ok) values[field] = res.value;
    else firstBad ||= input;
  }
  if (firstBad) {
    firstBad.focus();
    ui.toast('Fix the highlighted field before saving.', 'error');
    return;
  }

  const before = state.findRecord(id);
  view.editingId = null;
  view.flashId = id;
  const after = state.updateRecord(id, values);
  if (after === before) renderLibrary(); // nothing changed, so no render was triggered
  ui.toast(after === before ? 'No changes to save.' : `Saved “${after.title}”.`);
  rowButton(id, 'edit')?.focus();
}

async function confirmDelete(id) {
  const rec = state.findRecord(id);
  if (!rec) return;
  const linked = noteCountsByBook().get(id) || 0;
  const keepNotes = linked
    ? ` Its ${linked} notebook ${linked === 1 ? 'page stays' : 'pages stay'} in your notebook, just without the book link.`
    : '';
  const yes = await ui.confirmDialog({
    title: 'Delete this book?',
    text: `“${rec.title}” by ${rec.author} will be removed from your vault. This can't be undone.${keepNotes}`,
    confirmLabel: 'Delete book',
  });
  if (!yes) {
    rowButton(id, 'delete')?.focus();
    return;
  }

  // work out where focus should land once the row is gone
  const rows = $$('#records-body tr');
  const i = rows.findIndex(r => r.dataset.id === id);
  const neighbourId = (rows[i + 1] || rows[i - 1])?.dataset.id;

  if (view.editingId === id) view.editingId = null;
  state.removeRecord(id);
  ui.toast(`Deleted “${rec.title}”.`);
  (neighbourId && rowButton(neighbourId, 'delete') || $('#library-title')).focus();
}

const tbody = $('#records-body');

tbody.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const row = btn.closest('tr');
  const id = row.dataset.id;

  switch (btn.dataset.action) {
    case 'edit': startEdit(id); break;
    case 'cancel': cancelEdit(); break;
    case 'save': saveInline(row); break;
    case 'delete': confirmDelete(id); break;
    case 'more':
      // re-rendering removes this link, so navigate ourselves
      e.preventDefault();
      view.editingId = null;
      fillForm(state.findRecord(id));
      renderLibrary();
      go('add');
      break;
    case 'notes':
      // open the notebook filtered to this book's pages
      e.preventDefault();
      showNotesFor(id);
      break;
  }
});

tbody.addEventListener('keydown', e => {
  if (!e.target.matches('.inline-input')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    saveInline(e.target.closest('tr'));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelEdit();
  }
});

// live feedback while editing a row
tbody.addEventListener('input', e => {
  if (!e.target.matches('.inline-input')) return;
  ui.setFieldMessage(e.target, validateField(e.target.name, e.target.value));
});

/* ---------- add / edit form ---------- */

const form = $('#book-form');
const FORM_FIELDS = ['title', 'author', 'pages', 'tag', 'dateAdded', 'isbn', 'description'];
const touched = new Set();
const field = name => $(`#f-${name}`);

function checkFormField(name) {
  const res = validateField(name, field(name).value);
  ui.setFieldMessage(field(name), res);
  return res;
}

function updatePagesHint() {
  const res = validateField('pages', field('pages').value);
  const pace = state.getSettings().minutesPerPage;
  $('#f-pages-hint').textContent = res.ok
    ? `About ${formatDuration(convert(res.value, 'pages', 'minutes', pace))} of reading at ${pace} min/page.`
    : '';
}

function updateIsbnSuggestion() {
  const box = $('#isbn-found');
  const found = field('isbn').value.trim() ? [] : extractIsbns(field('description').value);
  box.hidden = !found.length;
  if (found.length) {
    box.dataset.isbn = found[0];
    $('#isbn-found-text').textContent = `Found ISBN ${found[0]} in the description.`;
  }
}

function resetForm() {
  form.reset();
  $('#f-id').value = '';
  field('dateAdded').value = toISODate(new Date());
  touched.clear();
  FORM_FIELDS.forEach(name => ui.setFieldMessage(field(name)));
  $('#form-summary').hidden = true;
  $('#form-title').textContent = 'Add a book';
  $('#form-submit').textContent = 'Add book';
  $('#form-cancel').hidden = true;
  updatePagesHint();
  updateIsbnSuggestion();
}

function fillForm(rec) {
  resetForm();
  $('#f-id').value = rec.id;
  FORM_FIELDS.forEach(name => { field(name).value = rec[name] ?? ''; });
  $('#form-title').textContent = `Edit “${rec.title}”`;
  $('#form-submit').textContent = 'Save changes';
  $('#form-cancel').hidden = false;
  updatePagesHint();
  updateIsbnSuggestion();
}

form.addEventListener('input', e => {
  const name = e.target.name;
  if (!FORM_FIELDS.includes(name)) return;
  if (touched.has(name)) checkFormField(name);
  if (name === 'pages') updatePagesHint();
  if (name === 'description' || name === 'isbn') updateIsbnSuggestion();
});

// start validating a field once the user has typed something and moved on
form.addEventListener('focusout', e => {
  const name = e.target.name;
  if (FORM_FIELDS.includes(name) && e.target.value !== '') {
    touched.add(name);
    checkFormField(name);
  }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const raw = Object.fromEntries(FORM_FIELDS.map(name => [name, field(name).value]));
  const result = validateBook(raw);

  FORM_FIELDS.forEach(name => {
    touched.add(name);
    ui.setFieldMessage(field(name), { error: result.errors[name], warning: result.warnings[name] });
  });

  const summary = $('#form-summary');
  if (!result.ok) {
    const bad = FORM_FIELDS.filter(name => result.errors[name]);
    summary.hidden = false;
    summary.textContent = '';
    requestAnimationFrame(() => {
      summary.textContent = `${bad.length} ${bad.length === 1 ? 'field needs' : 'fields need'} attention before saving.`;
    });
    field(bad[0]).focus();
    return;
  }

  const id = $('#f-id').value;
  if (id) {
    view.flashId = id;
    const rec = state.updateRecord(id, result.values);
    ui.toast(`Saved “${rec.title}”.`);
  } else {
    view.flashId = state.nextId();
    const rec = state.addRecord(result.values);
    ui.toast(`Added “${rec.title}” to your vault.`);
  }
  resetForm();
  go('library');
});

$('#form-reset').addEventListener('click', () => {
  resetForm();
  field('title').focus();
});

$('#form-cancel').addEventListener('click', () => {
  resetForm();
  go('library');
});

$('#isbn-use').addEventListener('click', () => {
  field('isbn').value = $('#isbn-found').dataset.isbn;
  checkFormField('isbn');
  updateIsbnSuggestion();
  field('isbn').focus();
});

/* ---------- notes: the notebook ---------- */

const notebook = {
  openId: null,    // page shown on the paper
  saveTimer: null, // pending autosave
};
const nbTitle = $('#nb-title');
const nbBook = $('#nb-book');
const nbPage = $('#nb-page');
const nbBody = $('#nb-body');

function visiblePages() {
  return sortNotes(filterNotes(state.getNotes(), noteSearch.tester, { book: view.noteBook, bookTitle }));
}

function setSaveStatus(text) {
  // only touch the live region when the message really changes
  const status = $('#nb-status');
  if (status.textContent !== text) status.textContent = text;
}

function updateWordCount() {
  const words = nbBody.value.match(/\S+/g)?.length || 0;
  $('#nb-words').textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
}

// Put a page on the paper. Doesn't save anything.
function loadPage(note) {
  notebook.openId = note.id;
  nbTitle.value = note.title;
  nbBook.value = note.bookId;
  nbPage.value = note.page ?? '';
  nbBody.value = note.body;
  [nbTitle, nbPage, nbBody].forEach(input => ui.setFieldMessage(input));
  updateWordCount();
  setSaveStatus(`Last edited ${ui.formatStamp(note.updatedAt)}`);
}

function openPage(id, focusTarget = nbBody) {
  flushSave();
  const note = state.findNote(id);
  if (!note) return;
  loadPage(note);
  renderNotesView();
  if (focusTarget) {
    focusTarget.focus();
    // continue writing where the page ends
    if (focusTarget === nbBody) nbBody.setSelectionRange(nbBody.value.length, nbBody.value.length);
  }
}

// Autosave: wait for a short pause in typing, then save.
function scheduleSave() {
  clearTimeout(notebook.saveTimer);
  notebook.saveTimer = setTimeout(saveNow, 600);
  setSaveStatus('Saving…');
}

function flushSave() {
  if (notebook.saveTimer) saveNow();
}

function saveNow() {
  clearTimeout(notebook.saveTimer);
  notebook.saveTimer = null;
  const note = state.findNote(notebook.openId);
  if (!note) return;

  const title = validateNoteField('title', tidyTitle(nbTitle.value) || 'Untitled page');
  const page = validateNoteField('page', nbPage.value);
  const body = validateNoteField('body', nbBody.value);
  ui.setFieldMessage(nbTitle, title);
  ui.setFieldMessage(nbPage, page);
  ui.setFieldMessage(nbBody, body);

  // save what's valid, so a typo in the page number never costs you your text
  const values = { bookId: nbBook.value };
  if (title.ok) values.title = title.value;
  if (page.ok) values.page = page.value;
  if (body.ok) values.body = body.value;
  state.updateNote(note.id, values);

  const problem = [title, page, body].some(r => !r.ok);
  setSaveStatus(problem
    ? 'Some changes are not saved yet. See the message on the page.'
    : `Saved ${ui.formatStamp(new Date().toISOString())}`);
}

function newPage() {
  flushSave();
  // a search could hide the new page, so clear it
  if (noteSearch.tester) {
    noteSearchInput.value = '';
    noteSearch = compileRegex('');
    $('#notes-search-error').textContent = '';
  }
  const bookId = view.noteBook !== 'any' ? view.noteBook : '';
  const note = state.addNote({ bookId, title: 'Untitled page', page: null, body: '' });
  loadPage(note);
  renderNotesView();
  nbTitle.focus();
  nbTitle.select();
  ui.toast('New page added. Give it a title, then start writing.');
}

// From the Library: open the notebook filtered to one book.
function showNotesFor(bookId) {
  flushSave();
  view.noteBook = bookId;
  $('#notes-book').value = bookId;
  const first = visiblePages()[0];
  if (first) loadPage(first);
  renderNotesView();
  go('notes');
}

const editor = $('#nb-editor');

editor.addEventListener('input', scheduleSave);
nbBody.addEventListener('input', updateWordCount);

// Enter in the title moves down to the page, like a real notebook
nbTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nbBody.focus();
  }
});

// tidy the title once you leave it: "  chapter   3 " -> "chapter 3"
nbTitle.addEventListener('blur', () => {
  const tidy = tidyTitle(nbTitle.value) || 'Untitled page';
  if (tidy !== nbTitle.value) {
    nbTitle.value = tidy;
    scheduleSave();
  }
});

// save straight away when leaving the page or the tab
editor.addEventListener('focusout', e => {
  if (!editor.contains(e.relatedTarget)) flushSave();
});
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-action="new-page"]')) newPage();
});

$('#page-list').addEventListener('click', e => {
  const item = e.target.closest('.page-item');
  if (item) openPage(item.dataset.id);
});

$('#nb-delete').addEventListener('click', async () => {
  flushSave();
  const note = state.findNote(notebook.openId);
  if (!note) return;
  const yes = await ui.confirmDialog({
    title: 'Delete this page?',
    text: `“${note.title}” will be torn out of your notebook. This can't be undone.`,
    confirmLabel: 'Delete page',
  });
  if (!yes) {
    $('#nb-delete').focus();
    return;
  }

  // open the neighbouring page afterwards, like turning to the next sheet
  const items = $$('#page-list .page-item');
  const i = items.findIndex(b => b.dataset.id === note.id);
  const nextId = (items[i + 1] || items[i - 1])?.dataset.id;

  state.removeNote(note.id);
  if (nextId) openPage(nextId, null);
  ui.toast(`Deleted “${note.title}”.`);
  ($(`#page-list [data-id="${nextId}"]`) || $('.notebook__new')).focus();
});

const noteSearchInput = $('#notes-search');
let noteSearchTimer;

function applyNoteSearch() {
  noteSearch = compileRegex(noteSearchInput.value);
  $('#notes-search-error').textContent = noteSearch.error;
  noteSearchInput.setAttribute('aria-invalid', noteSearch.error ? 'true' : 'false');
  renderNotesView();
}

noteSearchInput.addEventListener('input', () => {
  clearTimeout(noteSearchTimer);
  noteSearchTimer = setTimeout(applyNoteSearch, 150);
});

$('#notes-search-form').addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(noteSearchTimer);
  applyNoteSearch();
});

$('#notes-book').addEventListener('change', e => {
  flushSave();
  view.noteBook = e.target.value;
  // if the open page isn't in the filtered list, switch to the first one that is
  const visible = visiblePages();
  if (visible.length && !visible.some(n => n.id === notebook.openId)) loadPage(visible[0]);
  renderNotesView();
});

$('#notes-clear').addEventListener('click', () => {
  noteSearchInput.value = '';
  view.noteBook = 'any';
  $('#notes-book').value = 'any';
  applyNoteSearch();
  noteSearchInput.focus();
});

/* ---------- settings ---------- */

function syncSettingsInputs() {
  const s = state.getSettings();
  $('#pace-input').value = s.minutesPerPage;
  $('#unit-select').value = s.displayUnit;
  $('#pace-cap').value = s.pageCap || '';
}

$('#pace-form').addEventListener('submit', e => e.preventDefault());

$('#pace-input').addEventListener('input', e => {
  const res = validatePace(e.target.value);
  ui.setFieldMessage(e.target, res);
  if (res.ok) state.updateSettings({ minutesPerPage: res.value });
});

$('#pace-cap').addEventListener('input', e => {
  const res = validateCap(e.target.value);
  ui.setFieldMessage(e.target, res);
  if (res.ok) state.updateSettings({ pageCap: res.value });
});

$('#unit-select').addEventListener('change', e => {
  state.updateSettings({ displayUnit: e.target.value });
  ui.toast('Display unit updated.');
});

function updateConverter() {
  const input = $('#conv-value');
  const out = $('#conv-output');
  const raw = input.value.trim();
  const valid = patterns.decimal.test(raw);
  ui.setFieldMessage(input, { error: raw && !valid ? 'Use a positive number, up to two decimals.' : '' });
  if (!valid) {
    out.textContent = '';
    return;
  }
  const from = $('#conv-from').value;
  const to = $('#conv-to').value;
  const pace = state.getSettings().minutesPerPage;
  const result = round(convert(Number(raw), from, to, pace));
  out.textContent = `${Number(raw).toLocaleString()} ${from} = ${result.toLocaleString()} ${to}`;
}

$('#convert-form').addEventListener('input', updateConverter);
$('#convert-form').addEventListener('submit', e => e.preventDefault());

$('#tag-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#tag-input');
  const res = validateField('tag', input.value);
  const tags = state.getSettings().tags;
  if (res.ok && tags.some(t => t.toLowerCase() === res.value.toLowerCase())) {
    res.ok = false;
    res.error = `“${res.value}” is already in the list.`;
  }
  ui.setFieldMessage(input, res);
  if (!res.ok) {
    input.focus();
    return;
  }
  state.updateSettings({ tags: [...tags, res.value] });
  input.value = '';
  ui.toast(`Tag “${res.value}” added.`);
});

$('#tag-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove-tag]');
  if (!btn) return;
  const tag = btn.dataset.removeTag;
  const buttons = $$('#tag-list [data-remove-tag]');
  const i = buttons.indexOf(btn);
  state.updateSettings({ tags: state.getSettings().tags.filter(t => t !== tag) });
  ui.toast(`Tag “${tag}” removed. Books already using it keep it.`);
  const next = $$('#tag-list [data-remove-tag]');
  (next[i] || next[i - 1] || $('#tag-input')).focus();
});

/* ---------- import / export ---------- */

function showImportReport(title, tone, details = []) {
  const box = $('#import-report');
  box.hidden = false;
  box.className = `import-report import-report--${tone}`;
  box.replaceChildren(
    ui.el('p', { class: 'import-report__title' }, title),
    details.length ? ui.el('ul', {}, ...details.map(d => ui.el('li', {}, d))) : null);
}

// notes is null when the file had no notes section (e.g. seed.json):
// then the notes you already have are left alone, even in replace mode.
async function loadRecordsInto(records, mode, notes = null) {
  if (mode === 'replace' && (state.getRecords().length || (notes && state.getNotes().length))) {
    const yes = await ui.confirmDialog({
      title: 'Replace your books?',
      text: notes
        ? `Your current books and notes will be replaced by ${records.length} books and ${notes.length} notes from the file.`
        : `Your ${state.getRecords().length} current books will be replaced by ${records.length} imported ones. Your notes are kept.`,
      confirmLabel: 'Replace',
    });
    if (!yes) return null;
  }
  if (mode === 'replace') {
    state.replaceRecords(records, notes);
    return { added: records.length, skipped: 0, notesAdded: notes ? notes.length : 0, notesSkipped: 0 };
  }
  return state.mergeRecords(records, notes || []);
}

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = ''; // allow picking the same file again
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showImportReport('That file is over 2 MB, which is too big for a book list.', 'error');
    return;
  }

  let text;
  try {
    text = await io.readFile(file);
  } catch (err) {
    showImportReport(`Couldn't read the file: ${err.message}`, 'error');
    return;
  }

  const result = io.parseImport(text);
  if (!result.ok) {
    const n = result.errors.length;
    const shown = result.errors.slice(0, 5);
    if (n > shown.length) shown.push(`…and ${n - shown.length} more.`);
    showImportReport(`Nothing was imported. ${file.name} has ${n} problem${n === 1 ? '' : 's'}:`, 'error', shown);
    return;
  }

  const mode = $('input[name="import-mode"]:checked').value;
  const outcome = await loadRecordsInto(result.records, mode, result.hasNotes ? result.notes : null);
  if (!outcome) return;

  const parts = [`Imported ${outcome.added} ${outcome.added === 1 ? 'book' : 'books'}`];
  if (result.hasNotes) parts.push(`${outcome.notesAdded} notebook ${outcome.notesAdded === 1 ? 'page' : 'pages'}`);
  const skipped = outcome.skipped + outcome.notesSkipped;
  const msg = `${parts.join(' and ')} from ${file.name}.` +
    (skipped ? ` ${skipped} ${skipped === 1 ? 'item was' : 'items were'} already in your vault and skipped.` : '');
  showImportReport(msg, 'ok');
});

$('#export-json').addEventListener('click', () => {
  const records = state.getRecords();
  const notes = state.getNotes();
  if (!records.length && !notes.length) return ui.toast('Nothing to export yet.', 'error');
  io.exportJSON(records, notes);
  ui.toast(`Exported ${records.length} books and ${notes.length} notes as JSON.`);
});

$('#export-csv').addEventListener('click', () => {
  const records = state.getRecords();
  if (!records.length) return ui.toast('Nothing to export yet.', 'error');
  io.exportCSV(records);
  ui.toast(`Exported ${records.length} books as CSV.`);
});

async function loadSample() {
  let text;
  try {
    const res = await fetch('seed.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch {
    ui.toast("Couldn't load the sample file. Open the app through a web server, not file://.", 'error');
    return;
  }
  const result = io.parseImport(text);
  if (!result.ok) {
    ui.toast('The sample file failed validation.', 'error');
    return;
  }
  const outcome = await loadRecordsInto(result.records, 'replace');
  if (outcome) ui.toast(`Loaded ${outcome.added} sample books.`);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-action="load-sample"]')) loadSample();
});

$('#clear-all').addEventListener('click', async () => {
  const count = state.getRecords().length;
  if (!count) return ui.toast('Your vault is already empty.');
  const yes = await ui.confirmDialog({
    title: 'Delete all books?',
    text: `All ${count} books will be removed from this browser. Your notebook pages are kept. Export a backup first if you might want the books back.`,
    confirmLabel: 'Delete all books',
  });
  if (!yes) return;
  view.editingId = null;
  state.replaceRecords([]);
  ui.toast('All books deleted.');
});

/* ---------- theme ---------- */

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme() {
  const t = state.getSettings().theme;
  return t === 'system' ? (darkQuery.matches ? 'dark' : 'light') : t;
}

function applyTheme() {
  const t = state.getSettings().theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $('#theme-toggle').setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; // switch immediately, even if saving fails
  document.getElementById('theme-toggle').setAttribute('aria-pressed', String(next === 'dark'));
  try { state.updateSettings({ theme: next }); } catch (err) { console.error('Could not save theme:', err); }
});

darkQuery.addEventListener('change', applyTheme);

/* ---------- keyboard shortcuts ---------- */

document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if ($('#confirm-dialog').open) return;

  if (e.key === '/') {
    e.preventDefault();
    go('library', '#search-input');
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    if (!$('#f-id').value) resetForm();
    go('add', '#f-title');
  }
});

/* ---------- start ---------- */

const { warning } = state.init();

state.subscribe(what => {
  if (what === 'records' || what === 'settings') renderAll();
  if (what === 'notes') {
    renderNotesView();
    renderLibrary(); // note counts on each book
    renderDashboard();
  }
  if (what === 'save-error') {
    ui.toast("Couldn't save to this browser's storage. Export your data so you don't lose it.", 'error');
  }
});

// Each startup step is isolated: one failing step can no longer leave every view hidden.
for (const step of [
  applyTheme,
  () => showView(routeFromHash() || 'dashboard', { moveFocus: false }),
  syncSettingsInputs,
  resetForm,
  () => renderAll({ announce: false }),
]) {
  try { step(); } catch (err) { console.error('Startup step failed:', err); }
}
// the browser's own jump-to-anchor would tuck the heading under the sticky header
requestAnimationFrame(() => window.scrollTo(0, 0));
if (warning) ui.toast(warning, 'error');
