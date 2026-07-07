import "dotenv/config";
import OpenAI from "openai";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  archiveItem,
  completeItem,
  createItem,
  deleteItem,
  getItem,
  listItems,
  migrate,
  seedIfEmpty,
  unarchiveItem,
  updateItem
} from "./db";
import { isDateKey, toDateKey } from "../shared/dates";
import { DEFAULT_CATEGORY, PRESET_CATEGORIES, isBirthdayCategory, normalizeCategory, resolveCategory } from "../shared/categories";
import { buildToday } from "../shared/rules";
import type { CreateLifeItemInput, UpdateLifeItemInput } from "../shared/types";

const app = express();
const port = Number(process.env.PORT ?? 8787);

migrate();
seedIfEmpty();

app.use(cors());
app.use(express.json());

const parseReminderLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment and try again" }
});

// LLM provider config — point at any OpenAI-compatible endpoint:
//   Ollama (local): LLM_BASE_URL=http://localhost:11434/v1, LLM_API_KEY=ollama, LLM_MODEL=llama3.2:3b
//   OpenAI:         leave LLM_BASE_URL unset, LLM_API_KEY=sk-..., LLM_MODEL=gpt-4o-mini
//   Gemini:         LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai, LLM_API_KEY=<key>, LLM_MODEL=gemini-2.0-flash
const LLM_BASE_URL = process.env.LLM_BASE_URL; // unset = OpenAI's default endpoint
const LLM_API_KEY = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isValidBirthdayDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month];
}

const VALID_MONTHLY_WEEKS = new Set([1, 2, 3, 4, -1]);

// A monthly "nth weekday" schedule needs both parts: week 1-4 (or -1 = last)
// and weekday 0 (Sun) - 6 (Sat).
function isValidMonthly(week: unknown, weekday: unknown): boolean {
  return (
    typeof week === "number" &&
    VALID_MONTHLY_WEEKS.has(week) &&
    typeof weekday === "number" &&
    Number.isInteger(weekday) &&
    weekday >= 0 &&
    weekday <= 6
  );
}

function isValidWeekday(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function validateParsedReminder(raw: unknown): CreateLifeItemInput {
  if (!raw || typeof raw !== "object") throw new Error("AI returned unexpected format");
  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== "string" || !obj.title.trim()) throw new Error("AI response missing title");

  const result: CreateLifeItemInput = {
    title: String(obj.title).trim()
  };

  if (typeof obj.category === "string" && obj.category.trim()) result.category = normalizeCategory(obj.category);
  if (typeof obj.cadenceDays === "number" && obj.cadenceDays > 0) result.cadenceDays = Math.round(obj.cadenceDays);
  if (typeof obj.dueDate === "string" && isDateKey(obj.dueDate)) result.dueDate = obj.dueDate;
  if (typeof obj.birthdayMonth === "number" && obj.birthdayMonth >= 1 && obj.birthdayMonth <= 12) result.birthdayMonth = Math.round(obj.birthdayMonth);
  if (typeof obj.birthdayDay === "number" && isValidBirthdayDay(result.birthdayMonth ?? 0, obj.birthdayDay)) result.birthdayDay = Math.round(obj.birthdayDay);
  if (typeof obj.reminderLeadDays === "number") result.reminderLeadDays = Math.round(obj.reminderLeadDays);
  if (isValidMonthly(obj.monthlyWeek, obj.monthlyWeekday)) {
    result.monthlyWeek = obj.monthlyWeek as number;
    result.monthlyWeekday = obj.monthlyWeekday as number;
  }
  if (isValidWeekday(obj.weeklyDay)) result.weeklyDay = obj.weeklyDay as number;
  if (typeof obj.contactName === "string") result.contactName = obj.contactName;

  // Keep the category consistent with the birthday fields, and never return a
  // category-less draft (the form has no "none" option).
  result.category = resolveCategory(result.category ?? DEFAULT_CATEGORY, result.birthdayMonth ?? null, result.birthdayDay ?? null);

  return result;
}

