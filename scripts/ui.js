// Everything that touches the DOM for rendering. No app logic here;
// main.js decides what to show and calls these.

import { highlight, excerpt } from './search.js';
import { formatPages, formatDuration, convert } from './units.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Small element builder: el('td', { class: 'num' }, 'text', otherNode)
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val == null || val === false) continue;
    if (key === 'class') node.className = val;
    else if (key === 'dataset') Object.assign(node.dataset, val);
    else if (key === 'text') node.textContent = val;
    else node.setAttribute(key, val === true ? '' : val);
  }
  node.append(...children.filter(c => c != null && c !== false));
  return node;
}

const srOnly = text => el('span', { class: 'visually-hidden' }, text);

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- live messages ---------- */

let toastTimer;
export function toast(message, tone = 'info') {
  const box = $('#toast');
  // clear first so the same message twice is still announced
  box.textContent = '';
  box.className = `toast toast--${tone}`;
  requestAnimationFrame(() => {
    box.textContent = message;
    box.classList.add('is-visible');
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-visible'), 4500);
}

export function setFieldMessage(input, { error = '', warning = '' } = {}) {
  const msg = document.getElementById(`${input.id}-msg`);
  input.setAttribute('aria-invalid', error ? 'true' : 'false');
  if (!msg) return;
  msg.textContent = error || warning;
  msg.className = `field-msg${error ? ' is-error' : warning ? ' is-warning' : ''}`;
}

/* ---------- library table ---------- */

function readRow(rec, { re, tester, unit, pace, noteCounts }) {
  const titleCell = el('td', { role: 'cell', class: 'cell-title', 'data-label': 'Title' },
    el('span', { class: 'book-title' }, highlight(rec.title, re)));

  if (rec.description) {
    titleCell.append(el('p', { class: 'book-description' }, highlight(excerpt(rec.description, tester), re)));
  }
  if (rec.isbn) {
    titleCell.append(el('p', { class: 'book-isbn' }, 'ISBN ', highlight(rec.isbn, re)));
  }
  const count = noteCounts?.get(rec.id) || 0;
  if (count) {
    titleCell.append(el('a', { href: '#notes', class: 'note-count', dataset: { action: 'notes' } },
      `${count} notebook ${count === 1 ? 'page' : 'pages'}`, srOnly(` on “${rec.title}”`)));
  }

  const pagesCell = el('td', { role: 'cell', class: 'num', 'data-label': 'Pages' }, highlight(String(rec.pages), re));
  if (unit !== 'pages') {
    pagesCell.append(el('span', { class: 'cell-sub' }, `≈ ${formatPages(rec.pages, unit, pace)}`));
  }

  const name = `“${rec.title}”`;
  return el('tr', { role: 'row', dataset: { id: rec.id } },
    titleCell,
    el('td', { role: 'cell', 'data-label': 'Author' }, highlight(rec.author, re)),
    pagesCell,
    el('td', { role: 'cell', 'data-label': 'Tag' }, el('span', { class: 'tag-pill' }, highlight(rec.tag, re))),
    el('td', { role: 'cell', 'data-label': 'Added' },
      el('time', { datetime: rec.dateAdded, title: rec.dateAdded }, formatDate(rec.dateAdded))),
    el('td', { role: 'cell', class: 'cell-actions' },
      el('button', { type: 'button', class: 'btn btn--small', dataset: { action: 'edit' } }, 'Edit', srOnly(` ${name}`)),
      el('button', { type: 'button', class: 'btn btn--small btn--danger-text', dataset: { action: 'delete' } }, 'Delete', srOnly(` ${name}`)))
  );
}

function editInput(rec, field, label, extra = {}) {
  const id = `edit-${field}`;
  return [
    el('label', { for: id, class: 'visually-hidden' }, `${label} for “${rec.title}”`),
    el('input', { id, name: field, type: 'text', value: String(rec[field]), autocomplete: 'off',
      'aria-describedby': `${id}-msg`, class: 'inline-input', ...extra }),
    el('p', { id: `${id}-msg`, class: 'field-msg' }),
  ];
}

function editRow(rec) {
  return el('tr', { role: 'row', class: 'is-editing', dataset: { id: rec.id } },
    el('td', { role: 'cell', 'data-label': 'Title' }, ...editInput(rec, 'title', 'Title')),
    el('td', { role: 'cell', 'data-label': 'Author' }, ...editInput(rec, 'author', 'Author')),
    el('td', { role: 'cell', 'data-label': 'Pages' }, ...editInput(rec, 'pages', 'Pages', { inputmode: 'numeric' })),
    el('td', { role: 'cell', 'data-label': 'Tag' }, ...editInput(rec, 'tag', 'Tag', { list: 'tag-options' })),
    el('td', { role: 'cell', 'data-label': 'Added' }, ...editInput(rec, 'dateAdded', 'Date added', { placeholder: 'YYYY-MM-DD' })),
    el('td', { role: 'cell', class: 'cell-actions' },
      el('button', { type: 'button', class: 'btn btn--small btn--primary', dataset: { action: 'save' } }, 'Save'),
      el('button', { type: 'button', class: 'btn btn--small', dataset: { action: 'cancel' } }, 'Cancel'),
      el('a', { href: '#add', class: 'more-link', dataset: { action: 'more' } }, 'All fields', srOnly(` for “${rec.title}”`)))
  );
}

export function renderTable(list, opts) {
  const body = $('#records-body');
  const rows = list.map(rec => {
    const row = rec.id === opts.editingId ? editRow(rec) : readRow(rec, opts);
    if (rec.id === opts.flashId) row.classList.add('is-updated');
    return row;
  });
  body.replaceChildren(...rows);
}

export function updateSortHeaders(key, dir) {
  for (const th of $$('#records-table th[data-key]')) {
    const active = th.dataset.key === key;
    th.setAttribute('aria-sort', active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
    th.classList.toggle('is-sorted', active);
  }
}

/* ---------- notes ---------- */

// today's edits show the time, older ones the date
export function formatStamp(iso, now = new Date()) {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The notebook's table of contents: one button per page.
export function renderPageList(list, { re, bookTitle, openId }) {
  const items = list.map(note => {
    const book = bookTitle(note.bookId);
    const preview = note.body.replace(/\s+/g, ' ').trim().slice(0, 90);
    return el('li', {},
      el('button', { type: 'button', class: 'page-item', dataset: { id: note.id }, 'aria-current': note.id === openId ? 'true' : null },
        el('span', { class: 'page-item__title' }, highlight(note.title, re)),
        el('span', { class: 'page-item__meta' },
          book ? el('span', { class: 'page-item__book' }, highlight(book, re)) : null,
          note.page ? el('span', {}, `p. ${note.page}`) : null,
          el('span', {}, formatStamp(note.updatedAt))),
        preview ? el('span', { class: 'page-item__preview' }, highlight(preview, re)) : null));
  });
  $('#page-list').replaceChildren(...items);
}

// Fills a <select> with books (A–Z) after some fixed first options,
// keeping the current choice if that book still exists.
export function fillBookSelect(select, books, firstOptions) {
  // an empty <select> reports '' as its value, which is a real option here
  const current = select.options.length ? select.value : firstOptions[0][0];
  const sorted = books.slice().sort((a, b) => a.title.localeCompare(b.title));
  select.replaceChildren(
    ...firstOptions.map(([value, label]) => el('option', { value }, label)),
    ...sorted.map(b => el('option', { value: b.id }, b.title)));
  const values = [...select.options].map(o => o.value);
  select.value = values.includes(current) ? current : firstOptions[0][0];
}

/* ---------- dashboard ---------- */

export function renderStats(stats, settings, noteCount = 0) {
  const { minutesPerPage: pace, displayUnit: unit } = settings;
  $('#stat-total').textContent = stats.total.toLocaleString();
  $('#stat-total-sub').textContent = noteCount ? `and ${noteCount} notebook ${noteCount === 1 ? 'page' : 'pages'}` : '';
  $('#stat-pages').textContent = formatPages(stats.totalPages, 'pages', pace);
  $('#stat-pages-sub').textContent = stats.totalPages
    ? `≈ ${formatDuration(convert(stats.totalPages, 'pages', 'minutes', pace))} of reading`
    : '';

  $('#stat-tag').textContent = stats.topTag ? stats.topTag.name : '–';
  $('#stat-tag-sub').textContent = stats.topTag
    ? `${stats.topTag.count} of ${stats.total} ${stats.total === 1 ? 'book' : 'books'}`
    : '';

  $('#stat-longest').textContent = stats.longest ? stats.longest.title : '–';
  $('#stat-longest-sub').textContent = stats.longest ? formatPages(stats.longest.pages, unit, pace) : '';
}

export function renderTrend(days) {
  const max = Math.max(...days.map(d => d.pages), 1);
  const bars = days.map((d, i) => {
    const pct = Math.round((d.pages / max) * 100);
    const label = `${d.longLabel}: ${d.pages.toLocaleString()} pages, ${d.books} ${d.books === 1 ? 'book' : 'books'}`;
    return el('li', { class: `chart__col${i === days.length - 1 ? ' is-today' : ''}` },
      el('span', { class: 'chart__value', 'aria-hidden': 'true' }, d.pages ? d.pages.toLocaleString() : ''),
      el('span', { class: 'chart__track', 'aria-hidden': 'true' },
        el('span', { class: 'chart__bar', style: `--h: ${pct}%` })),
      el('span', { class: 'chart__day', 'aria-hidden': 'true' }, d.label),
      srOnly(label));
  });
  $('#trend-chart').replaceChildren(...bars);

  const week = days.reduce((s, d) => s + d.pages, 0);
  const books = days.reduce((s, d) => s + d.books, 0);
  $('#trend-caption').textContent = week
    ? `${week.toLocaleString()} pages across ${books} ${books === 1 ? 'book' : 'books'} this week.`
    : 'Nothing added in the last 7 days.';
}

export function capMessage(status) {
  const n = v => v.toLocaleString();
  switch (status.level) {
    case 'off': return 'No cap set.';
    case 'over': return `Over the cap by ${n(status.over)} pages (${n(status.used)} of ${n(status.cap)}).`;
    case 'near': return `Almost there: ${n(status.remaining)} pages left before the cap of ${n(status.cap)}.`;
    default: return `${n(status.remaining)} pages left under your cap of ${n(status.cap)}.`;
  }
}

export function renderCap(status) {
  const meter = $('#cap-meter');
  const shown = Math.min(status.percent, 100);
  meter.hidden = status.level === 'off';
  meter.setAttribute('aria-valuenow', String(shown));
  meter.setAttribute('aria-valuetext', `${status.percent}% of cap used`);
  meter.dataset.level = status.level;
  $('#cap-fill').style.setProperty('--w', `${shown}%`);
  const msg = $('#cap-message');
  msg.textContent = capMessage(status);
  msg.dataset.level = status.level;
}

/* ---------- settings ---------- */

export function renderTags(tags, usedTags) {
  const list = $('#tag-list');
  list.replaceChildren(...tags.map(tag =>
    el('li', { class: 'tag-item' },
      el('span', { class: 'tag-pill' }, tag),
      el('button', { type: 'button', class: 'icon-btn', dataset: { removeTag: tag }, 'aria-label': `Remove tag ${tag}` }, '×'))));

  if (!tags.length) list.append(el('li', { class: 'muted' }, 'No tags yet.'));

  const options = [...new Set([...tags, ...usedTags])].sort();
  $('#tag-options').replaceChildren(...options.map(t => el('option', { value: t })));
}

/* ---------- confirm dialog ---------- */

export function confirmDialog({ title, text, confirmLabel = 'Delete' }) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = confirmLabel;

  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}
