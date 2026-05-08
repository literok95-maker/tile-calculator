// The canvas planner is kept imperative for this migration step.
// It is initialized from React after the DOM controls are rendered.
import {
  closestPointOnSegment,
  distance,
  type Point,
  polygonArea,
} from "./geometry";
import {
  assertSavedProject,
  defaultSnapOptions,
  EXPORT_FORMAT,
  type DrawUnit,
  type GeometrySnapshot,
  type PlannerSettings,
  type PlannerStats,
  type SavedProject,
  type SnapOptions,
  settingsFromSavedControls,
} from "./projectState";
import { clearStoredProject, loadProjectFromStorage, saveProjectToStorage } from "./projectStorage";
import { type Guide, snapPointToContext } from "./snap";
import { calculateTileLayout, type LayoutType, type TileLayoutResult, type TilePlan, tileCenter } from "./tileLayout";

interface SnapOptionsContext {
  excludeIndex?: number;
  anchor?: Point | null;
}

interface PlannerState extends GeometrySnapshot {
  draggingIndex: number;
  dragSnapshot: GeometrySnapshot | null;
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
  undoStack: GeometrySnapshot[];
  redoStack: GeometrySnapshot[];
  snapOptions: SnapOptions;
}

interface SegmentInsertHit {
  insertIndex: number;
  point: Point;
  distance: number;
}

export interface PlannerApi {
  setSettings(settings: PlannerSettings): void;
  exportProject(): SavedProject;
  importProject(project: unknown): void;
  closePolygon(): void;
  removeLastPoint(): void;
  clear(): void;
  destroy(): void;
}

export interface PlannerInitOptions {
  settings: PlannerSettings;
  onSettingsChange(settings: PlannerSettings): void;
  onStatsChange(stats: PlannerStats): void;
}

