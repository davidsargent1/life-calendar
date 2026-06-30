import { describe, expect, it } from "vitest";
import { isPresetCategory, normalizeCategory, PRESET_CATEGORIES } from "../shared/categories";

describe("category presets", () => {
  it("recognises preset categories", () => {
    expect(isPresetCategory("Chores")).toBe(true);
    expect(isPresetCategory("Garden")).toBe(false);
  });

  it("collapses case variants of a preset onto its canonical form", () => {
    expect(normalizeCategory("chores")).toBe("Chores");
    expect(normalizeCategory("CHORES")).toBe("Chores");
    expect(normalizeCategory("  ErRaNdS ")).toBe("Errands");
  });

  it("preserves genuinely custom categories (trimmed)", () => {
    expect(normalizeCategory("  Garden ")).toBe("Garden");
    expect(normalizeCategory("Garage")).toBe("Garage");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeCategory("")).toBe("");
    expect(normalizeCategory("   ")).toBe("");
  });

  it("normalizes every preset to itself", () => {
    for (const category of PRESET_CATEGORIES) {
      expect(normalizeCategory(category)).toBe(category);
    }
  });
});
