import { describe, expect, it } from "vitest";
import {
  assertSavedProject,
  defaultPlannerSettings,
  defaultSnapOptions,
  normalizeSnapOptions,
  settingsFromSavedControls,
} from "./projectState";

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

  it("migrates saved controls without overwriting invalid enum values", () => {
    const current = defaultPlannerSettings();
    const migrated = settingsFromSavedControls(current, {
      drawUnit: "inch",
      layout: "spiral",
      gridStep: 25,
      tileWidth: 60,
      tileHeight: 12,
      breakageWaste: 5,
      minReusableCut: 90,
      showTileNumbers: 0,
      highlightFullTiles: 1,
      snapOptions: { guides: true, axes: false, grid: true },
    });

    expect(migrated.drawUnit).toBe(current.drawUnit);
    expect(migrated.layout).toBe(current.layout);
    expect(migrated.gridStep).toBe("25");
    expect(migrated.tileWidth).toBe("600");
    expect(migrated.tileHeight).toBe("120");
    expect(migrated.breakageWaste).toBe("5");
    expect(migrated.minReusableCut).toBe("90");
    expect(migrated.showTileNumbers).toBe(false);
    expect(migrated.highlightFullTiles).toBe(true);
    expect(migrated.snapOptions).toEqual({ guides: true, axes: false, grid: true });
  });

  it("keeps current settings and default snap options when saved controls are missing", () => {
    const current = {
      ...defaultPlannerSettings(),
      gridStep: "5",
      snapOptions: { guides: true, axes: true, grid: false },
    };

    expect(settingsFromSavedControls(current, undefined)).toEqual({
      ...current,
      snapOptions: defaultSnapOptions(),
    });
  });
});
