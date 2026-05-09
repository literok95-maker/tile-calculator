import { describe, expect, it } from "vitest";
import {
  boundsFor,
  closestPointOnSegment,
  distance,
  polygonArea,
  pointInPolygon,
  tileCoverage,
  tileIntersectsPolygon,
} from "./geometry";

describe("geometry", () => {
  it("calculates distances and closest points on segments", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);

    const hit = closestPointOnSegment(
      { x: 5, y: 4 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    );

    expect(hit.point).toEqual({ x: 5, y: 0 });
    expect(hit.distance).toBe(4);
    expect(hit.t).toBe(0.5);
  });

  it("calculates polygon area and bounds", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];

    expect(polygonArea(room)).toBe(50);
    expect(boundsFor(room)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it("detects point and tile intersections with a polygon", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const overlappingTile = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];
    const outsideTile = [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
    ];

    expect(pointInPolygon({ x: 5, y: 5 }, room)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, room)).toBe(false);
    expect(tileIntersectsPolygon(overlappingTile, room)).toBe(true);
    expect(tileIntersectsPolygon(outsideTile, room)).toBe(false);
  });

  it("estimates tile coverage ratio", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const halfCoveredTile = [
      { x: 5, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
    ];

    expect(tileCoverage(halfCoveredTile, room)).toMatchObject({
      ratio: 0.5,
      spanU: 0.5,
      spanV: 1,
    });
  });
});
