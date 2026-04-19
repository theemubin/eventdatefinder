const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseIsoDate(value) {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function eachDateBetween(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || start > end) return [];

  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    out.push(toIsoDate(new Date(t)));
  }
  return out;
}

export function normalizeExcludedDates(excludedDates, startIso, endIso) {
  if (!Array.isArray(excludedDates)) return [];
  const allowed = new Set(eachDateBetween(startIso, endIso));
  return [...new Set(excludedDates)]
    .filter((d) => isIsoDate(d) && allowed.has(d))
    .sort();
}

export function getAvailableDates(startIso, endIso, excludedDates) {
  const excluded = new Set(excludedDates || []);
  return eachDateBetween(startIso, endIso).filter((d) => !excluded.has(d));
}
