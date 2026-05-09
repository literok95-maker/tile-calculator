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
  spanU: number;
  spanV: number;
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
  return Math.abs(signedPolygonArea(points)) / 2;
}

function signedPolygonArea(points: Polygon): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return sum;
}

function polygonCentroid(points: Polygon): Point | null {
  const areaTwice = signedPolygonArea(points);
  if (Math.abs(areaTwice) < 0.000001) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  const divisor = 3 * areaTwice;
  return { x: x / divisor, y: y / divisor };
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 0.000001) return b;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const t = (acX * cdY - acY * cdX) / denominator;
  return { x: a.x + abX * t, y: a.y + abY * t };
}

function clipPolygonToConvex(subject: Polygon, clip: Polygon): Polygon {
  const winding = signedPolygonArea(clip);
  let output = [...subject];
  const isInside = (edgeStart: Point, edgeEnd: Point, point: Point) => {
    const cross = (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y)
      - (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);
    return winding >= 0 ? cross >= -0.000001 : cross <= 0.000001;
  };

  for (let i = 0; i < clip.length; i += 1) {
    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    if (input.length === 0) break;

    let previous = input[input.length - 1];
    let previousInside = isInside(edgeStart, edgeEnd, previous);
    input.forEach((current) => {
      const currentInside = isInside(edgeStart, edgeEnd, current);
      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      }
      previous = current;
      previousInside = currentInside;
    });
  }

  return output;
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
  const clipped = clipPolygonToConvex(polygon, tile);
  const tileArea = polygonArea(tile);
  const clippedArea = polygonArea(clipped);
  if (tileArea === 0 || clippedArea === 0) {
    return { ratio: 0, labelPoint: null, spanU: 0, spanV: 0 };
  }

  const horizontal = {
    x: tile[1].x - tile[0].x,
    y: tile[1].y - tile[0].y,
  };
  const vertical = {
    x: tile[3].x - tile[0].x,
    y: tile[3].y - tile[0].y,
  };

  const horizontalLengthSquared = horizontal.x * horizontal.x + horizontal.y * horizontal.y;
  const verticalLengthSquared = vertical.x * vertical.x + vertical.y * vertical.y;
  const projected = clipped.map((point) => {
    const relative = { x: point.x - tile[0].x, y: point.y - tile[0].y };
    return {
      u: horizontalLengthSquared === 0 ? 0 : (relative.x * horizontal.x + relative.y * horizontal.y) / horizontalLengthSquared,
      v: verticalLengthSquared === 0 ? 0 : (relative.x * vertical.x + relative.y * vertical.y) / verticalLengthSquared,
    };
  });
  const minU = Math.max(0, Math.min(...projected.map((point) => point.u)));
  const maxU = Math.min(1, Math.max(...projected.map((point) => point.u)));
  const minV = Math.max(0, Math.min(...projected.map((point) => point.v)));
  const maxV = Math.min(1, Math.max(...projected.map((point) => point.v)));

  return {
    ratio: Math.min(1, clippedArea / tileArea),
    labelPoint: polygonCentroid(clipped),
    spanU: Math.max(0, maxU - minU),
    spanV: Math.max(0, maxV - minV),
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
