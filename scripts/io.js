import { validateImport } from './validators.js';
import { toISODate } from './stats.js';

export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, records: [], notes: [], errors: [`The file isn't valid JSON (${err.message}).`] };
  }
  return validateImport(data);
}

const CSV_COLUMNS = ['id', 'title', 'author', 'pages', 'tag', 'dateAdded', 'isbn', 'description', 'createdAt', 'updatedAt'];

export function csvCell(value) {
  let str = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCSV(records) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of records) lines.push(CSV_COLUMNS.map(c => csvCell(r[c])).join(','));
  return lines.join('\r\n');
}

export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildExport(records, notes) {
  return { app: 'book-notes-vault', version: 2, exportedAt: new Date().toISOString(), records, notes };
}

export function exportJSON(records, notes = []) {
  const json = JSON.stringify(buildExport(records, notes), null, 2);
  downloadFile(`book-vault-${toISODate(new Date())}.json`, json, 'application/json');
}

export function exportCSV(records) {
  downloadFile(`book-vault-${toISODate(new Date())}.csv`, '﻿' + toCSV(records), 'text/csv;charset=utf-8');
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}
