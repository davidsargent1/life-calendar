import { describe, expect, it } from "vitest";
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
