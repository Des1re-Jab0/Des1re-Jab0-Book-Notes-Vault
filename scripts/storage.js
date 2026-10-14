// Thin wrapper around localStorage. Never throws: private browsing, full
// quota or hand-edited JSON should degrade to a warning, not a blank page.

import { validateImport } from './validators.js';

export const KEYS = {
  records: 'vault:records',
  notes: 'vault:notes',
  settings: 'vault:settings',
  backup: 'vault:records:backup',
  notesBackup: 'vault:notes:backup',
};

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadRecords() {
  const raw = read(KEYS.records);
  if (raw == null) return { records: [], warning: '' };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    write(KEYS.backup, raw);
    return { records: [], warning: 'Saved data was unreadable, so the vault started empty. A copy was kept under "vault:records:backup".' };
  }

  const { records, errors } = validateImport(parsed);
  if (errors.length) {
    write(KEYS.backup, raw);
    return {
      records,
      warning: `${errors.length} saved record(s) failed validation and were skipped. A copy of the original data was kept.`,
    };
  }
  return { records, warning: '' };
}

export function saveRecords(records) {
  return write(KEYS.records, JSON.stringify(records));
}

// Same recovery idea as records: keep what's valid, back up the rest.
export function loadNotes() {
  const raw = read(KEYS.notes);
  if (raw == null) return { notes: [], warning: '' };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    write(KEYS.notesBackup, raw);
    return { notes: [], warning: 'Saved notes were unreadable, so they started empty. A copy was kept under "vault:notes:backup".' };
  }

  const { notes, errors } = validateImport({ records: [], notes: Array.isArray(parsed) ? parsed : [] });
  if (errors.length || !Array.isArray(parsed)) {
    write(KEYS.notesBackup, raw);
    return { notes, warning: 'Some saved notes failed validation and were skipped. A copy of the original data was kept.' };
  }
  return { notes, warning: '' };
}

export function saveNotes(notes) {
  return write(KEYS.notes, JSON.stringify(notes));
}

export function loadSettings() {
  const raw = read(KEYS.settings);
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  return write(KEYS.settings, JSON.stringify(settings));
}
