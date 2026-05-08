import { describe, expect, it } from "vitest";
import { assertSavedProject, defaultSnapOptions, normalizeSnapOptions } from "./projectState";

describe("project state", () => {
  it("normalizes current snap options", () => {
    expect(normalizeSnapOptions({ snapOptions: { guides: true, axes: true, grid: false } })).toEqual({
      guides: true,
      axes: true,
      grid: false,
    });
  });

  it("migrates legacy snap modes", () => {
    expect(normalizeSnapOptions({ snapMode: "grid-guides" })).toEqual({
      guides: true,
      axes: false,
      grid: true,
    });
    expect(normalizeSnapOptions({ snapMode: "none" })).toEqual({
      guides: false,
      axes: false,
      grid: false,
    });
    expect(normalizeSnapOptions(undefined)).toEqual(defaultSnapOptions());
  });

  it("validates imported project shape", () => {
    expect(() => assertSavedProject({ geometry: { points: [], closed: false } })).not.toThrow();
    expect(() => assertSavedProject({})).toThrow("Project file does not contain geometry");
  });
});
