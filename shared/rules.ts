import type { LifeItem, TodayNudge, TodayResponse, Urgency } from "./types";
import { addDays, daysBetween, nextBirthdayDate } from "./dates";

const SOON_WINDOW_DAYS = 7;

export function calculateDueDate(item: LifeItem, todayKey: string): string | null {
  if (item.type === "birthday" && item.birthdayMonth && item.birthdayDay) {
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

  if (item.type === "contact" && item.contactName && daysUntilDue !== null && daysUntilDue < 0) {
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
