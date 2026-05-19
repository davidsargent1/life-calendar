const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function daysBetween(fromDateKey: string, toDateKeyValue: string): number {
  const from = parseDateKey(fromDateKey).getTime();
  const to = parseDateKey(toDateKeyValue).getTime();
  return Math.round((to - from) / DAY_MS);
}

export function nextBirthdayDate(
  todayKey: string,
  month: number,
  day: number
): string {
  const today = parseDateKey(todayKey);
  const year = today.getUTCFullYear();
  const thisYear = toDateKey(new Date(Date.UTC(year, month - 1, day)));

  if (daysBetween(todayKey, thisYear) >= 0) {
    return thisYear;
  }

  return toDateKey(new Date(Date.UTC(year + 1, month - 1, day)));
}

export function formatShortDate(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}