app.post("/api/parse-reminder", parseReminderLimiter, async (request, response) => {
  const { text } = request.body as { text?: string };

  if (!text?.trim()) {
    response.status(400).json({ error: "text is required" });
    return;
  }

  if (text.length > 500) {
    response.status(400).json({ error: "Description is too long (max 500 characters)" });
    return;
  }

  if (!LLM_API_KEY) {
    response.status(503).json({ error: "AI parsing is not configured — set LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL) in .env" });
    return;
  }

  const openai = new OpenAI({ apiKey: LLM_API_KEY, baseURL: LLM_BASE_URL });

  const systemPrompt = `You convert natural-language reminder descriptions into structured JSON for a life calendar app.
Return ONLY valid JSON matching this TypeScript type (omit null/undefined fields):
{
  title: string,
  category?: string,
  cadenceDays?: number,
  dueDate?: string,       // YYYY-MM-DD
  birthdayMonth?: number, // 1-12
  birthdayDay?: number,   // 1-31
  reminderLeadDays?: number,
  monthlyWeek?: number,    // 1-4 or -1 (last)
  monthlyWeekday?: number, // 0 (Sun) - 6 (Sat)
  weeklyDay?: number,      // 0 (Sun) - 6 (Sat)
  contactName?: string
}
Rules:
- category should be one of these preferred labels when one fits: ${PRESET_CATEGORIES.join(", ")}. Only invent a new short label if none of these apply
- for birthday reminders use category "Birthdays" and set birthdayMonth/birthdayDay/reminderLeadDays
- for calling/texting/visiting a person use category "People" and set contactName
- cadenceDays = how often to repeat in days (e.g. "every 2 weeks" = 14)
- for "nth weekday of the month" recurrences (e.g. "every 3rd Thursday", "last Monday") set monthlyWeek (1-4, or -1 for last) and monthlyWeekday (0=Sunday..6=Saturday) instead of cadenceDays
- for weekly recurrences on a specific day (e.g. "every Monday", "weekly on Friday") set weeklyDay (0=Sunday..6=Saturday) instead of cadenceDays
- Do not include null values, only include fields that have meaningful values

Examples:
"call mom every 2 weeks" -> {"title":"Call Mom","category":"People","contactName":"Mom","cadenceDays":14}
"clean the kitchen weekly" -> {"title":"Clean the kitchen","category":"Chores","cadenceDays":7}
"dad's birthday is June 3, remind me 5 days before" -> {"title":"Dad's birthday","category":"Birthdays","contactName":"Dad","birthdayMonth":6,"birthdayDay":3,"reminderLeadDays":5}
"water the plants every 3rd thursday" -> {"title":"Water the plants","category":"Home","monthlyWeek":3,"monthlyWeekday":4}
"take out recycling every monday" -> {"title":"Take out recycling","category":"Chores","weeklyDay":1}
"buy dog food" -> {"title":"Buy dog food","category":"Shopping"}`;

  try {
    const msg = await openai.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 512,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ]
    });

    const raw = msg.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      response.status(422).json({ error: "Could not parse AI response" });
      return;
    }

    const parsed = validateParsedReminder(JSON.parse(jsonMatch[0]));
    response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parsing failed";
    response.status(500).json({ error: "AI service error — try again or fill in manually" });
    console.error("parse-reminder error:", message);
  }
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/today", (request, response) => {
  const today = String(request.query.date ?? toDateKey(new Date()));
  response.json(buildToday(listItems(), today));
});

app.get("/api/items", (request, response) => {
  const includeArchived = request.query.archived === "true";
  response.json(listItems(includeArchived));
});

app.post("/api/items/:id/archive", (request, response) => {
  const item = archiveItem(request.params.id);
  if (!item) {
    response.status(404).json({ error: "item not found" });
    return;
  }
  response.json(item);
});

app.post("/api/items/:id/unarchive", (request, response) => {
  const item = unarchiveItem(request.params.id);
  if (!item) {
    response.status(404).json({ error: "item not found" });
    return;
  }
  response.json(item);
});

app.post("/api/items", (request, response) => {
  const input = request.body as CreateLifeItemInput;

  if (!input.title?.trim()) {
    response.status(400).json({ error: "title is required" });
    return;
  }

  if (input.cadenceDays !== undefined && input.cadenceDays !== null && input.cadenceDays <= 0) {
    response.status(400).json({ error: "cadenceDays must be a positive number" });
    return;
  }

  if (input.dueDate !== undefined && input.dueDate !== null && !isDateKey(input.dueDate)) {
    response.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD date" });
    return;
  }

  if (
    (input.birthdayMonth !== undefined && input.birthdayMonth !== null) ||
    (input.birthdayDay !== undefined && input.birthdayDay !== null)
  ) {
    const bm = input.birthdayMonth ?? 0;
    const bd = input.birthdayDay ?? 0;
    if (!isValidBirthdayDay(bm, bd)) {
      response.status(400).json({ error: "birthdayMonth and birthdayDay must form a valid calendar date" });
      return;
    }
  }

  if (
    (input.monthlyWeek !== undefined && input.monthlyWeek !== null) ||
    (input.monthlyWeekday !== undefined && input.monthlyWeekday !== null)
  ) {
    if (!isValidMonthly(input.monthlyWeek, input.monthlyWeekday)) {
      response.status(400).json({ error: "monthlyWeek must be 1-4 or -1 (last) and monthlyWeekday must be 0-6, both together" });
      return;
    }
  }

  if (input.weeklyDay !== undefined && input.weeklyDay !== null && !isValidWeekday(input.weeklyDay)) {
    response.status(400).json({ error: "weeklyDay must be 0 (Sunday) - 6 (Saturday)" });
    return;
  }

  // A Birthdays item with no date would be scheduled nowhere and stay invisible.
  if (isBirthdayCategory(normalizeCategory(input.category ?? "")) && (input.birthdayMonth == null || input.birthdayDay == null)) {
    response.status(400).json({ error: "Birthdays items need a birthday month and day" });
    return;
  }

  response.status(201).json(createItem(input));
});

