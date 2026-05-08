import type { Point } from "./geometry";
import type { LayoutType } from "./tileLayout";

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

export interface PlannerSettings {
  drawUnit: DrawUnit;
  gridStep: string;
  tileWidth: string;
  tileHeight: string;
  grout: string;
  waste: string;
  layout: LayoutType;
  rotation: string;
  layoutOffsetX: string;
  layoutOffsetY: string;
  scale: string;
  showTileNumbers: boolean;
  highlightFullTiles: boolean;
  snapOptions: SnapOptions;
}

export interface PlannerStats {
  area: string;
  tilesRaw: string;
  tilesWithWaste: string;
  cutTiles: string;
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

export function defaultPlannerSettings(): PlannerSettings {
  return {
    drawUnit: "cm",
    gridStep: "10",
    tileWidth: "600",
    tileHeight: "600",
    grout: "2",
    waste: "10",
    layout: "straight",
    rotation: "0",
    layoutOffsetX: "0",
    layoutOffsetY: "0",
    scale: "1",
    showTileNumbers: true,
    highlightFullTiles: true,
    snapOptions: defaultSnapOptions(),
  };
}

export function settingsFromSavedControls(
  current: PlannerSettings,
  controls: SavedProjectControls | undefined,
): PlannerSettings {
  if (!controls) {
    return {
      ...current,
      snapOptions: normalizeSnapOptions(controls),
    };
  }

  const next = { ...current };
  const stringKeys = [
    "gridStep",
    "tileWidth",
    "tileHeight",
    "grout",
    "waste",
    "rotation",
    "layoutOffsetX",
    "layoutOffsetY",
    "scale",
  ] as const;

  if (controls.drawUnit === "mm" || controls.drawUnit === "cm" || controls.drawUnit === "m") {
    next.drawUnit = controls.drawUnit;
  }
  if (controls.layout === "straight" || controls.layout === "brick" || controls.layout === "diagonal" || controls.layout === "herringbone") {
    next.layout = controls.layout;
  }

  stringKeys.forEach((key) => {
    const value = controls[key];
    if (value === undefined) return;
    const migratedValue = (key === "tileWidth" || key === "tileHeight") && Number(value) < 100
      ? Number(value) * 10
      : value;
    next[key] = String(migratedValue);
  });

  if (controls.showTileNumbers !== undefined) {
    next.showTileNumbers = Boolean(controls.showTileNumbers);
  }
  if (controls.highlightFullTiles !== undefined) {
    next.highlightFullTiles = Boolean(controls.highlightFullTiles);
  }
  next.snapOptions = normalizeSnapOptions(controls);

  return next;
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
