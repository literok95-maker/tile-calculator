export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SegmentHit {
  point: Point;
  distance: number;
  t: number;
}

export interface TileCoverage {
  ratio: number;
  labelPoint: Point | null;
}

export type Polygon = Point[];

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function closestPointOnSegment(point: Point, start: Point, end: Point): SegmentHit {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { point: start, distance: distance(point, start), t: 0 };
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  return {
    point: projected,
    distance: distance(point, projected),
    t,
  };
}

export function polygonArea(points: Polygon): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function tileIntersectsPolygon(tile: Polygon, polygon: Polygon): boolean {
  const corners = [
    tile[0],
    tile[1],
    tile[2],
    tile[3],
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (polygon.some((point) => pointInPolygon(point, corners))) return true;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let j = 0; j < polygon.length; j += 1) {
      const c = polygon[j];
      const d = polygon[(j + 1) % polygon.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function tileCoverage(tile: Polygon, polygon: Polygon): TileCoverage {
  const samplesPerSide = 10;
  let inside = 0;
  let insideX = 0;
  let insideY = 0;
  const horizontal = {
    x: tile[1].x - tile[0].x,
    y: tile[1].y - tile[0].y,
  };
  const vertical = {
    x: tile[3].x - tile[0].x,
    y: tile[3].y - tile[0].y,
  };

  for (let y = 0; y < samplesPerSide; y += 1) {
    for (let x = 0; x < samplesPerSide; x += 1) {
      const u = (x + 0.5) / samplesPerSide;
      const v = (y + 0.5) / samplesPerSide;
      const sample = {
        x: tile[0].x + horizontal.x * u + vertical.x * v,
        y: tile[0].y + horizontal.y * u + vertical.y * v,
      };
      if (pointInPolygon(sample, polygon)) {
        inside += 1;
        insideX += sample.x;
        insideY += sample.y;
      }
    }
  }

  return {
    ratio: inside / (samplesPerSide * samplesPerSide),
    labelPoint: inside > 0 ? { x: insideX / inside, y: insideY / inside } : null,
  };
}

export function rotatedPoint(cx: number, cy: number, x: number, y: number, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  };
}

export function boundsFor(points: Polygon): Bounds {
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
