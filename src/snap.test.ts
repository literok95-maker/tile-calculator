import { describe, expect, it } from "vitest";
import { readSnapOption, snapLabel, snapPointToContext } from "./snap";

const points = [
  { x: 10, y: 10 },
  { x: 40, y: 30 },
];

describe("snap", () => {
  it("snaps to grid when grid option is enabled", () => {
    const result = snapPointToContext({
      x: 23,
      y: 27,
    }, {
      points,
      snapOptions: { guides: false, axes: false, grid: true },
      gridStepPx: 10,
      viewZoom: 1,
      guideSnapPx: 8,
    });

    expect(result.point).toEqual({ x: 20, y: 30 });
    expect(result.guides).toEqual([]);
  });

  it("keeps grid on free axis when guide snaps only one axis", () => {
    const result = snapPointToContext({
      x: 12,
      y: 21,
    }, {
      points,
      snapOptions: { guides: true, axes: false, grid: true },
      gridStepPx: 10,
      viewZoom: 1,
      guideSnapPx: 8,
    });

    expect(result.point).toEqual({ x: 10, y: 20 });
    expect(result.guides).toEqual([{ axis: "x", value: 10, type: "guide" }]);
  });

  it("snaps to drawing axes from anchor", () => {
    const result = snapPointToContext({
      x: 35,
      y: 12,
    }, {
      points,
      snapOptions: { guides: false, axes: true, grid: false },
      gridStepPx: 10,
      viewZoom: 1,
      guideSnapPx: 8,
      anchor: { x: 10, y: 10 },
    });

    expect(result.point).toEqual({ x: 35, y: 10 });
    expect(result.guides).toEqual([{ axis: "y", value: 10, type: "axis" }]);
  });

  it("formats snap labels and reads options", () => {
    expect(snapLabel({ guides: false, axes: false, grid: false })).toBe("🧲 Выкл");
    expect(snapLabel({ guides: true, axes: true, grid: true })).toBe("🧲 гайды + оси + сетка");
    expect(readSnapOption("axes")).toBe("axes");
    expect(readSnapOption("bad")).toBeNull();
  });
});
