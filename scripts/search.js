// Regex search, highlighting and sorting.

export const SEARCH_FIELDS = {
  all: ['title', 'author', 'tag', 'description', 'isbn', 'dateAdded', 'pages'],
  title: ['title'],
  author: ['author'],
  tag: ['tag'],
  description: ['description'],
};

const MAX_PATTERN = 200;

// Never throws. `re` is global (for highlighting), `tester` is the same
// pattern without the g flag so .test() doesn't carry lastIndex around.
export function compileRegex(input, { caseSensitive = false } = {}) {
  if (!input) return { re: null, tester: null, error: '' };
  if (input.length > MAX_PATTERN) {
    return { re: null, tester: null, error: `Pattern is too long (max ${MAX_PATTERN} characters).` };
  }
  const flags = caseSensitive ? '' : 'i';
  try {
    return { re: new RegExp(input, flags + 'g'), tester: new RegExp(input, flags), error: '' };
  } catch (err) {
    // "Invalid regular expression: /(/: Unterminated group" -> keep the useful bit
    const reason = err.message.split(': ').pop();
    return { re: null, tester: null, error: `That pattern isn't valid: ${reason}.` };
  }
}

export function matchesRecord(rec, tester, field = 'all') {
  if (!tester) return true;
  const keys = SEARCH_FIELDS[field] || SEARCH_FIELDS.all;
  return keys.some(k => rec[k] != null && tester.test(String(rec[k])));
}

export function filterRecords(list, tester, field = 'all') {
  return tester ? list.filter(r => matchesRecord(r, tester, field)) : list.slice();
}

// book: 'any' (every note), '' (general notes only) or a book id.
// bookTitle(id) lets a search like "hawking" find notes on that book.
export function filterNotes(list, tester, { book = 'any', bookTitle = () => '' } = {}) {
  return list.filter(n => {
    if (book !== 'any' && n.bookId !== book) return false;
    if (!tester) return true;
    return [n.title, n.body, bookTitle(n.bookId)].some(text => text && tester.test(text));
  });
}

// most recently edited page first, like a notes app
export function sortNotes(list) {
  return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
}

// Splits text into plain/matched pieces. Empty matches (from patterns like
// ^ or a*) are dropped so they can't produce empty <mark>s or loop forever.
export function splitMatches(text, re) {
  const str = String(text ?? '');
  if (!re || !str) return [{ text: str, match: false }];
  const global = re.global ? re : new RegExp(re.source, re.flags + 'g');
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(global)) {
    if (!m[0]) continue;
    if (m.index > last) parts.push({ text: str.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push({ text: str.slice(last), match: false });
  return parts.length ? parts : [{ text: str, match: false }];
}

// Builds DOM nodes rather than an HTML string, so titles like
// "<script>" stay as text and screen readers read the sentence normally.
export function highlight(text, re) {
  const frag = document.createDocumentFragment();
  for (const part of splitMatches(text, re)) {
    if (part.match) {
      const mark = document.createElement('mark');
      mark.textContent = part.text;
      frag.append(mark);
    } else {
      frag.append(part.text);
    }
  }
  return frag;
}

// Short preview of long text, centred on the first match if there is one.
export function excerpt(text, tester, max = 140) {
  if (!text || text.length <= max) return text || '';
  const hit = tester ? text.search(tester) : -1;
  if (hit < max - 30) return text.slice(0, max).trimEnd() + '…';
  const start = Math.max(0, hit - 40);
  const end = Math.min(text.length, start + max);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const comparators = {
  title: (a, b) => collator.compare(a.title, b.title),
  author: (a, b) => collator.compare(a.author, b.author),
  tag: (a, b) => collator.compare(a.tag, b.tag),
  pages: (a, b) => a.pages - b.pages,
  dateAdded: (a, b) => a.dateAdded.localeCompare(b.dateAdded),
};

export const SORT_KEYS = Object.keys(comparators);

export function sortRecords(list, key = 'dateAdded', dir = 'desc') {
  const cmp = comparators[key] || comparators.dateAdded;
  const sign = dir === 'asc' ? 1 : -1;
  // title as a stable tie-breaker so equal dates don't shuffle around
  return list.slice().sort((a, b) => sign * cmp(a, b) || comparators.title(a, b));
}
