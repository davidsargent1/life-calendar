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
import { toDateKey } from "../shared/dates";
import { buildToday } from "../shared/rules";
import type { CreateLifeItemInput, UpdateLifeItemInput } from "../shared/types";

const app = express();
const port = Number(process.env.PORT ?? 8787);

migrate();
seedIfEmpty();

app.use(cors());
app.use(express.json());

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
  const completedAt = String(request.body?.completedAt ?? toDateKey(new Date()));
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
