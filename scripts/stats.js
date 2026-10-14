// Numbers for the dashboard. Pure functions, easy to test.

export function toISODate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function topTag(records) {
  const counts = new Map();
  for (const r of records) counts.set(r.tag, (counts.get(r.tag) || 0) + 1);
  let best = null;
  for (const [name, count] of counts) {
    // ties go to the alphabetically first tag so the result is predictable
    if (!best || count > best.count || (count === best.count && name.localeCompare(best.name) < 0)) {
      best = { name, count };
    }
  }
  return best;
}

// One entry per day, oldest first, ending today.
export function lastSevenDays(records, today = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({
      date: toISODate(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      longLabel: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
      books: 0,
      pages: 0,
    });
  }
  const byDate = new Map(days.map(d => [d.date, d]));
  for (const r of records) {
    const day = byDate.get(r.dateAdded);
    if (day) {
      day.books += 1;
      day.pages += r.pages;
    }
  }
  return days;
}

export function computeStats(records, today = new Date()) {
  const totalPages = records.reduce((sum, r) => sum + r.pages, 0);
  const longest = records.reduce((best, r) => (!best || r.pages > best.pages ? r : best), null);
  return {
    total: records.length,
    totalPages,
    averagePages: records.length ? Math.round(totalPages / records.length) : 0,
    longest,
    topTag: topTag(records),
    trend: lastSevenDays(records, today),
  };
}

// level: 'off' (no cap), 'under', 'near' (90%+), 'over'
export function capStatus(used, cap) {
  if (!cap) return { level: 'off', used, cap: 0, remaining: 0, over: 0, percent: 0 };
  const percent = Math.round((used / cap) * 100);
  const level = used > cap ? 'over' : percent >= 90 ? 'near' : 'under';
  return {
    level,
    used,
    cap,
    remaining: Math.max(0, cap - used),
    over: Math.max(0, used - cap),
    percent,
  };
}
