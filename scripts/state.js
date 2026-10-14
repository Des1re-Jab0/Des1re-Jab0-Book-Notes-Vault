// Single source of truth for records (books), notes and settings.
// Every change goes through here, gets saved, then notifies the UI.

import * as storage from './storage.js';
import { patterns, validatePace, validateCap } from './validators.js';
import { UNITS } from './units.js';

export const DEFAULT_TAGS = ['Fiction', 'Non-Fiction', 'Science', 'History', 'Biography', 'Poetry', 'Reference'];

export const DEFAULT_SETTINGS = {
  minutesPerPage: 2,
  displayUnit: 'pages',
  pageCap: 10000,
  tags: DEFAULT_TAGS,
  theme: 'system',
};

let records = [];
let notes = [];
let settings = { ...DEFAULT_SETTINGS };
let saveFailed = false;
const listeners = new Set();

function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (validatePace(raw.minutesPerPage).ok) s.minutesPerPage = Number(raw.minutesPerPage);
  if (UNITS.includes(raw.displayUnit)) s.displayUnit = raw.displayUnit;
  // a missing key keeps the default; 0 is a real choice meaning "no cap"
  if (raw.pageCap != null && validateCap(raw.pageCap).ok) s.pageCap = Number(raw.pageCap) || 0;
  if (['light', 'dark', 'system'].includes(raw.theme)) s.theme = raw.theme;
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter(t => typeof t === 'string' && patterns.tag.test(t));
    s.tags = [...new Set(tags)];
  }
  return s;
}

export function init() {
  const loaded = storage.loadRecords();
  const loadedNotes = storage.loadNotes();
  records = loaded.records;
  notes = loadedNotes.notes;
  unlinkOrphanNotes();
  settings = cleanSettings(storage.loadSettings());
  return { warning: loaded.warning || loadedNotes.warning };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(what) {
  listeners.forEach(fn => fn(what));
}

function reportSave(ok) {
  // only shout about it once per failure streak
  if (!ok && !saveFailed) emit('save-error');
  saveFailed = !ok;
}

const persistRecords = () => reportSave(storage.saveRecords(records));
const persistNotes = () => reportSave(storage.saveNotes(notes));

export const getRecords = () => records;
export const getNotes = () => notes;
export const getSettings = () => settings;
export const findRecord = id => records.find(r => r.id === id);
export const findNote = id => notes.find(n => n.id === id);

// "rec_0012" -> 12, then +1, padded back to four digits
function nextNumberedId(list, prefix) {
  const max = list.reduce((n, item) => Math.max(n, Number(item.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export const nextId = (list = records) => nextNumberedId(list, 'rec_');
export const nextNoteId = (list = notes) => nextNumberedId(list, 'note_');

// A note whose book no longer exists becomes a general note instead of vanishing.
// Returns true if anything changed.
function unlinkOrphanNotes() {
  const known = new Set(records.map(r => r.id));
  let changed = false;
  notes = notes.map(n => {
    if (!n.bookId || known.has(n.bookId)) return n;
    changed = true;
    return { ...n, bookId: '' };
  });
  return changed;
}

function afterBooksChanged() {
  if (unlinkOrphanNotes()) {
    persistNotes();
    emit('notes');
  }
}

// keep the tag list in Settings in step with what's actually used
function rememberTag(tag) {
  if (tag && !settings.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
    updateSettings({ tags: [...settings.tags, tag] });
  }
}

export function addRecord(values) {
  const now = new Date().toISOString();
  const rec = { id: nextId(), ...values, createdAt: now, updatedAt: now };
  records = [...records, rec];
  persistRecords();
  rememberTag(rec.tag);
  emit('records');
  return rec;
}

export function updateRecord(id, values) {
  const current = findRecord(id);
  if (!current) return null;
  const changed = Object.keys(values).some(k => values[k] !== current[k]);
  if (!changed) return current;
  const updated = { ...current, ...values, id, updatedAt: new Date().toISOString() };
  records = records.map(r => (r.id === id ? updated : r));
  persistRecords();
  rememberTag(updated.tag);
  emit('records');
  return updated;
}

export function removeRecord(id) {
  const before = records.length;
  records = records.filter(r => r.id !== id);
  if (records.length === before) return false;
  persistRecords();
  emit('records');
  afterBooksChanged();
  return true;
}

// newNotes is optional: a plain list of books (like seed.json) leaves notes alone.
export function replaceRecords(list, newNotes = null) {
  records = [...list];
  persistRecords();
  list.forEach(r => rememberTag(r.tag));
  if (newNotes) {
    notes = [...newNotes];
    unlinkOrphanNotes();
    persistNotes();
    emit('notes');
  }
  emit('records');
  afterBooksChanged();
}

// Merge keeps what's already here; incoming items with a known id are skipped.
export function mergeRecords(list, incomingNotes = []) {
  const known = new Set(records.map(r => r.id));
  const fresh = list.filter(r => !known.has(r.id));
  if (fresh.length) {
    records = [...records, ...fresh];
    persistRecords();
    fresh.forEach(r => rememberTag(r.tag));
    emit('records');
  }

  const knownNotes = new Set(notes.map(n => n.id));
  const freshNotes = incomingNotes.filter(n => !knownNotes.has(n.id));
  if (freshNotes.length) {
    notes = [...notes, ...freshNotes];
    unlinkOrphanNotes();
    persistNotes();
    emit('notes');
  }

  return {
    added: fresh.length,
    skipped: list.length - fresh.length,
    notesAdded: freshNotes.length,
    notesSkipped: incomingNotes.length - freshNotes.length,
  };
}

/* ---------- notes ---------- */

export function addNote(values) {
  const now = new Date().toISOString();
  const note = { id: nextNoteId(), ...values, createdAt: now, updatedAt: now };
  notes = [...notes, note];
  persistNotes();
  emit('notes');
  return note;
}

export function updateNote(id, values) {
  const current = findNote(id);
  if (!current) return null;
  const changed = Object.keys(values).some(k => values[k] !== current[k]);
  if (!changed) return current;
  const updated = { ...current, ...values, id, updatedAt: new Date().toISOString() };
  notes = notes.map(n => (n.id === id ? updated : n));
  persistNotes();
  emit('notes');
  return updated;
}

export function removeNote(id) {
  const before = notes.length;
  notes = notes.filter(n => n.id !== id);
  if (notes.length === before) return false;
  persistNotes();
  emit('notes');
  return true;
}

export function clearNotes() {
  notes = [];
  persistNotes();
  emit('notes');
}

export function updateSettings(patch) {
  settings = cleanSettings({ ...settings, ...patch });
  storage.saveSettings(settings);
  emit('settings');
  return settings;
}
