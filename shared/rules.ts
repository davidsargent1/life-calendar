import type { LifeItem, TodayNudge, TodayResponse, Urgency } from "./types";
import { addDays, daysBetween, nextBirthdayDate, nextWeekday, nthWeekdayOfMonth } from "./dates";
import { isBirthdayCategory, isPeopleCategory } from "./categories";

const SOON_WINDOW_DAYS = 7;

// Next occurrence of a monthly "nth weekday" recurrence. If this month's
// occurrence has already been completed (i.e. lastCompletedAt falls in the
// current month), roll forward to next month's occurrence; otherwise this
// month's occurrence stands — upcoming, due today, or overdue if it passed.
function nextMonthlyOccurrence(
  todayKey: string,
  week: number,
  weekday: number,
  lastCompletedAt: string | null
): string {
  const year = Number(todayKey.slice(0, 4));
  const month = Number(todayKey.slice(5, 7)) - 1; // 0-indexed
  const completedThisMonth = lastCompletedAt != null && lastCompletedAt.slice(0, 7) === todayKey.slice(0, 7);

  if (completedThisMonth) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    return nthWeekdayOfMonth(nextYear, nextMonth, week, weekday);
  }

  return nthWeekdayOfMonth(year, month, week, weekday);
}

export function calculateDueDate(item: LifeItem, todayKey: string): string | null {
  if (isBirthdayCategory(item.category) && item.birthdayMonth && item.birthdayDay) {
    // The primary reminder lands on the birthday itself; any "remind before"
    // lead is surfaced as a separate occurrence (see itemOccurrences), not by
    // moving this date earlier. The cycle is considered handled if the item
    // was completed any time from the lead date up to the birthday.
    const birthday = nextBirthdayDate(todayKey, item.birthdayMonth, item.birthdayDay);
    const cycleStart = addDays(birthday, -(item.reminderLeadDays ?? 0));

    if (
      item.lastCompletedAt &&
      daysBetween(cycleStart, item.lastCompletedAt) >= 0 &&
      daysBetween(item.lastCompletedAt, birthday) >= 0
    ) {
      return nextBirthdayDate(addDays(birthday, 1), item.birthdayMonth, item.birthdayDay);
    }

    return birthday;
  }

  if (item.monthlyWeek != null && item.monthlyWeekday != null) {
    return nextMonthlyOccurrence(todayKey, item.monthlyWeek, item.monthlyWeekday, item.lastCompletedAt);
  }

  if (item.weeklyDay != null) {
    // Anchor the first occurrence to creation (like interval mode). On
    // completion, snap to the occurrence the completion satisfies (the
    // weekday on/after it) then advance a full week — so completing early or
    // late still yields a ~weekly gap rather than re-nagging within days.
    return item.lastCompletedAt
      ? nextWeekday(nextWeekday(item.lastCompletedAt, item.weeklyDay, true), item.weeklyDay, false)
      : nextWeekday(item.createdAt.slice(0, 10), item.weeklyDay, true);
  }

  if (item.cadenceDays && item.lastCompletedAt) {
    return addDays(item.lastCompletedAt, item.cadenceDays);
  }

  if (item.dueDate) {
    return item.dueDate;
  }

  if (item.cadenceDays) {
    return addDays(item.createdAt.slice(0, 10), item.cadenceDays);
  }

  return null;
}

// A single dated appearance of an item on the calendar / today board. Most
// items have one (the primary); a birthday with a "remind before" lead has a
// second, derived occurrence that many days earlier.
export type Occurrence = {
  item: LifeItem;
  title: string;
  dueDate: string | null;
  kind: "primary" | "lead";
};

// Label for a birthday's lead reminder, e.g. "7 days until Mom's birthday".
export function leadReminderTitle(title: string, leadDays: number): string {
  return `${leadDays} day${leadDays === 1 ? "" : "s"} until ${title}`;
}

