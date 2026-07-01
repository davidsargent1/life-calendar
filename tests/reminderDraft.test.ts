import { describe, expect, it } from "vitest";
import { applicablePayload, initialRepeatMode, itemToDraft } from "../src/reminderDraft";
import type { LifeItem } from "../shared/types";

const monthlyItem: LifeItem = {
  id: "item-1",
  type: "chore",
  title: "Deep clean",
  category: "Home",
  cadenceDays: null,
  dueDate: null,
  birthdayMonth: null,
  birthdayDay: null,
  reminderLeadDays: null,
  monthlyWeek: 3,
  monthlyWeekday: 4, // Thursday
  lastCompletedAt: null,
  contactName: null,
  archived: false,
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-05-01T12:00:00.000Z"
};

describe("reminder draft round-trip", () => {
  it("preserves a monthly schedule when an item is opened for editing", () => {
    const draft = itemToDraft(monthlyItem);

    expect(draft.monthlyWeek).toBe(3);
    expect(draft.monthlyWeekday).toBe(4);
    expect(initialRepeatMode(draft)).toBe("monthly");

    // Saving an unrelated edit must keep the schedule intact.
    const payload = applicablePayload({ ...draft, title: "Deep clean (edited)" });
    expect(payload.monthlyWeek).toBe(3);
    expect(payload.monthlyWeekday).toBe(4);
    expect(payload.cadenceDays).toBeNull();
  });

  it("opens interval and one-off items in the right mode", () => {
    expect(initialRepeatMode(itemToDraft({ ...monthlyItem, monthlyWeek: null, monthlyWeekday: null, cadenceDays: 7 }))).toBe("interval");
    expect(initialRepeatMode(itemToDraft({ ...monthlyItem, monthlyWeek: null, monthlyWeekday: null, dueDate: "2026-07-04" }))).toBe("oneoff");
  });

  it("drops the monthly schedule when the type becomes birthday", () => {
    const payload = applicablePayload(itemToDraft({ ...monthlyItem, type: "birthday" }));
    expect(payload.monthlyWeek).toBeNull();
    expect(payload.monthlyWeekday).toBeNull();
  });
});
