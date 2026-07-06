import { describe, expect, it } from "vitest";
import { buildMonthGrid, isDateKey, mondayOfWeek, nextWeekday, nthWeekdayOfMonth, toDateKey } from "../shared/dates";
import { buildToday, calculateDueDate, toNudge } from "../shared/rules";
import { BIRTHDAY_CATEGORY } from "../shared/categories";
import type { LifeItem } from "../shared/types";

const baseItem: LifeItem = {
  id: "item-1",
  title: "Clean bathroom",
  category: "Home",
  cadenceDays: 7,
  dueDate: null,
  birthdayMonth: null,
  birthdayDay: null,
  reminderLeadDays: null,
  monthlyWeek: null,
  monthlyWeekday: null,
  weeklyDay: null,
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
      category: BIRTHDAY_CATEGORY,
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
      category: BIRTHDAY_CATEGORY,
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

  it("buildMonthGrid: June 2026 starts on Monday — first cell is Jun 1", () => {
    const grid = buildMonthGrid(2026, 5); // June (0-indexed)
    expect(grid[0][0]).toBe("2026-06-01");
    expect(grid[0][6]).toBe("2026-06-07");
  });

  it("buildMonthGrid: March 2026 starts on Sunday — first cell is Feb 23", () => {
    const grid = buildMonthGrid(2026, 2); // March
    expect(grid[0][0]).toBe("2026-02-23");
    expect(grid[0][6]).toBe("2026-03-01");
  });

  it("buildMonthGrid: June 2026 produces 5 rows (Jun 29–Jul 5 in last row)", () => {
    const grid = buildMonthGrid(2026, 5);
    expect(grid).toHaveLength(5);
    expect(grid[4][0]).toBe("2026-06-29");
    expect(grid[4][6]).toBe("2026-07-05");
  });

  it("buildMonthGrid: March 2026 produces 6 rows (Mar 30–31 keep the last row)", () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid).toHaveLength(6);
    expect(grid[5][0]).toBe("2026-03-30");
  });

  it("buildMonthGrid: drops last row when entirely outside the month", () => {
    // October 2026 starts Thursday; last day Oct 31 is Saturday → row 6 is all November
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(5);
    expect(grid[4][5]).toBe("2026-10-31");
  });

  it("buildMonthGrid: last cell of grid is always a Sunday", () => {
    for (const [y, m] of [[2026, 0], [2026, 5], [2026, 11]] as [number, number][]) {
      const grid = buildMonthGrid(y, m);
      const lastKey = grid[grid.length - 1][6];
      const day = new Date(lastKey + "T00:00:00").getDay();
      expect(day).toBe(0); // Sunday
    }
  });

  it("nthWeekdayOfMonth finds the 3rd Thursday and last Thursday", () => {
    expect(nthWeekdayOfMonth(2026, 6, 3, 4)).toBe("2026-07-16"); // 3rd Thursday of July 2026
    expect(nthWeekdayOfMonth(2026, 6, -1, 4)).toBe("2026-07-30"); // last Thursday of July 2026
  });

  it("nthWeekdayOfMonth handles a month that starts on the target weekday", () => {
    expect(nthWeekdayOfMonth(2026, 5, 1, 1)).toBe("2026-06-01"); // 1st Monday of June 2026 (June 1 is a Monday)
  });

  it("nthWeekdayOfMonth handles the last occurrence in a 28-day month", () => {
    expect(nthWeekdayOfMonth(2026, 1, -1, 5)).toBe("2026-02-27"); // last Friday of Feb 2026
  });

  it("schedules a monthly 'nth weekday' recurrence for the current month", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      monthlyWeek: 3,
      monthlyWeekday: 4, // Thursday
      lastCompletedAt: null
    };

    expect(calculateDueDate(item, "2026-07-01")).toBe("2026-07-16");
    expect(toNudge(item, "2026-07-01").urgency).toBe("later");
  });

  it("rolls a monthly recurrence to next month once completed this month", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      monthlyWeek: 3,
      monthlyWeekday: 4,
      lastCompletedAt: "2026-07-16"
    };

    const nudge = toNudge(item, "2026-07-16");
    expect(nudge.urgency).toBe("done");
    expect(nudge.dueDate).toBe("2026-08-20"); // 3rd Thursday of August 2026
  });

  it("marks a missed monthly occurrence overdue until the month ends", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      monthlyWeek: 3,
      monthlyWeekday: 4,
      lastCompletedAt: null
    };

    const nudge = toNudge(item, "2026-07-20");
    expect(nudge.dueDate).toBe("2026-07-16");
    expect(nudge.urgency).toBe("overdue");
  });

  it("nextWeekday finds the next matching weekday", () => {
    // 2026-07-01 is a Wednesday
    expect(nextWeekday("2026-07-01", 1, true)).toBe("2026-07-06"); // next Monday on/after
    expect(nextWeekday("2026-07-01", 3, true)).toBe("2026-07-01"); // Wednesday, inclusive → same day
    expect(nextWeekday("2026-07-06", 1, false)).toBe("2026-07-13"); // Monday, exclusive → next week
    expect(nextWeekday("2026-07-06", 1, true)).toBe("2026-07-06"); // Monday, inclusive → same day
  });

  it("schedules a weekly recurrence anchored to creation", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 1, // Monday
      lastCompletedAt: null,
      createdAt: "2026-07-01T12:00:00.000Z" // Wednesday
    };

    expect(calculateDueDate(item, "2026-07-01")).toBe("2026-07-06"); // first Monday after creation
    expect(toNudge(item, "2026-07-01").urgency).toBe("soon");
  });

  it("advances a weekly recurrence to next week once completed", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 1,
      lastCompletedAt: "2026-07-06", // completed on the Monday
      createdAt: "2026-07-01T12:00:00.000Z"
    };

    const nudge = toNudge(item, "2026-07-06");
    expect(nudge.urgency).toBe("done");
    expect(nudge.dueDate).toBe("2026-07-13"); // next Monday
  });

  it("advances a full week even when completed off the scheduled weekday", () => {
    // weeklyDay Monday, completed on a Sunday — must not re-nag the next day
    const sundayDone: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 1,
      lastCompletedAt: "2026-07-12", // Sunday
      createdAt: "2026-06-29T12:00:00.000Z"
    };
    expect(calculateDueDate(sundayDone, "2026-07-12")).toBe("2026-07-20");

    // weeklyDay Friday, completed on a Wednesday — next due is the following Friday
    const wednesdayDone: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 5,
      lastCompletedAt: "2026-07-01", // Wednesday
      createdAt: "2026-06-29T12:00:00.000Z"
    };
    expect(calculateDueDate(wednesdayDone, "2026-07-01")).toBe("2026-07-10");
  });

  it("is due the same day when created on its scheduled weekday", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 3, // Wednesday
      lastCompletedAt: null,
      createdAt: "2026-07-01T12:00:00.000Z" // Wednesday
    };
    expect(calculateDueDate(item, "2026-07-01")).toBe("2026-07-01");
    expect(toNudge(item, "2026-07-01").urgency).toBe("today");
  });

  it("marks a missed weekly occurrence overdue until completed", () => {
    const item: LifeItem = {
      ...baseItem,
      cadenceDays: null,
      weeklyDay: 1,
      lastCompletedAt: null,
      createdAt: "2026-07-01T12:00:00.000Z"
    };

    const nudge = toNudge(item, "2026-07-08"); // Wednesday after the Monday
    expect(nudge.dueDate).toBe("2026-07-06");
    expect(nudge.urgency).toBe("overdue");
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
