import type { CreateLifeItemInput, LifeItem } from "../shared/types";

export type RepeatMode = "interval" | "weekly" | "monthly" | "oneoff";

// Copy an existing item into an editable draft. Kept as one function so a
// newly added field can't be silently dropped by one of several call sites.
export function itemToDraft(item: LifeItem): CreateLifeItemInput {
  return {
    type: item.type,
    title: item.title,
    category: item.category,
    cadenceDays: item.cadenceDays,
    dueDate: item.dueDate,
    birthdayMonth: item.birthdayMonth,
    birthdayDay: item.birthdayDay,
    reminderLeadDays: item.reminderLeadDays,
    monthlyWeek: item.monthlyWeek,
    monthlyWeekday: item.monthlyWeekday,
    weeklyDay: item.weeklyDay,
    contactName: item.contactName
  };
}

export function initialRepeatMode(draft: CreateLifeItemInput): RepeatMode {
  if (draft.monthlyWeek != null && draft.monthlyWeekday != null) return "monthly";
  if (draft.weeklyDay != null) return "weekly";
  if (draft.dueDate) return "oneoff";
  return "interval";
}

// Build the save payload from only the fields that apply to the chosen type,
// sending explicit nulls for the rest. Without this, switching type would
// silently persist stale values from hidden fields (e.g. a birthday keeping
// the cadenceDays it had as a chore).
export function applicablePayload(draft: CreateLifeItemInput): CreateLifeItemInput {
  const isBirthday = draft.type === "birthday";
  const showPerson = isBirthday || draft.type === "contact";
  return {
    type: draft.type,
    title: draft.title,
    category: draft.category,
    cadenceDays: isBirthday ? null : draft.cadenceDays ?? null,
    dueDate: isBirthday ? null : draft.dueDate ?? null,
    monthlyWeek: isBirthday ? null : draft.monthlyWeek ?? null,
    monthlyWeekday: isBirthday ? null : draft.monthlyWeekday ?? null,
    weeklyDay: isBirthday ? null : draft.weeklyDay ?? null,
    birthdayMonth: isBirthday ? draft.birthdayMonth ?? null : null,
    birthdayDay: isBirthday ? draft.birthdayDay ?? null : null,
    reminderLeadDays: isBirthday ? draft.reminderLeadDays ?? null : null,
    contactName: showPerson ? draft.contactName ?? null : null
  };
}
