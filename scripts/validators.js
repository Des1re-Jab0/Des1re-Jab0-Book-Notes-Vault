

export const patterns = {
  title: /^\S(?:.*\S)?$/,
  doubleSpace: /\s{2,}/,
  author: /^\p{L}[\p{L}'’.-]*(?:(?:, | & | )\p{L}[\p{L}'’.-]*)*$/u,
  pages: /^(?:0|[1-9]\d*)$/,
  date: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  tag: /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/,
  isbn: /^(?:(?:\d[- ]?){9}[\dX]|(?=97[89])(?:\d[- ]?){12}\d)$/i,
  duplicateWord: /\b(\w+)\s+\1\b/i,
  decimal: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
  recordId: /^rec_\d{4,}$/,
  noteId: /^note_\d{4,}$/,
};

export const LIMITS = {
  titleMax: 200,
  authorMax: 120,
  pagesMax: 99999,
  descriptionMax: 2000,
  tagMax: 30,
  noteTitleMax: 120,
  noteBodyMax: 20000,
};

const ok = (value, warning = '') => ({ ok: true, value, error: '', warning });
const fail = error => ({ ok: false, value: null, error, warning: '' });

function duplicateWordWarning(text) {
  const m = text.match(patterns.duplicateWord);
  return m ? `"${m[0]}" repeats a word. Save anyway if that's intended.` : '';
}

