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
    const birthday = nextBirthdayDate(todayKey, item.birthdayMonth, item.birthdayDay);
    const reminderDate = addDays(birthday, -(item.reminderLeadDays ?? 7));

    if (
      item.lastCompletedAt &&
      daysBetween(reminderDate, item.lastCompletedAt) >= 0 &&
      daysBetween(item.lastCompletedAt, birthday) >= 0
    ) {
      const nextBirthday = nextBirthdayDate(addDays(birthday, 1), item.birthdayMonth, item.birthdayDay);
      return addDays(nextBirthday, -(item.reminderLeadDays ?? 7));
    }

    return reminderDate;
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
  urgency: Urgency,
  daysUntilDue: number | null
): string {
  if (urgency === "done") {
    return `${item.title} done.`;
  }

  if (isPeopleCategory(item.category) && item.contactName && daysUntilDue !== null && daysUntilDue < 0) {
    return `Call ${item.contactName}.`;
  }

  return item.title.endsWith(".") ? item.title : `${item.title}.`;
}

export function toNudge(item: LifeItem, todayKey: string): TodayNudge {
  const dueDate = calculateDueDate(item, todayKey);
  const daysUntilDue = dueDate ? daysBetween(todayKey, dueDate) : null;
  const urgency = calculateUrgency(item, todayKey, dueDate);

  return {
    item,
    urgency,
    dueDate,
    daysUntilDue,
    message: buildMessage(item, urgency, daysUntilDue)
  };
}

export function buildToday(items: LifeItem[], todayKey: string): TodayResponse {
  const nudges = items.map((item) => toNudge(item, todayKey));

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
    return aDays - bDays || a.item.title.localeCompare(b.item.title);
  });
}