// Expand an item into the occurrences it shows on the calendar. Every item has
// a primary occurrence on its due date; a birthday with a positive "remind
// before" lead adds a second occurrence that many days ahead of the birthday.
export function itemOccurrences(item: LifeItem, todayKey: string): Occurrence[] {
  const dueDate = calculateDueDate(item, todayKey);
  const occurrences: Occurrence[] = [{ item, title: item.title, dueDate, kind: "primary" }];

  const lead = item.reminderLeadDays ?? 0;
  if (isBirthdayCategory(item.category) && item.birthdayMonth && item.birthdayDay && lead > 0 && dueDate) {
    occurrences.push({
      item,
      title: leadReminderTitle(item.title, lead),
      dueDate: addDays(dueDate, -lead),
      kind: "lead"
    });
  }

  return occurrences;
}

export function calculateUrgency(
  item: LifeItem,
  todayKey: string,
  dueDate: string | null
): Urgency {
  if (item.lastCompletedAt === todayKey) {
    return "done";
  }

  if (!dueDate) {
    return "later";
  }

  const daysUntilDue = daysBetween(todayKey, dueDate);

  if (daysUntilDue < 0) {
    return "overdue";
  }

  if (daysUntilDue === 0) {
    return "today";
  }

  if (daysUntilDue <= SOON_WINDOW_DAYS) {
    return "soon";
  }

  return "later";
}

export function buildMessage(
  item: LifeItem,
  title: string,
  urgency: Urgency,
  daysUntilDue: number | null
): string {
  if (urgency === "done") {
    return `${title} done.`;
  }

  if (isPeopleCategory(item.category) && item.contactName && daysUntilDue !== null && daysUntilDue < 0) {
    return `Call ${item.contactName}.`;
  }

  return title.endsWith(".") ? title : `${title}.`;
}

function occurrenceNudge(occurrence: Occurrence, todayKey: string): TodayNudge {
  const { item, title, dueDate } = occurrence;
  const daysUntilDue = dueDate ? daysBetween(todayKey, dueDate) : null;
  const urgency = calculateUrgency(item, todayKey, dueDate);

  return {
    item,
    key: occurrence.kind === "primary" ? item.id : `${item.id}:${occurrence.kind}`,
    title,
    urgency,
    dueDate,
    daysUntilDue,
    message: buildMessage(item, title, urgency, daysUntilDue)
  };
}

export function toNudge(item: LifeItem, todayKey: string): TodayNudge {
  return occurrenceNudge(
    { item, title: item.title, dueDate: calculateDueDate(item, todayKey), kind: "primary" },
    todayKey
  );
}

// Nudges for a single item, expanding a birthday's lead reminder into its own
// card. Once the birthday is completed for the cycle both occurrences roll to
// next year and read as "done"; keep only the primary so the board shows one
// "done" card rather than a duplicate.
function itemNudges(item: LifeItem, todayKey: string): TodayNudge[] {
  return itemOccurrences(item, todayKey)
    .map((occurrence) => occurrenceNudge(occurrence, todayKey))
    .filter((nudge) => !(nudge.key.endsWith(":lead") && nudge.urgency === "done"));
}

export function buildToday(items: LifeItem[], todayKey: string): TodayResponse {
  const nudges = items.flatMap((item) => itemNudges(item, todayKey));

  return {
    date: todayKey,
    sections: {
      overdue: sortNudges(nudges.filter((nudge) => nudge.urgency === "overdue")),
      today: sortNudges(nudges.filter((nudge) => nudge.urgency === "today")),
      soon: sortNudges(nudges.filter((nudge) => nudge.urgency === "soon")),
      done: sortNudges(nudges.filter((nudge) => nudge.urgency === "done"))
    }
  };
}

function sortNudges(nudges: TodayNudge[]): TodayNudge[] {
  return nudges.sort((a, b) => {
    const aDays = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
    return aDays - bDays || a.title.localeCompare(b.title);
  });
}