export function isRealDate(str) {
  if (!patterns.date.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function normalizeIsbn(str) {
  return str.replace(/[- ]/g, '').toUpperCase();
}

export function isbnChecksumOk(isbn) {
  const digits = normalizeIsbn(isbn);
  if (/^\d{9}[\dX]$/.test(digits)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const v = digits[i] === 'X' ? 10 : Number(digits[i]);
      sum += v * (10 - i);
    }
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(digits)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(digits[i]) * (i % 2 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

export function extractIsbns(text) {
  const candidates = text.match(/\b(?:97[89][- ]?)?(?:\d[- ]?){9}[\dX]\b/gi) || [];
  return [...new Set(candidates.map(normalizeIsbn))].filter(isbnChecksumOk);
}

const fieldRules = {
  title(raw) {
    if (!raw) return fail('Title is required.');
    if (!patterns.title.test(raw)) return fail('Remove the spaces at the start or end.');
    if (patterns.doubleSpace.test(raw)) return fail('Use single spaces between words.');
    if (raw.length > LIMITS.titleMax) return fail(`Keep it under ${LIMITS.titleMax} characters.`);
    return ok(raw, duplicateWordWarning(raw));
  },

  author(raw) {
    if (!raw) return fail('Author is required.');
    if (!patterns.title.test(raw)) return fail('Remove the spaces at the start or end.');
    if (patterns.doubleSpace.test(raw)) return fail('Use single spaces between names.');
    if (!patterns.author.test(raw)) {
      return fail('Use letters, spaces, hyphens, apostrophes or periods (e.g. "Ursula K. Le Guin").');
    }
    if (raw.length > LIMITS.authorMax) return fail(`Keep it under ${LIMITS.authorMax} characters.`);
    const warning = duplicateWordWarning(raw)
      ? `"${raw.match(patterns.duplicateWord)[0]}" looks like a repeated name.`
      : '';
    return ok(raw, warning);
  },

  pages(raw) {
    const str = String(raw ?? '').trim();
    if (!str) return fail('Page count is required.');
    if (!patterns.pages.test(str)) return fail('Use a whole number with no leading zeros, like 320.');
    const n = Number(str);
    if (n < 1) return fail('A book needs at least 1 page.');
    if (n > LIMITS.pagesMax) return fail(`That's over ${LIMITS.pagesMax.toLocaleString()} pages. Check the number.`);
    return ok(n);
  },

  tag(raw) {
    if (!raw) return fail('Pick or type a tag.');
    if (!patterns.tag.test(raw)) return fail('Letters only, words separated by one space or hyphen (e.g. "Non-Fiction").');
    if (raw.length > LIMITS.tagMax) return fail(`Keep tags under ${LIMITS.tagMax} characters.`);
    return ok(raw);
  },

  dateAdded(raw) {
    if (!raw) return fail('Date is required.');
    if (!patterns.date.test(raw)) return fail('Use the format YYYY-MM-DD.');
    if (!isRealDate(raw)) return fail("That date doesn't exist on the calendar.");
    return ok(raw);
  },

  isbn(raw) {
    if (!raw) return ok('');
    if (!patterns.isbn.test(raw)) return fail('Enter 10 digits (last may be X) or 13 digits starting 978/979.');
    if (!isbnChecksumOk(raw)) return fail('The check digit is wrong. Double-check for typos.');
    return ok(normalizeIsbn(raw));
  },

  description(raw) {
    const text = (raw || '').trim();
    if (text.length > LIMITS.descriptionMax) {
      return fail(`Descriptions are limited to ${LIMITS.descriptionMax} characters.`);
    }
    return ok(text);
  },
};

export const BOOK_FIELDS = ['title', 'author', 'pages', 'tag', 'dateAdded', 'isbn', 'description'];

export function validateField(name, raw) {
  const rule = fieldRules[name];
  if (!rule) throw new Error(`No validator for "${name}"`);
  return rule(typeof raw === 'string' ? raw : raw == null ? '' : String(raw));
}

export function validateBook(input) {
  const values = {};
  const errors = {};
  const warnings = {};
  for (const field of BOOK_FIELDS) {
    const res = validateField(field, input[field]);
    if (res.ok) values[field] = res.value;
    else errors[field] = res.error;
    if (res.warning) warnings[field] = res.warning;
  }
  return { ok: Object.keys(errors).length === 0, values, errors, warnings };
}

const isIsoTimestamp = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function validateRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    return { ok: false, errors: ['not an object'] };
  }
  const errors = [];
  if (typeof rec.id !== 'string' || !patterns.recordId.test(rec.id)) {
    errors.push('id must look like "rec_0001"');
  }
  for (const key of ['title', 'author', 'tag', 'dateAdded']) {
    if (typeof rec[key] !== 'string') errors.push(`${key} must be text`);
  }
  if (typeof rec.pages !== 'number' || !Number.isInteger(rec.pages)) errors.push('pages must be a whole number');
  for (const key of ['isbn', 'description', 'notes']) {
    if (rec[key] != null && typeof rec[key] !== 'string') errors.push(`${key} must be text`);
  }
  if (!isIsoTimestamp(rec.createdAt)) errors.push('createdAt must be a date-time');
  if (!isIsoTimestamp(rec.updatedAt)) errors.push('updatedAt must be a date-time');
  if (errors.length) return { ok: false, errors };

  const book = validateBook({ ...rec, description: rec.description ?? rec.notes });
  if (!book.ok) {
    return { ok: false, errors: Object.entries(book.errors).map(([k, msg]) => `${k}: ${msg}`) };
  }
  return {
    ok: true,
    errors: [],
    record: { id: rec.id, ...book.values, createdAt: rec.createdAt, updatedAt: rec.updatedAt },
  };
}

/* ---------- notes (notebook pages) ---------- */

export function tidyTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

const noteRules = {
  bookId(raw) {
    if (!raw) return ok(''); // a general note, not tied to a book
    if (!patterns.recordId.test(raw)) return fail('Pick a book from the list.');
    return ok(raw);
  },

  title(raw) {
    if (!raw) return fail('Give the note a short title.');
    if (!patterns.title.test(raw)) return fail('Remove the spaces at the start or end.');
    if (patterns.doubleSpace.test(raw)) return fail('Use single spaces between words.');
    if (raw.length > LIMITS.noteTitleMax) return fail(`Keep it under ${LIMITS.noteTitleMax} characters.`);
    return ok(raw, duplicateWordWarning(raw));
  },

  page(raw) {
    const str = String(raw ?? '').trim();
    if (!str) return ok(null);
    if (!patterns.pages.test(str) || Number(str) < 1) return fail('Use a page number like 42, or leave it empty.');
    return ok(Number(str));
  },

  body(raw) {
    const text = raw || '';
    if (text.length > LIMITS.noteBodyMax) {
      return fail(`A page holds up to ${LIMITS.noteBodyMax.toLocaleString()} characters. Start a new page for the rest.`);
    }
    return ok(text, duplicateWordWarning(text));
  },
};

export const NOTE_FIELDS = ['bookId', 'title', 'page', 'body'];

export function validateNoteField(name, raw) {
  const rule = noteRules[name];
  if (!rule) throw new Error(`No note validator for "${name}"`);
  return rule(typeof raw === 'string' ? raw : raw == null ? '' : String(raw));
}

export function validateNoteInput(input) {
  const values = {};
  const errors = {};
  const warnings = {};
  for (const field of NOTE_FIELDS) {
    const res = validateNoteField(field, input[field]);
    if (res.ok) values[field] = res.value;
    else errors[field] = res.error;
    if (res.warning) warnings[field] = res.warning;
  }
  return { ok: Object.keys(errors).length === 0, values, errors, warnings };
}

export function validateNote(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) {
    return { ok: false, errors: ['not an object'] };
  }
  const errors = [];
  if (typeof note.id !== 'string' || !patterns.noteId.test(note.id)) errors.push('id must look like "note_0001"');
  if (note.bookId != null && typeof note.bookId !== 'string') errors.push('bookId must be text');
  for (const key of ['title', 'body']) {
    if (typeof note[key] !== 'string') errors.push(`${key} must be text`);
  }
  if (note.page != null && !Number.isInteger(note.page)) errors.push('page must be a whole number or null');
  if (!isIsoTimestamp(note.createdAt)) errors.push('createdAt must be a date-time');
  if (!isIsoTimestamp(note.updatedAt)) errors.push('updatedAt must be a date-time');
  if (errors.length) return { ok: false, errors };

  const res = validateNoteInput(note);
  if (!res.ok) return { ok: false, errors: Object.entries(res.errors).map(([k, msg]) => `${k}: ${msg}`) };
  return { ok: true, errors: [], note: { id: note.id, ...res.values, createdAt: note.createdAt, updatedAt: note.updatedAt } };
}

/* ---------- import ---------- */

function validateList(list, check, key, kind) {
  const items = [];
  const errors = [];
  const seen = new Set();
  list.forEach((item, i) => {
    const label = item && typeof item.title === 'string' && item.title ? `"${item.title}"` : `${kind} ${i + 1}`;
    const res = check(item);
    if (!res.ok) {
      errors.push(`${label}: ${res.errors.join('; ')}`);
    } else if (seen.has(res[key].id)) {
      errors.push(`${label}: duplicate id ${res[key].id}`);
    } else {
      seen.add(res[key].id);
      items.push(res[key]);
    }
  });
  return { items, errors };
}

export function validateImport(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
  if (!list) {
    return { ok: false, records: [], notes: [], hasNotes: false, errors: ['Expected a list of books (a JSON array).'] };
  }
  const books = validateList(list, validateRecord, 'record', 'book');
  const errors = [...books.errors];

  const hasNotes = !Array.isArray(data) && data.notes != null;
  let notes = [];
  if (hasNotes) {
    if (!Array.isArray(data.notes)) {
      errors.push('"notes" must be a list.');
    } else {
      const checked = validateList(data.notes, validateNote, 'note', 'note');
      notes = checked.items;
      errors.push(...checked.errors);
    }
  }
  return { ok: errors.length === 0, records: books.items, notes, hasNotes, errors };
}

export function validatePace(raw) {
  const str = String(raw ?? '').trim();
  if (!patterns.decimal.test(str)) return fail('Use a number like 2 or 1.5 (max two decimals).');
  const n = Number(str);
  if (n <= 0 || n > 60) return fail('Pick something between 0.01 and 60 minutes.');
  return ok(n);
}

export function validateCap(raw) {
  const str = String(raw ?? '').trim();
  if (str === '') return ok(0); // 0 = no cap
  if (!patterns.pages.test(str)) return fail('Use a whole number of pages, or leave blank for no cap.');
  return ok(Number(str));
}
