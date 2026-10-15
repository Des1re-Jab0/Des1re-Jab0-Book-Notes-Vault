export const UNITS = ['pages', 'minutes', 'hours'];

const toMinutes = {
  pages: (v, pace) => v * pace,
  minutes: v => v,
  hours: v => v * 60,
};

const fromMinutes = {
  pages: (m, pace) => m / pace,
  minutes: m => m,
  hours: m => m / 60,
};

export function convert(value, from, to, minutesPerPage = 2) {
  if (!UNITS.includes(from) || !UNITS.includes(to)) throw new Error(`Unknown unit: ${from} or ${to}`);
  if (!Number.isFinite(value) || minutesPerPage <= 0) return NaN;
  return fromMinutes[to](toMinutes[from](value, minutesPerPage), minutesPerPage);
}

export function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatPages(pages, unit, minutesPerPage) {
  if (unit === 'pages') return `${pages.toLocaleString()} ${pages === 1 ? 'page' : 'pages'}`;
  const minutes = convert(pages, 'pages', 'minutes', minutesPerPage);
  if (unit === 'minutes') return `${Math.round(minutes).toLocaleString()} min`;
  return `${round(minutes / 60, 1).toLocaleString()} h`;
}
