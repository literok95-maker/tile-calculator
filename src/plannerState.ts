import type { Point } from "./geometry";
import { defaultSnapOptions, type DrawUnit, type GeometrySnapshot, type SnapOptions } from "./projectState";
import type { Guide } from "./snap";

export interface PlannerState extends GeometrySnapshot {
  draggingIndex: number;
  dragSnapshot: GeometrySnapshot | null;
  dragOffset: Point | null;
  drawingSegment: boolean;
  draftPoint: Point | null;
  measureInput: string;
  guides: Guide[];
  previousDrawUnit: DrawUnit;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  viewZoom: number;
  viewPanX: number;
  viewPanY: number;
  panning: boolean;
  lastPanPoint: Point | null;
  selectedPointIndex: number;
  panToolEnabled: boolean;
  measureToolEnabled: boolean;
  measureStart: Point | null;
  measureEnd: Point | null;
  measureDraft: Point | null;
  undoStack: GeometrySnapshot[];
  redoStack: GeometrySnapshot[];
  snapOptions: SnapOptions;
}

export function createInitialPlannerState(): PlannerState {
  return {
    points: [
      { x: 120, y: 130 },
      { x: 700, y: 130 },
      { x: 700, y: 500 },
      { x: 120, y: 500 },
    ],
    closed: true,
    draggingIndex: -1,
    dragSnapshot: null,
    dragOffset: null,
    drawingSegment: false,
    draftPoint: null,
    measureInput: "",
    guides: [],
    previousDrawUnit: "cm",
    viewportWidth: 1120,
    viewportHeight: 760,
    pixelRatio: 1,
    viewZoom: 1,
    viewPanX: 0,
    viewPanY: 0,
    panning: false,
    lastPanPoint: null,
    selectedPointIndex: -1,
    panToolEnabled: false,
    measureToolEnabled: false,
    measureStart: null,
    measureEnd: null,
    measureDraft: null,
    undoStack: [],
    redoStack: [],
    snapOptions: defaultSnapOptions(),
  };
}

export function geometrySnapshot(state: PlannerState): GeometrySnapshot {
  return {
    points: state.points.map((point) => ({ ...point })),
    closed: state.closed,
  };
}

export function restoreGeometry(state: PlannerState, snapshot: GeometrySnapshot): void {
  state.points = snapshot.points.map((point) => ({ ...point }));
  state.closed = snapshot.closed;
  state.draggingIndex = -1;
  state.dragSnapshot = null;
  state.dragOffset = null;
  state.selectedPointIndex = -1;
  state.measureStart = null;
  state.measureEnd = null;
  state.measureDraft = null;
  state.drawingSegment = false;
  state.draftPoint = null;
  state.measureInput = "";
  state.guides = [];
}

export function snapshotsEqual(
  a: GeometrySnapshot | null | undefined,
  b: GeometrySnapshot | null | undefined,
): boolean {
  if (!a || !b || a.closed !== b.closed || a.points.length !== b.points.length) return false;
  return a.points.every((point, index) => point.x === b.points[index].x && point.y === b.points[index].y);
}

export function pushUndo(state: PlannerState, beforeSnapshot: GeometrySnapshot): void {
  const afterSnapshot = geometrySnapshot(state);
  if (snapshotsEqual(beforeSnapshot, afterSnapshot)) return;
  state.undoStack.push(beforeSnapshot);
  state.redoStack = [];
}

export function undoGeometry(state: PlannerState): boolean {
  if (state.undoStack.length === 0) return false;
  const current = geometrySnapshot(state);
  const previous = state.undoStack.pop();
  if (!previous) return false;
  state.redoStack.push(current);
  restoreGeometry(state, previous);
  return true;
}

export function redoGeometry(state: PlannerState): boolean {
  if (state.redoStack.length === 0) return false;
  const current = geometrySnapshot(state);
  const next = state.redoStack.pop();
  if (!next) return false;
  state.undoStack.push(current);
  restoreGeometry(state, next);
  return true;
}

export function resetHistory(state: PlannerState): void {
  state.undoStack = [];
  state.redoStack = [];
}
