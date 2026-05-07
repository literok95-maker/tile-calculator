import { describe, expect, it } from "vitest";
import { calculateTileLayout, tileCenter, type TileLayoutInput } from "./tileLayout";

const baseInput: TileLayoutInput = {
  room: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ],
  origin: { x: 0, y: 0 },
  tileWidth: 10,
  tileHeight: 10,
  layout: "straight",
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  viewportWidth: 200,
  viewportHeight: 200,
};

describe("tile layout", () => {
  it("calculates full straight tiles for a matching room", () => {
    const result = calculateTileLayout(baseInput);

    expect(result.cut).toBe(0);
    expect(result.materialTiles).toBe(4);
    expect(result.tiles).toHaveLength(4);
    expect(result.tiles.every((tile) => tile.full)).toBe(true);
    expect(result.tiles.map((tile) => tile.label)).toEqual(["1", "2", "3", "4"]);
  });

  it("groups cut fragments under source tile numbers", () => {
    const result = calculateTileLayout({
      ...baseInput,
      room: [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 10 },
        { x: 0, y: 10 },
      ],
    });

    expect(result.cut).toBe(1);
    expect(result.materialTiles).toBe(2);
    expect(result.tiles.map((tile) => tile.label)).toEqual(["1", "2.1"]);
  });

  it("builds herringbone tiles with labels", () => {
    const result = calculateTileLayout({
      ...baseInput,
      tileWidth: 4,
      tileHeight: 20,
      layout: "herringbone",
    });

    expect(result.tiles.length).toBeGreaterThan(0);
    expect(result.materialTiles).toBeGreaterThan(0);
    expect(result.tiles.every((tile) => typeof tile.label === "string")).toBe(true);
  });

  it("calculates tile centers", () => {
    expect(tileCenter({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      full: true,
      coverage: 1,
      labelPoint: null,
    })).toEqual({ x: 5, y: 5 });
  });
});
