import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import cors from "cors";
import express from "express";
import {
  completeItem,
  createItem,
  deleteItem,
  getItem,
  listItems,
  migrate,
  seedIfEmpty,
  updateItem
} from "./db";
import { isDateKey, toDateKey } from "../shared/dates";
import { buildToday } from "../shared/rules";
import type { CreateLifeItemInput, UpdateLifeItemInput } from "../shared/types";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

migrate();
seedIfEmpty();

app.use(cors());
app.use(express.json());

app.post("/api/parse-reminder", async (request, response) => {
  const { text } = request.body as { text?: string };

  if (!text?.trim()) {
    response.status(400).json({ error: "text is required" });
    return;
  }

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
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: text }]
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      response.status(422).json({ error: "Could not parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as CreateLifeItemInput;
    response.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parsing failed";
    response.status(500).json({ error: message });
  }
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/today", (request, response) => {
  const today = String(request.query.date ?? toDateKey(new Date()));
  response.json(buildToday(listItems(), today));
});

app.get("/api/items", (_request, response) => {
  response.json(listItems());
});

app.post("/api/items", (request, response) => {
  const input = request.body as CreateLifeItemInput;

  if (!input.title?.trim() || !input.type) {
    response.status(400).json({ error: "title and type are required" });
    return;
  }

  response.status(201).json(createItem(input));
});

app.patch("/api/items/:id", (request, response) => {
  const item = updateItem(request.params.id, request.body as UpdateLifeItemInput);

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
