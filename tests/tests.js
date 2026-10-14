// Tiny test runner. Open tests.html in the browser, or run `node tests/tests.js`.

import {
  patterns, validateField, validateBook, validateRecord, validateImport,
  isRealDate, isbnChecksumOk, extractIsbns, validatePace, validateCap,
  validateNote, validateNoteField, validateNoteInput, tidyTitle,
} from '../scripts/validators.js';
import {
  compileRegex, splitMatches, filterRecords, sortRecords, excerpt, filterNotes, sortNotes,
} from '../scripts/search.js';
import { computeStats, topTag, lastSevenDays, capStatus, toISODate } from '../scripts/stats.js';
import { convert, formatDuration, formatPages } from '../scripts/units.js';
import { toCSV, csvCell, parseImport, buildExport } from '../scripts/io.js';

const groups = [];
let current;

function group(name, fn) {
  current = { name, results: [] };
  groups.push(current);
  fn();
}

function test(name, fn) {
  try {
    fn();
    current.results.push({ name, ok: true });
  } catch (err) {
    current.results.push({ name, ok: false, message: err.message });
  }
}

function assert(cond, message = 'expected a truthy value') {
  if (!cond) throw new Error(message);
}

function equal(actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

const book = (over = {}) => ({
  id: 'rec_0001',
  title: 'Things Fall Apart',
  author: 'Chinua Achebe',
  pages: 209,
  tag: 'Fiction',
  dateAdded: '2026-10-10',
  isbn: '',
  description: '',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  ...over,
});

/* ---------- validators ---------- */

group('Title rule: ^\\S(?:.*\\S)?$ plus no double spaces', () => {
  test('accepts a normal title', () => assert(validateField('title', 'Dune').ok));
  test('accepts a one-character title', () => assert(validateField('title', 'X').ok));
  test('rejects a leading space', () => assert(!validateField('title', ' Dune').ok));
  test('rejects a trailing space', () => assert(!validateField('title', 'Dune ').ok));
  test('rejects double spaces inside', () => assert(!validateField('title', 'Dune  Messiah').ok));
  test('rejects an empty title', () => assert(!validateField('title', '').ok));
});

group('Pages rule: ^(?:0|[1-9]\\d*)$', () => {
  test('accepts 320', () => equal(validateField('pages', '320').value, 320));
  test('accepts 1 (smallest book)', () => assert(validateField('pages', '1').ok));
  test('rejects 0 pages', () => assert(!validateField('pages', '0').ok));
  test('rejects leading zeros', () => assert(!validateField('pages', '007').ok));
  test('rejects decimals', () => assert(!validateField('pages', '12.5').ok));
  test('rejects negative numbers', () => assert(!validateField('pages', '-4').ok));
  test('rejects absurdly large counts', () => assert(!validateField('pages', '100000').ok));
});

group('Date rule: YYYY-MM-DD + real calendar check', () => {
  test('accepts 2026-10-11', () => assert(validateField('dateAdded', '2026-10-11').ok));
  test('accepts leap day 2024-02-29', () => assert(isRealDate('2024-02-29')));
  test('rejects 2025-02-29 (not a leap year)', () => assert(!isRealDate('2025-02-29')));
  test('rejects 2026-04-31', () => assert(!validateField('dateAdded', '2026-04-31').ok));
  test('rejects month 13', () => assert(!patterns.date.test('2026-13-01')));
  test('rejects 11/10/2026', () => assert(!validateField('dateAdded', '11/10/2026').ok));
});

group('Tag rule: ^[A-Za-z]+(?:[ -][A-Za-z]+)*$', () => {
  test('accepts "Fiction"', () => assert(validateField('tag', 'Fiction').ok));
  test('accepts "Non-Fiction"', () => assert(validateField('tag', 'Non-Fiction').ok));
  test('accepts "Science Fiction"', () => assert(validateField('tag', 'Science Fiction').ok));
  test('rejects digits', () => assert(!validateField('tag', 'Sci-Fi 2').ok));
  test('rejects a trailing hyphen', () => assert(!validateField('tag', 'Non-').ok));
  test('rejects double separators', () => assert(!validateField('tag', 'Non--Fiction').ok));
});

group('Author rule (Unicode letters)', () => {
  test('accepts "Ngũgĩ wa Thiong\'o"', () => assert(validateField('author', "Ngũgĩ wa Thiong'o").ok));
  test('accepts "Ursula K. Le Guin"', () => assert(validateField('author', 'Ursula K. Le Guin').ok));
  test('accepts "Le Guin, Ursula K."', () => assert(validateField('author', 'Le Guin, Ursula K.').ok));
  test('accepts co-authors with &', () => assert(validateField('author', 'Terry Pratchett & Neil Gaiman').ok));
  test('rejects digits', () => assert(!validateField('author', 'R2 D2').ok));
});

group('Advanced: back-reference \\b(\\w+)\\s+\\1\\b', () => {
  test('flags "the the"', () => assert(patterns.duplicateWord.test('read the the book')));
  test('is case-insensitive ("The the")', () => assert(patterns.duplicateWord.test('The the end')));
  test('ignores "the theory"', () => assert(!patterns.duplicateWord.test('the theory')));
  test('repeated word is a warning, not an error', () => {
    const res = validateField('title', 'Bora Bora Nights');
    assert(res.ok && res.warning, 'should pass with a warning');
  });
});

group('Advanced: ISBN with lookahead (?=97[89]) + checksum', () => {
  test('accepts ISBN-13 with hyphens', () => equal(validateField('isbn', '978-0-553-38016-3').value, '9780553380163'));
  test('accepts ISBN-10 ending in X', () => assert(validateField('isbn', '080442005X').ok));
  test('rejects a 13-digit number not starting 978/979', () => assert(!patterns.isbn.test('1234567890123')));
  test('rejects a wrong check digit', () => assert(!isbnChecksumOk('9780553380164')));
  test('empty ISBN is fine (optional)', () => assert(validateField('isbn', '').ok));
  test('extracts an ISBN from free text', () => equal(extractIsbns('older printing: ISBN 0-435-95423-7.'), ['0435954237']));
});

group('Settings validators', () => {
  test('pace accepts 1.5', () => equal(validatePace('1.5').value, 1.5));
  test('pace rejects 1.555 (3 decimals)', () => assert(!validatePace('1.555').ok));
  test('pace rejects 0', () => assert(!validatePace('0').ok));
  test('blank cap means no cap', () => equal(validateCap('').value, 0));
  test('cap rejects "5k"', () => assert(!validateCap('5k').ok));
});

group('Record & import validation', () => {
  test('a full record passes', () => assert(validateRecord(book()).ok));
  test('bad id is rejected', () => assert(!validateRecord(book({ id: 'abc' })).ok));
  test('pages as a string is rejected', () => assert(!validateRecord(book({ pages: '209' })).ok));
  test('missing timestamps are rejected', () => assert(!validateRecord(book({ createdAt: undefined })).ok));
  test('import accepts a bare array', () => assert(validateImport([book()]).ok));
  test('import accepts { records: [...] }', () => assert(validateImport({ records: [book()] }).ok));
  test('import rejects a plain object', () => assert(!validateImport({ title: 'x' }).ok));
  test('import catches duplicate ids', () => {
    const res = validateImport([book(), book({ title: 'Other' })]);
    assert(!res.ok && /duplicate/.test(res.errors[0]));
  });
  test('parseImport reports broken JSON instead of throwing', () => {
    const res = parseImport('[{"title": ');
    assert(!res.ok && /valid JSON/.test(res.errors[0]));
  });
  test('validateBook collects every error', () => {
    const res = validateBook({ title: ' x', author: '', pages: 'abc', tag: '1', dateAdded: 'soon' });
    equal(Object.keys(res.errors).sort(), ['author', 'dateAdded', 'pages', 'tag', 'title']);
  });
  test('old saves: "notes" on a book becomes "description"', () => {
    const old = { ...book(), notes: 'From an older version' };
    delete old.description;
    const res = validateRecord(old);
    assert(res.ok && res.record.description === 'From an older version' && !('notes' in res.record));
  });
});

/* ---------- notes ---------- */

const note = (over = {}) => ({
  id: 'note_0001',
  bookId: 'rec_0001',
  title: 'Opening chapter',
  page: 12,
  body: 'Okonkwo is introduced through his fame as a wrestler.',
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
  ...over,
});

group('Note validation', () => {
  test('a full note passes', () => assert(validateNote(note()).ok));
  test('a general note (no book, no page) passes', () => assert(validateNote(note({ bookId: '', page: null })).ok));
  test('bad note id is rejected', () => assert(!validateNote(note({ id: 'rec_0001' })).ok));
  test('a blank page is allowed (new pages start empty)', () => assert(validateNoteField('body', '').ok));
  test('page text keeps its line breaks', () => {
    const text = 'line one\n\nline two';
    equal(validateNoteField('body', text).value, text);
  });
  test('a page over 20,000 characters is rejected', () => assert(!validateNoteField('body', 'x'.repeat(20001)).ok));
  test('tidyTitle collapses and trims spaces', () => equal(tidyTitle('  Chapter   3  notes '), 'Chapter 3 notes'));
  test('title with a trailing space is rejected', () => assert(!validateNoteField('title', 'Quote ').ok));
  test('page must be a whole number', () => {
    assert(!validateNoteField('page', '12.5').ok);
    assert(!validateNoteField('page', '0').ok);
    equal(validateNoteField('page', '').value, null);
  });
  test('repeated word in a note is a warning, not an error', () => {
    const res = validateNoteField('body', 'I liked the the ending');
    assert(res.ok && res.warning);
  });
  test('validateNoteInput collects every error', () => {
    const res = validateNoteInput({ bookId: 'nope', title: '', page: 'x', body: 'x'.repeat(20001) });
    equal(Object.keys(res.errors).sort(), ['body', 'bookId', 'page', 'title']);
  });
});

group('Notes import / export', () => {
  test('export round-trips books and notes', () => {
    const json = JSON.stringify(buildExport([book()], [note()]));
    const res = parseImport(json);
    assert(res.ok && res.hasNotes);
    equal([res.records.length, res.notes.length], [1, 1]);
  });
  test('a plain array (like seed.json) has no notes section', () => {
    const res = validateImport([book()]);
    assert(res.ok && !res.hasNotes);
  });
  test('broken notes are reported', () => {
    const res = validateImport({ records: [book()], notes: [note({ title: '' })] });
    assert(!res.ok && /title/.test(res.errors[0]));
  });
  test('duplicate note ids are caught', () => {
    const res = validateImport({ records: [], notes: [note(), note({ title: 'Again' })] });
    assert(!res.ok && /duplicate/.test(res.errors[0]));
  });
  test('"notes" that is not a list is rejected', () => {
    assert(!validateImport({ records: [], notes: 'oops' }).ok);
  });
});

group('Notes search', () => {
  const notes = [
    note(),
    note({ id: 'note_0002', bookId: '', title: 'Book club questions', body: 'Ask about chapter 9', updatedAt: '2026-10-12T10:00:00.000Z' }),
    note({ id: 'note_0003', bookId: 'rec_0002', title: 'Pale blue dot', body: 'Quote from p. 6', updatedAt: '2026-10-11T08:00:00.000Z' }),
  ];
  const titles = { rec_0001: 'Things Fall Apart', rec_0002: 'Cosmos' };
  const bookTitle = id => titles[id] || '';

  test('regex finds text in title or body', () => {
    const { tester } = compileRegex('chapter \\d+');
    equal(filterNotes(notes, tester).map(n => n.id), ['note_0002']);
  });
  test('search also matches the linked book title', () => {
    const { tester } = compileRegex('cosmos');
    equal(filterNotes(notes, tester, { bookTitle }).map(n => n.id), ['note_0003']);
  });
  test('book filter: one book, or general notes only', () => {
    equal(filterNotes(notes, null, { book: 'rec_0001' }).length, 1);
    equal(filterNotes(notes, null, { book: '' }).map(n => n.id), ['note_0002']);
  });
  test('most recently edited page comes first', () => {
    equal(sortNotes(notes).map(n => n.id), ['note_0002', 'note_0001', 'note_0003']);
    const edited = notes.map(n => (n.id === 'note_0003' ? { ...n, updatedAt: '2026-10-13T08:00:00.000Z' } : n));
    equal(sortNotes(edited)[0].id, 'note_0003');
  });
});

/* ---------- search ---------- */

const shelf = [
  book({ id: 'rec_0001', title: 'The Hobbit', author: 'J. R. R. Tolkien', pages: 310, tag: 'Fiction', dateAdded: '2026-10-09' }),
  book({ id: 'rec_0002', title: 'Cosmos', author: 'Carl Sagan', pages: 396, tag: 'Science', dateAdded: '2026-10-11' }),
  book({ id: 'rec_0003', title: 'the Odyssey', author: 'Homer', pages: 541, tag: 'Fiction', dateAdded: '2026-01-05', description: 'Fagles translation' }),
  book({ id: 'rec_0004', title: 'Zen Flesh', author: 'Paul Reps', pages: 12, tag: 'Poetry', dateAdded: '2026-10-11' }),
];

group('Safe regex compiler', () => {
  test('empty input gives no regex', () => equal(compileRegex('').re, null));
  test('invalid pattern returns an error, does not throw', () => {
    const res = compileRegex('(unclosed');
    assert(res.re === null && res.error.length > 0);
  });
  test('case-insensitive by default', () => assert(compileRegex('cosmos').tester.test('Cosmos')));
  test('case-sensitive when asked', () => assert(!compileRegex('cosmos', { caseSensitive: true }).tester.test('Cosmos')));
  test('tester has no g flag (no lastIndex surprises)', () => {
    const { tester } = compileRegex('o');
    assert(tester.test('o') && tester.test('o'));
  });
});

group('Filtering & highlighting', () => {
  test('^the\\b finds both "The" titles', () => {
    const { tester } = compileRegex('^the\\b');
    equal(filterRecords(shelf, tester, 'title').map(r => r.id), ['rec_0001', 'rec_0003']);
  });
  test('field filter limits where it looks', () => {
    const { tester } = compileRegex('fagles');
    equal(filterRecords(shelf, tester, 'title').length, 0);
    equal(filterRecords(shelf, tester, 'description').length, 1);
  });
  test('splitMatches marks every hit', () => {
    const parts = splitMatches('banana', /an/gi);
    equal(parts, [
      { text: 'b', match: false }, { text: 'an', match: true },
      { text: 'an', match: true }, { text: 'a', match: false },
    ]);
  });
  test('zero-length matches do not loop or create empty marks', () => {
    const parts = splitMatches('abc', /x*/g);
    equal(parts, [{ text: 'abc', match: false }]);
  });
  test('HTML in titles stays as text', () => {
    const parts = splitMatches('<b>bold</b>', /bold/gi);
    equal(parts.map(p => p.text).join(''), '<b>bold</b>');
  });
  test('excerpt centres on a late match', () => {
    const text = 'a'.repeat(300) + ' needle ' + 'b'.repeat(50);
    assert(excerpt(text, /needle/).includes('needle'));
  });
});

group('Sorting', () => {
  test('title A–Z ignores case', () => {
    equal(sortRecords(shelf, 'title', 'asc').map(r => r.title), ['Cosmos', 'The Hobbit', 'the Odyssey', 'Zen Flesh']);
  });
  test('pages descending', () => {
    equal(sortRecords(shelf, 'pages', 'desc').map(r => r.pages), [541, 396, 310, 12]);
  });
  test('date newest first, ties broken by title', () => {
    equal(sortRecords(shelf, 'dateAdded', 'desc').map(r => r.id), ['rec_0002', 'rec_0004', 'rec_0001', 'rec_0003']);
  });
  test('does not mutate the input', () => {
    const before = shelf.map(r => r.id).join();
    sortRecords(shelf, 'pages', 'asc');
    equal(shelf.map(r => r.id).join(), before);
  });
});

/* ---------- stats & units ---------- */

group('Stats', () => {
  const today = new Date(2026, 9, 11); // 11 Oct 2026, local time
  test('totals', () => {
    const s = computeStats(shelf, today);
    equal([s.total, s.totalPages], [4, 1259]);
  });
  test('top tag', () => equal(topTag(shelf), { name: 'Fiction', count: 2 }));
  test('top tag tie goes alphabetical', () => {
    equal(topTag([book({ tag: 'Poetry' }), book({ tag: 'History' })]).name, 'History');
  });
  test('last 7 days ends today and sums pages', () => {
    const days = lastSevenDays(shelf, today);
    equal(days.length, 7);
    equal(days[6].date, '2026-10-11');
    equal(days[6].pages, 408);
    equal(days[4].pages, 310);
  });
  test('toISODate pads month and day', () => equal(toISODate(new Date(2026, 0, 5)), '2026-01-05'));
  test('cap under / near / over', () => {
    equal(capStatus(100, 1000).level, 'under');
    equal(capStatus(950, 1000).level, 'near');
    const over = capStatus(1200, 1000);
    equal([over.level, over.over, over.remaining], ['over', 200, 0]);
  });
  test('cap of 0 means off', () => equal(capStatus(500, 0).level, 'off'));
});

group('Units', () => {
  test('300 pages at 2 min/page = 10 hours', () => equal(convert(300, 'pages', 'hours', 2), 10));
  test('90 minutes = 1.5 hours', () => equal(convert(90, 'minutes', 'hours'), 1.5));
  test('1 hour at 1.5 min/page = 40 pages', () => equal(convert(1, 'hours', 'pages', 1.5), 40));
  test('formatDuration(645)', () => equal(formatDuration(645), '10 h 45 min'));
  test('formatPages singular', () => equal(formatPages(1, 'pages', 2), '1 page'));
  test('unknown unit throws', () => {
    let threw = false;
    try { convert(1, 'pages', 'days'); } catch { threw = true; }
    assert(threw);
  });
});

group('CSV export', () => {
  test('quotes commas and doubles quotes', () => equal(csvCell('Say "hi", Bob'), '"Say ""hi"", Bob"'));
  test('neutralises formula injection', () => equal(csvCell('=SUM(A1)'), "'=SUM(A1)"));
  test('header row + one line per record', () => equal(toCSV(shelf).split('\r\n').length, 5));
});

/* ---------- report ---------- */

const all = groups.flatMap(g => g.results);
const failed = all.filter(r => !r.ok);
const summaryText = failed.length
  ? `${failed.length} of ${all.length} tests failed.`
  : `All ${all.length} tests passed.`;

if (typeof document !== 'undefined') {
  const out = document.getElementById('results');
  for (const g of groups) {
    const h = document.createElement('h2');
    h.textContent = g.name;
    const ul = document.createElement('ul');
    for (const r of g.results) {
      const li = document.createElement('li');
      li.className = r.ok ? 'pass' : 'fail';
      li.textContent = r.name;
      if (!r.ok) {
        const d = document.createElement('span');
        d.className = 'detail';
        d.textContent = r.message;
        li.append(d);
      }
      ul.append(li);
    }
    out.append(h, ul);
  }
  const summary = document.getElementById('summary');
  summary.textContent = summaryText;
  summary.className = failed.length ? 'has-fail' : 'all-pass';
} else {
  for (const g of groups) {
    console.log(`\n${g.name}`);
    for (const r of g.results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` -> ${r.message}`}`);
  }
  console.log(`\n${summaryText}`);
  if (failed.length) process.exitCode = 1;
}
