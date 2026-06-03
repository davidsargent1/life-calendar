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

const VALID_TYPES = new Set(["contact", "chore", "birthday", "shopping", "routine"]);

function validateParsedReminder(raw: unknown): CreateLifeItemInput {
  if (!raw || typeof raw !== "object") throw new Error("AI returned unexpected format");
  const obj = raw as Record<string, unknown>;

  if (typeof obj.title !== "string" || !obj.title.trim()) throw new Error("AI response missing title");
  if (!VALID_TYPES.has(obj.type as string)) throw new Error("AI response has invalid type");

  const result: CreateLifeItemInput = {
    type: obj.type as CreateLifeItemInput["type"],
    title: String(obj.title).trim()
  };

  if (typeof obj.category === "string") result.category = obj.category;
  if (typeof obj.cadenceDays === "number" && obj.cadenceDays > 0) result.cadenceDays = Math.round(obj.cadenceDays);
  if (typeof obj.dueDate === "string" && isDateKey(obj.dueDate)) result.dueDate = obj.dueDate;
  if (typeof obj.birthdayMonth === "number" && obj.birthdayMonth >= 1 && obj.birthdayMonth <= 12) result.birthdayMonth = Math.round(obj.birthdayMonth);
  if (typeof obj.birthdayDay === "number" && obj.birthdayDay >= 1 && obj.birthdayDay <= 31) result.birthdayDay = Math.round(obj.birthdayDay);
  if (typeof obj.reminderLeadDays === "number") result.reminderLeadDays = Math.round(obj.reminderLeadDays);
  if (typeof obj.contactName === "string") result.contactName = obj.contactName;

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

  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ error: "AI parsing is not configured — add an OPENAI_API_KEY to .env" });
    return;
  }

  const openai = new OpenAI();

  const systemPrompt = `You convert natural-language reminder descriptions into structured JSON for a life calendar app.
Return ONLY valid JSON matching this TypeScript type (omit null/undefined fields):
{
  type: "contact" | "chore" | "birthday" | "shopping" | "routine",
  title: string,
  category?: string,
  cadenceDays?: number,
  dueDate?: string,       // YYYY-MM-DD
  birthdayMonth?: number, // 1-12
  birthdayDay?: number,   // 1-31
  reminderLeadDays?: number,
  contactName?: string
}
Rules:
- "contact" type = calling/texting/visiting a person; set contactName
- "birthday" type = birthday reminders; set birthdayMonth/birthdayDay/reminderLeadDays
- "chore" type = household tasks
- "shopping" type = buying things
- "routine" type = personal habits
- cadenceDays = how often to repeat in days (e.g. "every 2 weeks" = 14)
- category should be a short label like "People", "Home", "Health", "Shopping", "Events"
- Do not include null values, only include fields that have meaningful values`;

  try {
    const msg = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 512,
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

  if (!input.title?.trim() || !input.type) {
    response.status(400).json({ error: "title and type are required" });
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
