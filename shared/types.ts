export type LifeItem = {
  id: string;
  title: string;
  category: string;
  cadenceDays: number | null;
  dueDate: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  reminderLeadDays: number | null;
  // Monthly "nth weekday" recurrence, e.g. every 3rd Thursday.
  // monthlyWeek: 1-4 (first..fourth) or -1 (last); monthlyWeekday: 0 (Sun) - 6 (Sat).
  monthlyWeek: number | null;
  monthlyWeekday: number | null;
  // Weekly recurrence on a fixed weekday, e.g. every Monday. 0 (Sun) - 6 (Sat).
  weeklyDay: number | null;
  lastCompletedAt: string | null;
  contactName: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Urgency = "overdue" | "today" | "soon" | "later" | "done";

export type TodayNudge = {
  item: LifeItem;
  urgency: Urgency;
  dueDate: string | null;
  daysUntilDue: number | null;
  message: string;
};

export type TodayResponse = {
  date: string;
  sections: {
    overdue: TodayNudge[];
    today: TodayNudge[];
    soon: TodayNudge[];
    done: TodayNudge[];
  };
};

export type CreateLifeItemInput = {
  title: string;
  category?: string;
  cadenceDays?: number | null;
  dueDate?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  reminderLeadDays?: number | null;
  monthlyWeek?: number | null;
  monthlyWeekday?: number | null;
  weeklyDay?: number | null;
  contactName?: string | null;
};

export type UpdateLifeItemInput = Partial<CreateLifeItemInput>;