export function initPlanner(canvas: HTMLCanvasElement, options: PlannerInitOptions): PlannerApi {
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("2D canvas context not available");
  const ctx: CanvasRenderingContext2D = canvasContext;
  let settings = { ...options.settings, snapOptions: { ...options.settings.snapOptions } };
  
  const state: PlannerState = {
    points: [
      { x: 120, y: 130 },
      { x: 700, y: 130 },
      { x: 700, y: 500 },
      { x: 120, y: 500 },
    ],
    closed: true,
    draggingIndex: -1,
    dragSnapshot: null,
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
    undoStack: [],
    redoStack: [],
    snapOptions: defaultSnapOptions(),
  };
  
  const basePixelsPerCm = 2;
  const origin = { x: 64, y: 64 };
  const unitToCm: Record<DrawUnit, number> = {
    mm: 0.1,
    cm: 1,
    m: 100,
  };
  const unitLabels: Record<DrawUnit, string> = {
    mm: "мм",
    cm: "см",
    m: "м",
  };
  const guideSnapPx = 8;
  let isRestoringState = false;
  
  function pxPerCm(): number {
    return basePixelsPerCm * Math.max(Number(settings.scale) || 1, 0.1);
  }
  
  function cmToPx(value: number): number {
    return value * pxPerCm();
  }
  
  function pxToCm(value: number): number {
    return value / pxPerCm();
  }
  
  function drawUnit(): DrawUnit {
    return settings.drawUnit;
  }
  
  function drawingStepCm(): number {
    return Math.max(Number(settings.gridStep) || 1, 0.01) * unitToCm[drawUnit()];
  }
  
  function visibleGridStepCm(): number {
    let stepCm = drawingStepCm();
    while (cmToPx(stepCm) * state.viewZoom < 8) {
      stepCm *= 2;
    }
    return stepCm;
  }
  
  function formatDrawingLength(cmValue: number): string {
    const value = cmValue / unitToCm[drawUnit()];
    const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${Number(rounded)} ${unitLabels[drawUnit()]}`;
  }
  
  function parseMeasureInput(): number | null {
    const normalized = state.measureInput.replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  
  function snapPoint(point: Point, options: SnapOptionsContext = {}): Point {
    const result = snapPointToContext(point, {
      points: state.points,
      snapOptions: state.snapOptions,
      gridStepPx: cmToPx(drawingStepCm()),
      viewZoom: state.viewZoom,
      guideSnapPx,
      excludeIndex: options.excludeIndex,
      anchor: options.anchor,
    });
    state.guides = result.guides;
    return result.point;
  }
  
  function geometrySnapshot(): GeometrySnapshot {
    return {
      points: state.points.map((point) => ({ ...point })),
      closed: state.closed,
    };
  }
  
  function restoreGeometry(snapshot: GeometrySnapshot): void {
    state.points = snapshot.points.map((point) => ({ ...point }));
    state.closed = snapshot.closed;
    state.draggingIndex = -1;
    state.dragSnapshot = null;
    state.drawingSegment = false;
    state.draftPoint = null;
    state.measureInput = "";
    state.guides = [];
  }
  
  function serializeAppState(): SavedProject {
    return {
      format: EXPORT_FORMAT,
      version: 1,
      geometry: geometrySnapshot(),
      controls: {
        drawUnit: drawUnit(),
        gridStep: settings.gridStep,
        snapOptions: { ...state.snapOptions },
        tileWidth: settings.tileWidth,
        tileHeight: settings.tileHeight,
        grout: settings.grout,
        waste: settings.waste,
        layout: settings.layout,
        rotation: settings.rotation,
        layoutOffsetX: settings.layoutOffsetX,
        layoutOffsetY: settings.layoutOffsetY,
        scale: settings.scale,
        showTileNumbers: settings.showTileNumbers,
        highlightFullTiles: settings.highlightFullTiles,
      },
      view: {
        zoom: state.viewZoom,
        panX: state.viewPanX,
        panY: state.viewPanY,
      },
    };
  }
  
  function applyAppState(savedState: SavedProject): void {
    assertSavedProject(savedState);
  
    restoreGeometry(savedState.geometry!);
  
    settings = settingsFromSavedControls(settings, savedState.controls);
    state.snapOptions = settings.snapOptions;
  
    state.previousDrawUnit = drawUnit();
    state.viewZoom = Math.min(Math.max(Number(savedState.view?.zoom) || 1, 0.25), 6);
    state.viewPanX = Number(savedState.view?.panX) || 0;
    state.viewPanY = Number(savedState.view?.panY) || 0;
    state.undoStack = [];
    state.redoStack = [];
    options.onSettingsChange(settings);
  }
  
  function saveAppState(): void {
    if (isRestoringState) return;
    try {
      saveProjectToStorage(serializeAppState());
    } catch (error) {
      // Storage can be unavailable in restricted browser modes.
    }
  }
  
  function restoreAppState(): void {
    try {
      const savedState = loadProjectFromStorage();
      if (!savedState) return;
      isRestoringState = true;
      applyAppState(savedState);
    } catch (error) {
      try {
        clearStoredProject();
      } catch (removeError) {
        // Ignore storage cleanup failures.
      }
    } finally {
      isRestoringState = false;
    }
  }
  
  function snapshotsEqual(a: GeometrySnapshot | null | undefined, b: GeometrySnapshot | null | undefined): boolean {
    if (!a || !b || a.closed !== b.closed || a.points.length !== b.points.length) return false;
    return a.points.every((point, index) => point.x === b.points[index].x && point.y === b.points[index].y);
  }
  
  function pushUndo(beforeSnapshot: GeometrySnapshot): void {
    const afterSnapshot = geometrySnapshot();
    if (snapshotsEqual(beforeSnapshot, afterSnapshot)) return;
    state.undoStack.push(beforeSnapshot);
    state.redoStack = [];
  }
  
  function undo(): void {
    if (state.undoStack.length === 0) return;
    const current = geometrySnapshot();
    const previous = state.undoStack.pop();
    state.redoStack.push(current);
    if (!previous) return;
    restoreGeometry(previous);
    render();
  }
  
  function redo(): void {
    if (state.redoStack.length === 0) return;
    const current = geometrySnapshot();
    const next = state.redoStack.pop();
    state.undoStack.push(current);
    if (!next) return;
    restoreGeometry(next);
    render();
  }
  
  function screenToWorld(point: Point): Point {
    return {
      x: (point.x - state.viewPanX) / state.viewZoom,
      y: (point.y - state.viewPanY) / state.viewZoom,
    };
  }
  
  function screenPointerPosition(event: PointerEvent | WheelEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }
  
  function snapDrawingPoint(point: Point, anchor: Point | null = null): Point {
    return snapPoint(point, { anchor });
  }
  
  function pointAtTypedLength(anchor: Point, currentPoint: Point): Point {
    const typedLength = parseMeasureInput();
    if (!typedLength || !anchor) return currentPoint;
    const hasDirection = distance(anchor, currentPoint) > 0;
    const angle = hasDirection ? Math.atan2(currentPoint.y - anchor.y, currentPoint.x - anchor.x) : 0;
    const lengthPx = cmToPx(typedLength * unitToCm[drawUnit()]);
    return {
      x: anchor.x + Math.cos(angle) * lengthPx,
      y: anchor.y + Math.sin(angle) * lengthPx,
    };
  }
  
  function commitDraftPoint(point: Point | null = state.draftPoint): boolean {
    if (!point || state.closed || state.points.length === 0) return false;
    const anchor = state.points[state.points.length - 1];
    if (distance(anchor, point) < 2 / state.viewZoom) return false;
  
    const beforeSnapshot = geometrySnapshot();
    state.points.push({ ...point });
    pushUndo(beforeSnapshot);
    state.drawingSegment = true;
    state.draftPoint = { ...point };
    state.measureInput = "";
    state.guides = [];
    return true;
  }
  
  function closeDrawingPolygon(): boolean {
    if (state.points.length < 3 || state.closed) return false;
    const beforeSnapshot = geometrySnapshot();
    state.closed = true;
    state.drawingSegment = false;
    state.draftPoint = null;
    state.measureInput = "";
    state.guides = [];
    pushUndo(beforeSnapshot);
    return true;
  }
  
  function cancelDrawingSegment(): void {
    state.drawingSegment = false;
    state.draftPoint = null;
    state.measureInput = "";
    state.guides = [];
  }
  
  function isTextEntryTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
  }
  
  function pointerPosition(event: PointerEvent): Point {
    return screenToWorld(screenPointerPosition(event));
  }
  
  function segmentAtPoint(point: Point): SegmentInsertHit | null {
    if (state.points.length < 2) return null;
    const segmentCount = state.closed ? state.points.length : state.points.length - 1;
    const hitThreshold = 10 / state.viewZoom;
    let best: SegmentInsertHit | null = null;
  
    for (let i = 0; i < segmentCount; i += 1) {
      const start = state.points[i];
      const end = state.points[(i + 1) % state.points.length];
      const candidate = closestPointOnSegment(point, start, end);
      if (candidate.t <= 0.03 || candidate.t >= 0.97) continue;
      if (candidate.distance <= hitThreshold && (!best || candidate.distance < best.distance)) {
        best = {
          insertIndex: i + 1,
          point: candidate.point,
          distance: candidate.distance,
        };
      }
    }
  
    return best;
  }
  
  function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  
  function calculateTiles(): TileLayoutResult {
    if (!state.closed || state.points.length < 3) {
      return { tiles: [], cut: 0, materialTiles: 0 };
    }
  
    const tileWidth = cmToPx((Number(settings.tileWidth) + Number(settings.grout)) / 10);
    const tileHeight = cmToPx((Number(settings.tileHeight) + Number(settings.grout)) / 10);
    const layout = settings.layout as LayoutType;
    const baseRotation = Number(settings.rotation) * (Math.PI / 180);
    const layoutOffsetX = cmToPx(Number(settings.layoutOffsetX) || 0);
    const layoutOffsetY = cmToPx(Number(settings.layoutOffsetY) || 0);
    return calculateTileLayout({
      room: state.points,
      origin,
      tileWidth,
      tileHeight,
      layout,
      rotation: baseRotation,
      offsetX: layoutOffsetX,
      offsetY: layoutOffsetY,
      viewportWidth: state.viewportWidth,
      viewportHeight: state.viewportHeight,
    });
  }
  
  function visibleWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const topLeft = screenToWorld({ x: 0, y: 0 });
    const bottomRight = screenToWorld({ x: state.viewportWidth, y: state.viewportHeight });
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxX: Math.max(topLeft.x, bottomRight.x),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }
  
  function drawGrid(): void {
    const visibleStepCm = visibleGridStepCm();
    const minor = cmToPx(visibleStepCm);
    const major = minor * 5;
    const bounds = visibleWorldBounds();
    const startX = Math.floor((bounds.minX - origin.x) / minor) * minor + origin.x;
    const endX = bounds.maxX;
    const startY = Math.floor((bounds.minY - origin.y) / minor) * minor + origin.y;
    const endY = bounds.maxY;
  
    ctx.lineWidth = 1;
    for (let x = startX; x < endX; x += minor) {
      ctx.strokeStyle = Math.abs((x - origin.x) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
      ctx.beginPath();
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += minor) {
      ctx.strokeStyle = Math.abs((y - origin.y) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
      ctx.beginPath();
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
      ctx.stroke();
    }
  }
  
  function drawGridScaleLabel(): void {
    const visibleStepCm = visibleGridStepCm();
    ctx.fillStyle = "#8a8177";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText(
      `Видимая сетка: ${formatDrawingLength(visibleStepCm)} · Зум: ${Math.round(state.viewZoom * 100)}%`,
      14,
      state.viewportHeight - 18,
    );
  }
  
  function drawGuides(): void {
    if (state.guides.length === 0) return;
    const bounds = visibleWorldBounds();
  
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    state.guides.forEach((guide) => {
      ctx.strokeStyle = guide.type === "axis" ? "#2563eb" : "#d97706";
      ctx.beginPath();
      if (guide.axis === "x") {
        ctx.moveTo(guide.value, bounds.minY);
        ctx.lineTo(guide.value, bounds.maxY);
      } else {
        ctx.moveTo(bounds.minX, guide.value);
        ctx.lineTo(bounds.maxX, guide.value);
      }
      ctx.stroke();
    });
    ctx.restore();
  }
  
  function drawSegmentLabels(): void {
    if (state.points.length < 2) return;
    const segmentCount = state.closed ? state.points.length : state.points.length - 1;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  
    for (let i = 0; i < segmentCount; i += 1) {
      const start = state.points[i];
      const end = state.points[(i + 1) % state.points.length];
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const text = formatDrawingLength(pxToCm(distance(start, end)));
      const label = {
        x: mid.x + normal.x * 18,
        y: mid.y + normal.y * 18,
      };
  
      ctx.fillStyle = "rgba(255, 253, 250, 0.90)";
      const width = ctx.measureText(text).width + 12;
      ctx.fillRect(label.x - width / 2, label.y - 10, width, 20);
      ctx.fillStyle = "#4f463d";
      ctx.fillText(text, label.x, label.y);
    }
  
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  
  function drawPolygon(): void {
    if (state.points.length === 0) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1f3f3a";
    ctx.fillStyle = "rgba(47, 111, 98, 0.10)";
    ctx.beginPath();
    ctx.moveTo(state.points[0].x, state.points[0].y);
    state.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    if (state.closed && state.points.length > 2) ctx.closePath();
    ctx.fill();
    ctx.stroke();
  
    state.points.forEach((point, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === state.draggingIndex ? "#c85f35" : "#2f6f62";
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    drawDraftSegment();
    drawSegmentLabels();
  }
  
  function drawDraftSegment(): void {
    if (!state.draftPoint || state.points.length === 0 || state.closed) return;
    const anchor = state.points[state.points.length - 1];
  
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#c85f35";
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(state.draftPoint.x, state.draftPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#c85f35";
    ctx.beginPath();
    ctx.arc(state.draftPoint.x, state.draftPoint.y, 5, 0, Math.PI * 2);
    ctx.fill();
  
    const mid = {
      x: (anchor.x + state.draftPoint.x) / 2,
      y: (anchor.y + state.draftPoint.y) / 2,
    };
    const text = state.measureInput
      ? `${state.measureInput.replace(".", ",")} ${unitLabels[drawUnit()]}`
      : formatDrawingLength(pxToCm(distance(anchor, state.draftPoint)));
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = "rgba(255, 253, 250, 0.96)";
    ctx.strokeStyle = "rgba(200, 95, 53, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundedRectPath(mid.x - width / 2, mid.y - 12, width, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9d4525";
    ctx.fillText(text, mid.x, mid.y + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
  
  function drawTiles(tiles: TilePlan[]): void {
    if (!state.closed) return;
    const highlightFullTiles = settings.highlightFullTiles;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(state.points[0].x, state.points[0].y);
    state.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.clip();
  
    tiles.forEach((tile) => {
      ctx.beginPath();
      ctx.moveTo(tile.points[0].x, tile.points[0].y);
      tile.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = highlightFullTiles
        ? (tile.full ? "rgba(77, 132, 184, 0.22)" : "rgba(200, 95, 53, 0.24)")
        : "rgba(77, 132, 184, 0.22)";
      ctx.strokeStyle = highlightFullTiles
        ? (tile.full ? "rgba(39, 97, 147, 0.65)" : "rgba(166, 73, 36, 0.75)")
        : "rgba(39, 97, 147, 0.65)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  
  if (settings.showTileNumbers) {
      tiles.forEach((tile) => {
        if (!tile.label) return;
        const center = tile.labelPoint || tileCenter(tile);
        const label = tile.label;
        ctx.font = tile.full ? "700 13px Inter, system-ui, sans-serif" : "700 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const width = Math.max(ctx.measureText(label).width + 10, tile.full ? 24 : 30);
        const height = 20;
  
        ctx.fillStyle = highlightFullTiles
          ? (tile.full ? "rgba(255, 253, 250, 0.92)" : "rgba(255, 244, 236, 0.95)")
          : "rgba(255, 253, 250, 0.92)";
        ctx.strokeStyle = highlightFullTiles
          ? (tile.full ? "rgba(39, 97, 147, 0.65)" : "rgba(166, 73, 36, 0.75)")
          : "rgba(39, 97, 147, 0.65)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundedRectPath(center.x - width / 2, center.y - height / 2, width, height, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = highlightFullTiles
          ? (tile.full ? "#214f78" : "#9d4525")
          : "#214f78";
        ctx.fillText(label, center.x, center.y + 0.5);
      });
    }
  
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  
  function updateStats(tileResult: TileLayoutResult): void {
    const areaM2 = polygonArea(state.points) / (pxPerCm() ** 2) / 10000;
    const materialTiles = tileResult.materialTiles || 0;
    const raw = Math.ceil(materialTiles);
    const waste = Number(settings.waste) / 100;
    options.onStatsChange({
      area: state.closed ? areaM2.toFixed(2) : "0",
      tilesRaw: state.closed ? String(raw) : "0",
      tilesWithWaste: state.closed ? String(Math.ceil(materialTiles * (1 + waste))) : "0",
      cutTiles: state.closed ? String(tileResult.cut) : "0",
    });
  }
  
  function render(): void {
    ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
    ctx.save();
    ctx.translate(state.viewPanX, state.viewPanY);
    ctx.scale(state.viewZoom, state.viewZoom);
    drawGrid();
    const tileResult = calculateTiles();
    drawTiles(tileResult.tiles);
    drawGuides();
    drawPolygon();
    ctx.restore();
    drawGridScaleLabel();
    updateStats(tileResult);
    saveAppState();
  }
  
  function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(Math.round(rect.width), 1);
    const height = Math.max(Math.round(rect.height), 1);
    state.viewportWidth = width;
    state.viewportHeight = height;
    state.pixelRatio = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    render();
  }
  
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus();
  
    if (event.button === 1) {
      event.preventDefault();
      state.panning = true;
      state.lastPanPoint = screenPointerPosition(event);
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }
  
    const point = pointerPosition(event);
    const nearestIndex = state.points.findIndex((existing) => distance(existing, point) < 12 / state.viewZoom);
    if (!state.closed && state.drawingSegment) {
      if (nearestIndex === 0 && state.points.length >= 3) {
        closeDrawingPolygon();
        render();
        return;
      }
  
      const anchor = state.points[state.points.length - 1];
      const targetPoint = state.measureInput
        ? pointAtTypedLength(anchor, state.draftPoint || snapDrawingPoint(point, anchor))
        : snapDrawingPoint(point, anchor);
      commitDraftPoint(targetPoint);
      render();
      return;
    }
  
    if (nearestIndex >= 0) {
      state.guides = [];
      state.draggingIndex = nearestIndex;
      state.dragSnapshot = geometrySnapshot();
      canvas.setPointerCapture(event.pointerId);
      render();
      return;
    }
    const segmentHit = segmentAtPoint(point);
    if (segmentHit && !state.drawingSegment) {
      const beforeSnapshot = geometrySnapshot();
      state.points.splice(segmentHit.insertIndex, 0, snapPoint(segmentHit.point));
      pushUndo(beforeSnapshot);
      state.guides = [];
      render();
      return;
    }
    if (!state.closed) {
      const beforeSnapshot = geometrySnapshot();
      if (state.points.length === 0) {
        state.points.push(snapPoint(point));
        pushUndo(beforeSnapshot);
      }
      const anchor = state.points[state.points.length - 1];
      state.drawingSegment = true;
      state.draftPoint = snapDrawingPoint(point, anchor);
      state.measureInput = "";
      render();
    }
  });
  
  canvas.addEventListener("pointermove", (event) => {
    if (state.panning && state.lastPanPoint) {
      const current = screenPointerPosition(event);
      state.viewPanX += current.x - state.lastPanPoint.x;
      state.viewPanY += current.y - state.lastPanPoint.y;
      state.lastPanPoint = current;
      render();
      return;
    }
  
    if (state.drawingSegment) {
      const anchor = state.points[state.points.length - 1];
      const pointerPoint = snapDrawingPoint(pointerPosition(event), anchor);
      state.draftPoint = pointAtTypedLength(anchor, pointerPoint);
      render();
      return;
    }
    if (state.draggingIndex < 0) return;
    const dragAnchor = state.dragSnapshot?.points?.[state.draggingIndex] || null;
    state.points[state.draggingIndex] = snapPoint(pointerPosition(event), {
      excludeIndex: state.draggingIndex,
      anchor: dragAnchor,
    });
    render();
  });
  
  canvas.addEventListener("pointerup", (event) => {
    const finishedDrag = state.draggingIndex >= 0;
    if (state.draggingIndex >= 0 && state.dragSnapshot) {
      pushUndo(state.dragSnapshot);
    }
    state.draggingIndex = -1;
    state.dragSnapshot = null;
    state.panning = false;
    state.lastPanPoint = null;
    if (finishedDrag) {
      state.guides = [];
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    render();
  });
  
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const screenPoint = screenPointerPosition(event);
    const worldPoint = screenToWorld(screenPoint);
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.min(Math.max(state.viewZoom * zoomFactor, 0.25), 6);
  
    state.viewZoom = nextZoom;
    state.viewPanX = screenPoint.x - worldPoint.x * nextZoom;
    state.viewPanY = screenPoint.y - worldPoint.y * nextZoom;
    render();
  }, { passive: false });
  
  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });
  
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      redo();
    }
  
    if (isTextEntryTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!state.drawingSegment || state.closed || state.points.length === 0) return;
  
    if (event.key === "Escape") {
      event.preventDefault();
      cancelDrawingSegment();
      render();
      return;
    }
  
    if (event.key === "Backspace") {
      event.preventDefault();
      state.measureInput = state.measureInput.slice(0, -1);
      const anchor = state.points[state.points.length - 1];
      if (state.draftPoint) {
        state.draftPoint = pointAtTypedLength(anchor, state.draftPoint);
      }
      render();
      return;
    }
  
    if (event.key === "Enter") {
      event.preventDefault();
      if (state.measureInput && state.draftPoint) {
        const anchor = state.points[state.points.length - 1];
        commitDraftPoint(pointAtTypedLength(anchor, state.draftPoint));
      }
      render();
      return;
    }
  
    if (/^[0-9]$/.test(event.key) || event.key === "." || event.key === ",") {
      event.preventDefault();
      const separatorAlreadyTyped = state.measureInput.includes(".") || state.measureInput.includes(",");
      if ((event.key === "." || event.key === ",") && separatorAlreadyTyped) return;
      state.measureInput += event.key;
      const anchor = state.points[state.points.length - 1];
      if (state.draftPoint) {
        state.draftPoint = pointAtTypedLength(anchor, state.draftPoint);
      }
      render();
    }
  });
  
  function handleClosePolygon(): void {
    if (state.points.length >= 3) {
      closeDrawingPolygon();
    }
    render();
  }

  function handleRemoveLastPoint(): void {
    const beforeSnapshot = geometrySnapshot();
    state.points.pop();
    if (state.points.length < 3) {
      state.closed = false;
    }
    pushUndo(beforeSnapshot);
    state.draggingIndex = -1;
    state.dragSnapshot = null;
    cancelDrawingSegment();
    render();
  }

  function handleClear(): void {
    const beforeSnapshot = geometrySnapshot();
    state.points = [];
    state.closed = false;
    cancelDrawingSegment();
    pushUndo(beforeSnapshot);
    render();
  }
  
  restoreAppState();
  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);
  resizeCanvas();

  return {
    setSettings(nextSettings) {
      settings = { ...nextSettings, snapOptions: { ...nextSettings.snapOptions } };
      state.snapOptions = { ...nextSettings.snapOptions };
      state.previousDrawUnit = settings.drawUnit;
      if (!state.snapOptions.guides && !state.snapOptions.axes) {
        state.guides = [];
      }
      render();
    },
    exportProject: serializeAppState,
    importProject(project) {
      assertSavedProject(project);
      const beforeSnapshot = geometrySnapshot();
      applyAppState(project);
      pushUndo(beforeSnapshot);
      render();
    },
    closePolygon: handleClosePolygon,
    removeLastPoint: handleRemoveLastPoint,
    clear: handleClear,
    destroy() {
      resizeObserver.disconnect();
    },
  };
}
