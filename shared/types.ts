export type LifeItemType = "contact" | "chore" | "birthday" | "shopping" | "routine";

export type LifeItem = {
  id: string;
  type: LifeItemType;
  title: string;
  category: string;
  cadenceDays: number | null;
  dueDate: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  reminderLeadDays: number | null;
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
  type: LifeItemType;
  title: string;
  category?: string;
  cadenceDays?: number | null;
  dueDate?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  reminderLeadDays?: number | null;
  contactName?: string | null;
};

export type UpdateLifeItemInput = Partial<CreateLifeItemInput>;
