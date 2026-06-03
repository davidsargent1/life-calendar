import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { toDateKey } from "../shared/dates";
import type { CreateLifeItemInput, LifeItem, UpdateLifeItemInput } from "../shared/types";

const dbPath = join(process.cwd(), "data", "life-calendar.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      cadence_days INTEGER,
      due_date TEXT,
      birthday_month INTEGER,
      birthday_day INTEGER,
      reminder_lead_days INTEGER,
      last_completed_at TEXT,
      contact_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  // Incremental migrations
  const cols = (db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes("archived")) {
    db.exec("ALTER TABLE items ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
}

export function seedIfEmpty(): void {
  const count = db.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };

  if (count.count > 0) {
    return;
  }

  const today = toDateKey(new Date());
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO items (
      id, type, title, category, cadence_days, due_date, birthday_month,
      birthday_day, reminder_lead_days, last_completed_at, contact_name,
      archived, created_at, updated_at
    ) VALUES (
      @id, @type, @title, @category, @cadenceDays, @dueDate, @birthdayMonth,
      @birthdayDay, @reminderLeadDays, @lastCompletedAt, @contactName,
      @archived, @createdAt, @updatedAt
    )
  `);

  const seedItems: LifeItem[] = [
    {
      id: crypto.randomUUID(),
      type: "contact",
      title: "Call Grandma",
      category: "People",
      cadenceDays: 30,
      dueDate: null,
      birthdayMonth: null,
      birthdayDay: null,
      reminderLeadDays: null,
      lastCompletedAt: offsetDate(today, -34),
      contactName: "Grandma",
      archived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: crypto.randomUUID(),
      type: "shopping",
      title: "Go grocery shopping",
      category: "Shopping",
      cadenceDays: 7,
      dueDate: null,
      birthdayMonth: null,
      birthdayDay: null,
      reminderLeadDays: null,
      lastCompletedAt: offsetDate(today, -7),
      contactName: null,
      archived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: crypto.randomUUID(),
      type: "chore",
      title: "Clean bathroom",
      category: "Home",
      cadenceDays: 7,
      dueDate: null,
      birthdayMonth: null,
      birthdayDay: null,
      reminderLeadDays: null,
      lastCompletedAt: offsetDate(today, -10),
      contactName: null,
      archived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: crypto.randomUUID(),
      type: "birthday",
      title: "Buy Maya's birthday present",
      category: "Events",
      cadenceDays: null,
      dueDate: null,
      birthdayMonth: birthdayParts(offsetDate(today, 7)).month,
      birthdayDay: birthdayParts(offsetDate(today, 7)).day,
      reminderLeadDays: 7,
      lastCompletedAt: null,
      contactName: "Maya",
      archived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const transaction = db.transaction((items: LifeItem[]) => {
    for (const item of items) {
      insert.run(toDbParams(item));
    }
  });

  transaction(seedItems);
}

export function listItems(includeArchived = false): LifeItem[] {
  const sql = includeArchived
    ? "SELECT * FROM items ORDER BY archived ASC, category, title"
    : "SELECT * FROM items WHERE archived = 0 ORDER BY category, title";
  return db.prepare(sql).all().map(fromRow);
}

export function archiveItem(id: string): LifeItem | null {
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE items SET archived = 1, updated_at = ? WHERE id = ?").run(now, id);
  if (result.changes === 0) return null;
  return getItem(id);
}

export function unarchiveItem(id: string): LifeItem | null {
  const now = new Date().toISOString();
  const result = db.prepare("UPDATE items SET archived = 0, updated_at = ? WHERE id = ?").run(now, id);
  if (result.changes === 0) return null;
  return getItem(id);
}

export function getItem(id: string): LifeItem | null {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  return row ? fromRow(row) : null;
}

export function createItem(input: CreateLifeItemInput): LifeItem {
  const now = new Date().toISOString();
  const item: LifeItem = {
    id: crypto.randomUUID(),
    type: input.type,
    title: input.title.trim(),
    category: input.category?.trim() || defaultCategory(input.type),
    cadenceDays: input.cadenceDays ?? null,
    dueDate: input.dueDate ?? null,
    birthdayMonth: input.birthdayMonth ?? null,
    birthdayDay: input.birthdayDay ?? null,
    reminderLeadDays: input.reminderLeadDays ?? null,
    lastCompletedAt: null,
    contactName: input.contactName?.trim() || null,
    archived: false,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO items (
      id, type, title, category, cadence_days, due_date, birthday_month,
      birthday_day, reminder_lead_days, last_completed_at, contact_name,
      archived, created_at, updated_at
    ) VALUES (
      @id, @type, @title, @category, @cadenceDays, @dueDate, @birthdayMonth,
      @birthdayDay, @reminderLeadDays, @lastCompletedAt, @contactName,
      @archived, @createdAt, @updatedAt
    )
  `).run(toDbParams(item));

  return item;
}

