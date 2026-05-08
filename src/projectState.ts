import type { Point } from "./geometry";

export const STORAGE_KEY = "tile-calculator-state-v1";
export const EXPORT_FORMAT = "tile-calculator-project";

export type DrawUnit = "mm" | "cm" | "m";
export type SnapOption = "guides" | "axes" | "grid";

export interface SnapOptions {
  guides: boolean;
  axes: boolean;
  grid: boolean;
}

export interface GeometrySnapshot {
  points: Point[];
  closed: boolean;
}

export interface SavedProjectControls {
  drawUnit?: unknown;
  gridStep?: unknown;
  snapMode?: "grid" | "guides" | "grid-guides" | "none";
  snapOptions?: Partial<SnapOptions>;
  tileWidth?: unknown;
  tileHeight?: unknown;
  grout?: unknown;
  waste?: unknown;
  layout?: unknown;
  rotation?: unknown;
  layoutOffsetX?: unknown;
  layoutOffsetY?: unknown;
  scale?: unknown;
  showTileNumbers?: unknown;
  highlightFullTiles?: unknown;
  showGuides?: boolean;
  angleSnap?: boolean;
}

export interface SavedProject {
  format?: string;
  version?: number;
  geometry?: GeometrySnapshot;
  controls?: SavedProjectControls;
  view?: {
    zoom?: unknown;
    panX?: unknown;
    panY?: unknown;
  };
}

export function defaultSnapOptions(): SnapOptions {
  return { guides: false, axes: false, grid: true };
}

export function normalizeSnapOptions(controls: SavedProjectControls | undefined): SnapOptions {
  if (controls?.snapOptions && typeof controls.snapOptions === "object") {
    return {
      guides: Boolean(controls.snapOptions.guides),
      axes: Boolean(controls.snapOptions.axes),
      grid: Boolean(controls.snapOptions.grid),
    };
  }

  if (controls?.snapMode === "grid") {
    return { guides: false, axes: false, grid: true };
  }
  if (controls?.snapMode === "guides") {
    return { guides: true, axes: false, grid: false };
  }
  if (controls?.snapMode === "grid-guides") {
    return { guides: true, axes: false, grid: true };
  }
  if (controls?.snapMode === "none" || controls?.angleSnap === false) {
    return { guides: false, axes: false, grid: false };
  }
  if (controls?.showGuides) {
    return { guides: true, axes: false, grid: false };
  }

  return defaultSnapOptions();
}

export function assertSavedProject(value: unknown): asserts value is SavedProject {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid project file");
  }

  const candidate = value as SavedProject;
  if (!candidate.geometry || !Array.isArray(candidate.geometry.points)) {
    throw new Error("Project file does not contain geometry");
  }
}
