// Category is the single classifier for a reminder. Most categories are just
// labels, but a couple unlock extra fields (what item "types" used to gate):
//   Birthdays -> month/day + remind-before fields, recurs yearly
//   People    -> a Person/contact field and "Call X" wording
export const BIRTHDAY_CATEGORY = "Birthdays";
export const PEOPLE_CATEGORY = "People";
export const DEFAULT_CATEGORY = "Home";

// Curated set of categories offered in the UI and suggested to the AI
// parser. Keeping a canonical list reduces near-duplicates such as
// "chores" / "Chores" / "Chore" all coexisting.
export const PRESET_CATEGORIES = [
  "Home",
  "Chores",
  "Errands",
  "Shopping",
  PEOPLE_CATEGORY,
  "Health",
  "Finance",
  "Events",
  BIRTHDAY_CATEGORY,
  "Pets",
  "Maintenance"
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export function isPresetCategory(value: string): value is PresetCategory {
  return (PRESET_CATEGORIES as readonly string[]).includes(value);
}

// Special categories that carry the behaviour item types used to gate.
export function isBirthdayCategory(category: string | null | undefined): boolean {
  return category === BIRTHDAY_CATEGORY;
}

export function isPeopleCategory(category: string | null | undefined): boolean {
  return category === PEOPLE_CATEGORY;
}

// Collapse case/whitespace variants of a preset onto its canonical form
// ("chores" -> "Chores"). Non-preset values are returned trimmed, so
// genuinely custom categories are preserved as-is.
export function normalizeCategory(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const match = PRESET_CATEGORIES.find(
    (category) => category.toLowerCase() === trimmed.toLowerCase()
  );

  return match ?? trimmed;
}
