import type { CreateLifeItemInput, LifeItem, TodayResponse } from "../shared/types";

export async function fetchToday(): Promise<TodayResponse> {
  const response = await fetch("/api/today");
  return readJson(response);
}

export async function fetchItems(): Promise<LifeItem[]> {
  const response = await fetch("/api/items");
  return readJson(response);
}

export async function createItem(input: CreateLifeItemInput): Promise<LifeItem> {
  const response = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return readJson(response);
}

export async function completeItem(id: string, completedAt: string): Promise<LifeItem> {
  const response = await fetch(`/api/items/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completedAt })
  });

  return readJson(response);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }

  return response.json() as Promise<T>;
}