app.patch("/api/items/:id", (request, response) => {
  const input = request.body as UpdateLifeItemInput;

  if (input.cadenceDays !== undefined && input.cadenceDays !== null && input.cadenceDays <= 0) {
    response.status(400).json({ error: "cadenceDays must be a positive number" });
    return;
  }

  if (input.dueDate !== undefined && input.dueDate !== null && !isDateKey(input.dueDate)) {
    response.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD date" });
    return;
  }

  if (
    (input.birthdayMonth !== undefined && input.birthdayMonth !== null) ||
    (input.birthdayDay !== undefined && input.birthdayDay !== null)
  ) {
    const existing = getItem(request.params.id);
    if (!existing) {
      response.status(404).json({ error: "item not found" });
      return;
    }
    const bm = input.birthdayMonth ?? existing.birthdayMonth ?? 0;
    const bd = input.birthdayDay ?? existing.birthdayDay ?? 0;
    if (!isValidBirthdayDay(bm, bd)) {
      response.status(400).json({ error: "birthdayMonth and birthdayDay must form a valid calendar date" });
      return;
    }
  }

  if (
    (input.monthlyWeek !== undefined && input.monthlyWeek !== null) ||
    (input.monthlyWeekday !== undefined && input.monthlyWeekday !== null)
  ) {
    const existing = getItem(request.params.id);
    if (!existing) {
      response.status(404).json({ error: "item not found" });
      return;
    }
    const mw = input.monthlyWeek ?? existing.monthlyWeek;
    const mwd = input.monthlyWeekday ?? existing.monthlyWeekday;
    if (!isValidMonthly(mw, mwd)) {
      response.status(400).json({ error: "monthlyWeek must be 1-4 or -1 (last) and monthlyWeekday must be 0-6, both together" });
      return;
    }
  }

  if (input.weeklyDay !== undefined && input.weeklyDay !== null && !isValidWeekday(input.weeklyDay)) {
    response.status(400).json({ error: "weeklyDay must be 0 (Sunday) - 6 (Saturday)" });
    return;
  }

  // Mirror the POST guard: a Birthdays item must keep its month/day after the
  // merge, or it would be scheduled nowhere and stay invisible.
  {
    const existing = getItem(request.params.id);
    if (existing) {
      const mergedCategory = normalizeCategory(input.category ?? "") || existing.category;
      const mergedMonth = input.birthdayMonth !== undefined ? input.birthdayMonth : existing.birthdayMonth;
      const mergedDay = input.birthdayDay !== undefined ? input.birthdayDay : existing.birthdayDay;
      if (isBirthdayCategory(mergedCategory) && (mergedMonth == null || mergedDay == null)) {
        response.status(400).json({ error: "Birthdays items need a birthday month and day" });
        return;
      }
    }
  }

  const item = updateItem(request.params.id, input);

  if (!item) {
    response.status(404).json({ error: "item not found" });
    return;
  }

  response.json(item);
});

app.post("/api/items/:id/complete", (request, response) => {
  const rawCompletedAt = request.body?.completedAt;
  const completedAt =
    typeof rawCompletedAt === "string" && rawCompletedAt.length > 0
      ? rawCompletedAt
      : toDateKey(new Date());

  if (!isDateKey(completedAt)) {
    response.status(400).json({ error: "completedAt must use YYYY-MM-DD format" });
    return;
  }

  const item = completeItem(request.params.id, completedAt);

  if (!item) {
    response.status(404).json({ error: "item not found" });
    return;
  }

  response.json(item);
});

app.delete("/api/items/:id", (request, response) => {
  if (!getItem(request.params.id)) {
    response.status(404).json({ error: "item not found" });
    return;
  }

  deleteItem(request.params.id);
  response.status(204).send();
});

app.listen(port, () => {
  console.log(`Life Calendar API listening on http://127.0.0.1:${port}`);
});
