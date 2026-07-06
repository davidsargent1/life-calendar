const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toUtcDateKey(date);
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseDateKey(value);
  return toUtcDateKey(parsed) === value;
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
  const thisYear = toUtcDateKey(new Date(Date.UTC(year, month - 1, day)));

  if (daysBetween(todayKey, thisYear) >= 0) {
    return thisYear;
  }

  return toUtcDateKey(new Date(Date.UTC(year + 1, month - 1, day)));
}

// The next date landing on `weekday` (0=Sun..6=Sat) relative to fromDateKey.
// inclusive=true returns fromDateKey itself when it already is that weekday;
// inclusive=false always moves forward to the following week's occurrence.
export function nextWeekday(fromDateKey: string, weekday: number, inclusive: boolean): string {
  const dow = parseDateKey(fromDateKey).getUTCDay();
  let delta = (weekday - dow + 7) % 7;
  if (delta === 0 && !inclusive) {
    delta = 7;
  }
  return addDays(fromDateKey, delta);
}

export function formatShortDate(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

export function buildMonthGrid(year: number, month: number): string[][] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  const firstDow = firstOfMonth.getDay(); // 0=Sun
  gridStart.setDate(gridStart.getDate() - ((firstDow + 6) % 7));

  const grid: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridStart);
      cell.setDate(gridStart.getDate() + w * 7 + d);
      week.push(toDateKey(cell));
    }
    grid.push(week);
  }

  const lastRow = grid[5];
  if (lastRow.every(k => Number(k.slice(5, 7)) - 1 !== month)) {
    grid.pop();
  }

  return grid;
}

// The date of the nth occurrence of a weekday in a month.
// week: 1-4 for the first..fourth occurrence, or -1 for the last.
// weekday: 0 (Sunday) .. 6 (Saturday), matching Date.getDay().
export function nthWeekdayOfMonth(year: number, month: number, week: number, weekday: number): string {
  if (week === -1) {
    const lastOfMonth = new Date(year, month + 1, 0); // day 0 of next month = last day
    const backtrack = (lastOfMonth.getDay() - weekday + 7) % 7;
    return toDateKey(new Date(year, month, lastOfMonth.getDate() - backtrack));
  }

  const firstOfMonth = new Date(year, month, 1);
  const offset = (weekday - firstOfMonth.getDay() + 7) % 7;
  return toDateKey(new Date(year, month, 1 + offset + (week - 1) * 7));
}

export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
