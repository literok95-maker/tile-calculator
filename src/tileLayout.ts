import {
  boundsFor,
  type Point,
  type Polygon,
  rotatedPoint,
  tileCoverage,
  tileIntersectsPolygon,
} from "./geometry";

export type LayoutType = "straight" | "brick" | "diagonal" | "herringbone";

export interface TilePlan {
  points: Polygon;
  full: boolean;
  coverage: number;
  spanU?: number;
  spanV?: number;
  labelPoint: Point | null;
  sourceNumber?: number;
  fragmentNumber?: number;
  label?: string;
}

export interface TileLayoutInput {
  room: Polygon;
  origin: Point;
  tileWidth: number;
  tileHeight: number;
  minReusableCutRatio: number;
  layout: LayoutType;
  rotation: number;
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface TileLayoutResult {
  tiles: TilePlan[];
  cut: number;
  materialTiles: number;
  cutSummary: CutSummary;
}

export interface CutSummary {
  groupedSourceTiles: number;
  groupedFragments: number;
  reusableOffcuts: number;
}

export function tileCenter(tile: TilePlan): Point {
  return {
    x: tile.points.reduce((sum, point) => sum + point.x, 0) / tile.points.length,
    y: tile.points.reduce((sum, point) => sum + point.y, 0) / tile.points.length,
  };
}

function tilePolygon(
  origin: Point,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  rowOffset: number,
): Polygon {
  const ox = x + rowOffset;
  const corners = [
    { x: ox, y },
    { x: ox + width, y },
    { x: ox + width, y: y + height },
    { x: ox, y: y + height },
  ];
  return corners.map((point) => rotatedPoint(origin.x, origin.y, point.x - origin.x, point.y - origin.y, angle));
}

const emptyCutSummary: CutSummary = {
  groupedSourceTiles: 0,
  groupedFragments: 0,
  reusableOffcuts: 0,
};

type CutStripAxis = "u" | "v";
type CutPackingMode = "empty" | "strip" | "area";

interface CutBin {
  sourceNumber: number;
  remaining: number;
  fragmentCount: number;
  packingMode: CutPackingMode;
  stripAxis: CutStripAxis | null;
  stripUsed: number;
}

function cutFragmentMetrics(tile: TilePlan): {
  coverage: number;
  spanU: number;
  spanV: number;
  stripAxis: CutStripAxis | null;
  stripWidth: number;
} {
  const coverage = Math.max(0, Math.min(1, tile.coverage));
  const fallbackSpan = Math.sqrt(coverage);
  const spanU = Math.max(0, Math.min(1, tile.spanU ?? fallbackSpan));
  const spanV = Math.max(0, Math.min(1, tile.spanV ?? fallbackSpan));
  const longSpan = Math.max(spanU, spanV);
  const stripAxis = longSpan >= 0.92 ? (spanU <= spanV ? "u" : "v") : null;
  return {
    coverage,
    spanU,
    spanV,
    stripAxis,
    stripWidth: stripAxis === "u" ? spanU : spanV,
  };
}

function canFitCutFragment(bin: CutBin, tile: TilePlan): boolean {
  const metrics = cutFragmentMetrics(tile);
  if (bin.remaining + 0.001 < metrics.coverage) return false;
  if (!metrics.stripAxis) return bin.packingMode !== "strip";
  if (bin.packingMode === "area") return false;
  if (bin.stripAxis && bin.stripAxis !== metrics.stripAxis) return false;
  return bin.stripUsed + metrics.stripWidth <= 1.001;
}

function addCutFragmentToBin(bin: CutBin, tile: TilePlan): void {
  const metrics = cutFragmentMetrics(tile);
  bin.fragmentCount += 1;
  bin.remaining -= metrics.coverage;
  if (metrics.stripAxis) {
    bin.packingMode = "strip";
    bin.stripAxis = bin.stripAxis ?? metrics.stripAxis;
    bin.stripUsed += metrics.stripWidth;
  } else {
    bin.packingMode = "area";
  }
}

export function assignTileNumbers(tiles: TilePlan[], minReusableCutRatio: number): { materialTiles: number; cutSummary: CutSummary } {
  let nextSourceNumber = 1;
  const cutBins: CutBin[] = [];

  tiles
    .filter((tile) => tile.full)
    .forEach((tile) => {
      tile.sourceNumber = nextSourceNumber;
      tile.label = String(nextSourceNumber);
      nextSourceNumber += 1;
    });

  tiles
    .filter((tile) => !tile.full)
    .sort((a, b) => b.coverage - a.coverage)
    .forEach((tile) => {
      let bin = cutBins.find((candidate) => canFitCutFragment(candidate, tile));
      if (!bin) {
        bin = {
          sourceNumber: nextSourceNumber,
          remaining: 1,
          fragmentCount: 0,
          packingMode: "empty",
          stripAxis: null,
          stripUsed: 0,
        };
        cutBins.push(bin);
        nextSourceNumber += 1;
      }

      addCutFragmentToBin(bin, tile);
      tile.sourceNumber = bin.sourceNumber;
      tile.fragmentNumber = bin.fragmentCount;
      tile.label = `${tile.sourceNumber}.${tile.fragmentNumber}`;
    });

  return {
    materialTiles: nextSourceNumber - 1,
    cutSummary: {
      groupedSourceTiles: cutBins.filter((bin) => bin.fragmentCount > 1).length,
      groupedFragments: cutBins
        .filter((bin) => bin.fragmentCount > 1)
        .reduce((sum, bin) => sum + bin.fragmentCount, 0),
      reusableOffcuts: cutBins.filter((bin) => bin.remaining >= minReusableCutRatio).length,
    },
  };
}

function collectIntersectingTile(tile: Polygon, room: Polygon, tiles: TilePlan[]): number {
  if (!tileIntersectsPolygon(tile, room)) return 0;
  const coverageResult = tileCoverage(tile, room);
  const coverage = coverageResult.ratio;
  if (coverage === 0) return 0;
  const full = coverage >= 0.98;
  tiles.push({
    points: tile,
    full,
    coverage,
    spanU: coverageResult.spanU,
    spanV: coverageResult.spanV,
    labelPoint: coverageResult.labelPoint,
  });
  return full ? 0 : 1;
}

function herringbonePoint(origin: Point, x: number, y: number, angle: number, offsetX = 0, offsetY = 0): Point {
  const longUnit = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
  const shortUnit = {
    x: -Math.sin(angle),
    y: Math.cos(angle),
  };

  return {
    x: origin.x + offsetX + longUnit.x * x + shortUnit.x * y,
    y: origin.y + offsetY + longUnit.y * x + shortUnit.y * y,
  };
}

function herringboneTileSet(
  origin: Point,
  x0: number,
  y0: number,
  a: number,
  b: number,
  angle: number,
  offsetX = 0,
  offsetY = 0,
): Polygon[] {
  return [
    [
      herringbonePoint(origin, x0, y0, angle, offsetX, offsetY),
      herringbonePoint(origin, x0, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + b, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + b, y0, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(origin, x0 + a, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0, y0 + a + b, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + a, y0 + a + b, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(origin, x0 + a, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + b + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + b + a, y0 + a, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(origin, x0 + a + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + a, y0 + a + b + a, angle, offsetX, offsetY),
      herringbonePoint(origin, x0 + a + a, y0 + a + b + a, angle, offsetX, offsetY),
    ],
  ];
}

export function calculateTileLayout(input: TileLayoutInput): TileLayoutResult {
  if (input.room.length < 3) {
    return { tiles: [], cut: 0, materialTiles: 0, cutSummary: emptyCutSummary };
  }

  const angle = input.rotation + (input.layout === "diagonal" ? Math.PI / 4 : 0);
  const bounds = boundsFor(input.room);
  const padding = Math.max(input.tileWidth, input.tileHeight) * 3;
  const tiles: TilePlan[] = [];
  let cut = 0;

  const startX = Math.floor((bounds.minX - padding) / input.tileWidth) * input.tileWidth;
  const endX = bounds.maxX + padding;
  const startY = Math.floor((bounds.minY - padding) / input.tileHeight) * input.tileHeight;
  const endY = bounds.maxY + padding;

  if (input.layout === "herringbone") {
    const longSide = Math.max(input.tileWidth, input.tileHeight);
    const shortSide = Math.min(input.tileWidth, input.tileHeight);
    const repeatAlong = shortSide * 2;
    const repeatAcross = longSide;
    const herringbonePadding = Math.max(input.viewportWidth, input.viewportHeight) + longSide * 3;
    const alongCount = Math.ceil(herringbonePadding / repeatAlong) + 4;
    const acrossCount = Math.ceil(herringbonePadding / repeatAcross) + 4;

    for (let along = -alongCount; along <= alongCount; along += 1) {
      for (let across = -acrossCount; across <= acrossCount; across += 1) {
        const x0 = repeatAlong * along + repeatAcross * across;
        const y0 = repeatAlong * along - repeatAcross * across;
        herringboneTileSet(
          input.origin,
          x0,
          y0,
          shortSide,
          longSide,
          input.rotation,
          input.offsetX,
          input.offsetY,
        ).forEach((tile) => {
          cut += collectIntersectingTile(tile, input.room, tiles);
        });
      }
    }
  } else {
    let row = 0;
    for (let y = startY; y <= endY; y += input.tileHeight) {
      const rowOffset = input.layout === "brick" && row % 2 === 1 ? input.tileWidth / 2 : 0;
      for (let x = startX; x <= endX; x += input.tileWidth) {
        const tile = tilePolygon(
          input.origin,
          x + input.offsetX,
          y + input.offsetY,
          input.tileWidth,
          input.tileHeight,
          angle,
          rowOffset,
        );
        cut += collectIntersectingTile(tile, input.room, tiles);
      }
      row += 1;
    }
  }

  const numberedTiles = assignTileNumbers(tiles, input.minReusableCutRatio);
  return { tiles, cut, ...numberedTiles };
}
