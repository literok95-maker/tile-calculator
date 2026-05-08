import type { Point } from "./geometry";
import type { SnapOption, SnapOptions } from "./projectState";

export type GuideAxis = "x" | "y";
export type GuideType = "guide" | "axis";

export interface Guide {
  axis: GuideAxis;
  value: number;
  type: GuideType;
}

export interface SnapContext {
  points: Point[];
  snapOptions: SnapOptions;
  gridStepPx: number;
  viewZoom: number;
  guideSnapPx: number;
  excludeIndex?: number;
  anchor?: Point | null;
}

export interface SnapResult {
  point: Point;
  guides: Guide[];
}

export function snapPointToContext(point: Point, context: SnapContext): SnapResult {
  let snapped = { ...point };

  if (context.snapOptions.grid) {
    snapped = {
      x: Math.round(point.x / context.gridStepPx) * context.gridStepPx,
      y: Math.round(point.y / context.gridStepPx) * context.gridStepPx,
    };
  }

  const guided = applyGuides(point, context);
  if (guided.guides.some((guide) => guide.axis === "x")) snapped.x = guided.point.x;
  if (guided.guides.some((guide) => guide.axis === "y")) snapped.y = guided.point.y;

  return {
    point: snapped,
    guides: guided.guides,
  };
}

export function snapLabel(options: SnapOptions): string {
  const activeLabels: string[] = [];
  if (options.guides) activeLabels.push("гайды");
  if (options.axes) activeLabels.push("оси");
  if (options.grid) activeLabels.push("сетка");

  return activeLabels.length > 0
    ? `🧲 ${activeLabels.join(" + ")}`
    : "🧲 Выкл";
}

export function readSnapOption(value: string | undefined): SnapOption | null {
  if (value === "guides" || value === "axes" || value === "grid") return value;
  return null;
}

function applyGuides(point: Point, context: SnapContext): SnapResult {
  if (!context.snapOptions.guides && !context.snapOptions.axes) {
    return { point, guides: [] };
  }

  const guided = { ...point };
  const candidates: Record<GuideAxis, { distance: number; value: number | null; type: GuideType }> = {
    x: { distance: Infinity, value: null, type: "guide" },
    y: { distance: Infinity, value: null, type: "guide" },
  };
  let nearestX: { distance: number; value: number | null } = { distance: Infinity, value: null };
  let nearestY: { distance: number; value: number | null } = { distance: Infinity, value: null };

  if (context.snapOptions.axes && context.anchor) {
    candidates.x = { distance: Math.abs(context.anchor.x - point.x), value: context.anchor.x, type: "axis" };
    candidates.y = { distance: Math.abs(context.anchor.y - point.y), value: context.anchor.y, type: "axis" };
  }

  if (context.snapOptions.guides) {
    context.points.forEach((existing, index) => {
      if (index === context.excludeIndex) return;
      const xDistance = Math.abs(existing.x - point.x);
      const yDistance = Math.abs(existing.y - point.y);
      if (xDistance < nearestX.distance) {
        nearestX = { distance: xDistance, value: existing.x };
      }
      if (yDistance < nearestY.distance) {
        nearestY = { distance: yDistance, value: existing.y };
      }
    });

    if (nearestX.value !== null && nearestX.distance < candidates.x.distance) {
      candidates.x = { ...nearestX, type: "guide" };
    }
    if (nearestY.value !== null && nearestY.distance < candidates.y.distance) {
      candidates.y = { ...nearestY, type: "guide" };
    }
  }

  const guideThreshold = context.guideSnapPx / context.viewZoom;
  const guides: Guide[] = [];
  if (candidates.x.value !== null && candidates.x.distance <= guideThreshold) {
    guided.x = candidates.x.value;
    guides.push({ axis: "x", value: candidates.x.value, type: candidates.x.type });
  }
  if (candidates.y.value !== null && candidates.y.distance <= guideThreshold) {
    guided.y = candidates.y.value;
    guides.push({ axis: "y", value: candidates.y.value, type: candidates.y.type });
  }

  return { point: guided, guides };
}
