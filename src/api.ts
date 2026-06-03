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

export async function parseReminder(text: string): Promise<CreateLifeItemInput> {
  const response = await fetch("/api/parse-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
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
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    const body = isJson ? JSON.stringify(await response.json()) : await response.text();
    const message = extractErrorMessage(body) ?? response.statusText;
    throw new Error(message);
  }

  if (!isJson) {
    throw new Error(`API returned ${response.status} with non-JSON content — is the server running?`);
  }

  return response.json() as Promise<T>;
}

function extractErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as Record<string, unknown>).error === "string") {
      return (parsed as { error: string }).error;
    }
  } catch {
    // not JSON — fall through
  }
  return body.trim() || null;
}