export function updateItem(id: string, input: UpdateLifeItemInput): LifeItem | null {
  const existing = getItem(id);

  if (!existing) {
    return null;
  }

  const updated: LifeItem = {
    ...existing,
    ...input,
    title: input.title?.trim() ?? existing.title,
    category: input.category?.trim() ?? existing.category,
    contactName: input.contactName?.trim() ?? existing.contactName,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE items
    SET
      type = @type,
      title = @title,
      category = @category,
      cadence_days = @cadenceDays,
      due_date = @dueDate,
      birthday_month = @birthdayMonth,
      birthday_day = @birthdayDay,
      reminder_lead_days = @reminderLeadDays,
      last_completed_at = @lastCompletedAt,
      contact_name = @contactName,
      updated_at = @updatedAt
    WHERE id = @id
  `).run(toDbParams(updated));

  return getItem(id);
}

export function completeItem(id: string, completedAt: string): LifeItem | null {
  const existing = getItem(id);

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const completionId = crypto.randomUUID();

  db.transaction(() => {
    db.prepare("INSERT INTO completions (id, item_id, completed_at) VALUES (?, ?, ?)").run(
      completionId,
      id,
      completedAt
    );
    db.prepare("UPDATE items SET last_completed_at = ?, updated_at = ? WHERE id = ?").run(
      completedAt,
      now,
      id
    );
  })();

  return getItem(id);
}

export function deleteItem(id: string): boolean {
  const result = db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return result.changes > 0;
}

function fromRow(row: unknown): LifeItem {
  const item = row as Record<string, string | number | null>;

  return {
    id: String(item.id),
    type: item.type as LifeItem["type"],
    title: String(item.title),
    category: String(item.category),
    cadenceDays: item.cadence_days as number | null,
    dueDate: item.due_date as string | null,
    birthdayMonth: item.birthday_month as number | null,
    birthdayDay: item.birthday_day as number | null,
    reminderLeadDays: item.reminder_lead_days as number | null,
    lastCompletedAt: item.last_completed_at as string | null,
    contactName: item.contact_name as string | null,
    archived: Boolean(item.archived),
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at)
  };
}

function toDbParams(item: LifeItem): Record<string, string | number | null> {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    category: item.category,
    cadenceDays: item.cadenceDays,
    dueDate: item.dueDate,
    birthdayMonth: item.birthdayMonth,
    birthdayDay: item.birthdayDay,
    reminderLeadDays: item.reminderLeadDays,
    lastCompletedAt: item.lastCompletedAt,
    contactName: item.contactName,
    archived: item.archived ? 1 : 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function defaultCategory(type: LifeItem["type"]): string {
  const categories: Record<LifeItem["type"], string> = {
    birthday: "Events",
    chore: "Home",
    contact: "People",
    routine: "Routine",
    shopping: "Shopping"
  };

  return categories[type];
}

function offsetDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function birthdayParts(dateKey: string): { month: number; day: number } {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}
