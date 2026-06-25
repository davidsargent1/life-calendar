import { describe, expect, it } from "vitest";
import { isDateKey, mondayOfWeek, toDateKey } from "../shared/dates";
import { buildToday, calculateDueDate, toNudge } from "../shared/rules";
import type { LifeItem } from "../shared/types";

const baseItem: LifeItem = {
  id: "item-1",
  type: "chore",
  title: "Clean bathroom",
  category: "Home",
  cadenceDays: 7,
  dueDate: null,
  birthdayMonth: null,
  birthdayDay: null,
  reminderLeadDays: null,
  lastCompletedAt: "2026-05-10",
  contactName: null,
  archived: false,
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-05-01T12:00:00.000Z"
};

describe("life reminder rules", () => {
  it("marks recurring chores as overdue when their cadence has passed", () => {
    const nudge = toNudge(baseItem, "2026-05-19");

    expect(nudge.dueDate).toBe("2026-05-17");
    expect(nudge.urgency).toBe("overdue");
    expect(nudge.daysUntilDue).toBe(-2);
  });

  it("moves completed items to done for the current day", () => {
    const nudge = toNudge({ ...baseItem, lastCompletedAt: "2026-05-19" }, "2026-05-19");

    expect(nudge.urgency).toBe("done");
    expect(nudge.message).toBe("Clean bathroom done.");
  });

  it("uses birthday lead time as the due date", () => {
    const item: LifeItem = {
      ...baseItem,
      type: "birthday",
      title: "Buy Maya's birthday present",
      cadenceDays: null,
      birthdayMonth: 5,
      birthdayDay: 26,
      reminderLeadDays: 7,
      lastCompletedAt: null
    };

    expect(calculateDueDate(item, "2026-05-19")).toBe("2026-05-19");
    expect(toNudge(item, "2026-05-19").urgency).toBe("today");
  });

  it("does not resurface a birthday reminder after it is completed for the current cycle", () => {
    const item: LifeItem = {
      ...baseItem,
      type: "birthday",
      title: "Buy Maya's birthday present",
      cadenceDays: null,
      birthdayMonth: 5,
      birthdayDay: 26,
      reminderLeadDays: 7,
      lastCompletedAt: "2026-05-19"
    };

    const nudge = toNudge(item, "2026-05-20");

    expect(nudge.urgency).not.toBe("overdue");
    expect(nudge.dueDate).toBe("2027-05-19");
  });

  it("uses local date parts for kiosk date keys", () => {
    expect(toDateKey(new Date(2026, 4, 19, 20))).toBe("2026-05-19");
  });

  it("validates date keys before storing completions", () => {
    expect(isDateKey("2026-05-19")).toBe(true);
    expect(isDateKey("bogus")).toBe(false);
    expect(isDateKey("2026-02-31")).toBe(false);
  });

  it("mondayOfWeek returns Monday for a Wednesday input", () => {
    const wed = new Date(2026, 5, 24); // Wed Jun 24 2026
    expect(toDateKey(mondayOfWeek(wed))).toBe("2026-06-22");
  });

  it("mondayOfWeek returns the same day for a Monday input", () => {
    const mon = new Date(2026, 5, 22); // Mon Jun 22 2026
    expect(toDateKey(mondayOfWeek(mon))).toBe("2026-06-22");
  });

  it("mondayOfWeek crosses year boundary correctly", () => {
    const fri = new Date(2026, 0, 2); // Fri Jan 2 2026
    expect(toDateKey(mondayOfWeek(fri))).toBe("2025-12-29");
  });

  it("mondayOfWeek handles Sunday as the last day of a week", () => {
    const sun = new Date(2026, 5, 28); // Sun Jun 28 2026
    expect(toDateKey(mondayOfWeek(sun))).toBe("2026-06-22");
  });

  it("groups the dashboard by urgency", () => {
    const response = buildToday(
      [
        baseItem,
        { ...baseItem, id: "item-2", title: "Go grocery shopping", lastCompletedAt: "2026-05-12" },
        { ...baseItem, id: "item-3", title: "Water plants", lastCompletedAt: "2026-05-18" }
      ],
      "2026-05-19"
    );

    expect(response.sections.overdue).toHaveLength(1);
    expect(response.sections.today).toHaveLength(1);
    expect(response.sections.soon).toHaveLength(1);
  });
});
