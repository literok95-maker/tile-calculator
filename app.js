const canvas = document.querySelector("#planner");
const ctx = canvas.getContext("2d");

const controls = {
  drawUnit: document.querySelector("#drawUnit"),
  gridStep: document.querySelector("#gridStep"),
  tileWidth: document.querySelector("#tileWidth"),
  tileHeight: document.querySelector("#tileHeight"),
  grout: document.querySelector("#grout"),
  waste: document.querySelector("#waste"),
  layout: document.querySelector("#layout"),
  rotation: document.querySelector("#rotation"),
  layoutOffsetX: document.querySelector("#layoutOffsetX"),
  layoutOffsetY: document.querySelector("#layoutOffsetY"),
  scale: document.querySelector("#scale"),
  showTileNumbers: document.querySelector("#showTileNumbers"),
  highlightFullTiles: document.querySelector("#highlightFullTiles"),
  area: document.querySelector("#area"),
  tilesRaw: document.querySelector("#tilesRaw"),
  tilesWithWaste: document.querySelector("#tilesWithWaste"),
  cutTiles: document.querySelector("#cutTiles"),
  snapModeBtn: document.querySelector("#snapModeBtn"),
  snapModeMenu: document.querySelector("#snapModeMenu"),
  closePolygonBtn: document.querySelector("#closePolygonBtn"),
  removeLastPointBtn: document.querySelector("#removeLastPointBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  clearBtn: document.querySelector("#clearBtn"),
};

const state = {
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
  snapMode: "grid",
};

const basePixelsPerCm = 2;
const origin = { x: 64, y: 64 };
const unitToCm = {
  mm: 0.1,
  cm: 1,
  m: 100,
};
const unitLabels = {
  mm: "мм",
  cm: "см",
  m: "м",
};
const guideSnapPx = 8;
const storageKey = "tile-calculator-state-v1";
const exportFormat = "tile-calculator-project";
let isRestoringState = false;

function pxPerCm() {
  return basePixelsPerCm * Math.max(Number(controls.scale.value) || 1, 0.1);
}

function cmToPx(value) {
  return value * pxPerCm();
}

function pxToCm(value) {
  return value / pxPerCm();
}

function drawUnit() {
  return controls.drawUnit.value;
}

function drawingStepCm() {
  return Math.max(Number(controls.gridStep.value) || 1, 0.01) * unitToCm[drawUnit()];
}

function visibleGridStepCm() {
  let stepCm = drawingStepCm();
  while (cmToPx(stepCm) * state.viewZoom < 8) {
    stepCm *= 2;
  }
  return stepCm;
}

function formatDrawingLength(cmValue) {
  const value = cmValue / unitToCm[drawUnit()];
  const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${Number(rounded)} ${unitLabels[drawUnit()]}`;
}

function snapPoint(point) {
  if (state.snapMode === "none") return point;
  if (state.snapMode === "guides") return applyGuides(point);
  if (state.snapMode === "grid-guides") {
    const guided = applyGuides(point);
    if (state.guides.length > 0) return guided;
  }
  const snapPx = cmToPx(drawingStepCm());
  return {
    x: Math.round(point.x / snapPx) * snapPx,
    y: Math.round(point.y / snapPx) * snapPx,
  };
}

function geometrySnapshot() {
  return {
    points: state.points.map((point) => ({ ...point })),
    closed: state.closed,
  };
}

function restoreGeometry(snapshot) {
  state.points = snapshot.points.map((point) => ({ ...point }));
  state.closed = snapshot.closed;
  state.draggingIndex = -1;
  state.dragSnapshot = null;
  state.drawingSegment = false;
  state.draftPoint = null;
  state.guides = [];
}

function serializeAppState() {
  return {
    format: exportFormat,
    version: 1,
    geometry: geometrySnapshot(),
    controls: {
      drawUnit: controls.drawUnit.value,
      gridStep: controls.gridStep.value,
      snapMode: state.snapMode,
      tileWidth: controls.tileWidth.value,
      tileHeight: controls.tileHeight.value,
      grout: controls.grout.value,
      waste: controls.waste.value,
      layout: controls.layout.value,
      rotation: controls.rotation.value,
      layoutOffsetX: controls.layoutOffsetX.value,
      layoutOffsetY: controls.layoutOffsetY.value,
      scale: controls.scale.value,
      showTileNumbers: controls.showTileNumbers.checked,
      highlightFullTiles: controls.highlightFullTiles.checked,
    },
    view: {
      zoom: state.viewZoom,
      panX: state.viewPanX,
      panY: state.viewPanY,
    },
  };
}

function applyAppState(savedState) {
  if (!savedState || typeof savedState !== "object") {
    throw new Error("Invalid project file");
  }
  if (!savedState.geometry || !Array.isArray(savedState.geometry.points)) {
    throw new Error("Project file does not contain geometry");
  }

  restoreGeometry(savedState.geometry);

  Object.entries(savedState.controls || {}).forEach(([key, value]) => {
    if (key === "snapMode") return;
    const control = controls[key];
    if (!control) return;
    const migratedValue = (key === "tileWidth" || key === "tileHeight") && Number(value) < 100
      ? Number(value) * 10
      : value;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      control.checked = Boolean(migratedValue);
    } else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
      control.value = String(migratedValue);
    }
  });

  if (["grid", "guides", "grid-guides", "none"].includes(savedState.controls?.snapMode)) {
    state.snapMode = savedState.controls.snapMode;
  } else if (savedState.controls?.showGuides) {
    state.snapMode = "guides";
  } else if (savedState.controls?.angleSnap === false) {
    state.snapMode = "none";
  } else {
    state.snapMode = "grid";
  }

  state.previousDrawUnit = drawUnit();
  state.viewZoom = Math.min(Math.max(Number(savedState.view?.zoom) || 1, 0.25), 6);
  state.viewPanX = Number(savedState.view?.panX) || 0;
  state.viewPanY = Number(savedState.view?.panY) || 0;
  state.undoStack = [];
  state.redoStack = [];
  syncSnapModeMenu();
}

function saveAppState() {
  if (isRestoringState) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(serializeAppState()));
  } catch (error) {
    // Storage can be unavailable in restricted browser modes.
  }
}

function restoreAppState() {
  let rawState = null;
  try {
    rawState = localStorage.getItem(storageKey);
  } catch (error) {
    return;
  }
  if (!rawState) return;

  try {
    isRestoringState = true;
    const savedState = JSON.parse(rawState);
    applyAppState(savedState);
  } catch (error) {
    try {
      localStorage.removeItem(storageKey);
    } catch (removeError) {
      // Ignore storage cleanup failures.
    }
  } finally {
    isRestoringState = false;
  }
}

function snapshotsEqual(a, b) {
  if (!a || !b || a.closed !== b.closed || a.points.length !== b.points.length) return false;
  return a.points.every((point, index) => point.x === b.points[index].x && point.y === b.points[index].y);
}

function pushUndo(beforeSnapshot) {
  const afterSnapshot = geometrySnapshot();
  if (snapshotsEqual(beforeSnapshot, afterSnapshot)) return;
  state.undoStack.push(beforeSnapshot);
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) return;
  const current = geometrySnapshot();
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  restoreGeometry(previous);
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  const current = geometrySnapshot();
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreGeometry(next);
  render();
}

function syncSnapModeMenu() {
  const labels = {
    grid: "🧲 Сетка",
    guides: "🧲 Гайды",
    "grid-guides": "🧲 Сетка + гайды",
    none: "🧲 Выкл",
  };
  controls.snapModeBtn.textContent = labels[state.snapMode];
  controls.snapModeMenu.querySelectorAll("[data-snap-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.snapMode === state.snapMode));
  });
  if (state.snapMode !== "guides" && state.snapMode !== "grid-guides") {
    state.guides = [];
  }
}

function screenToWorld(point) {
  return {
    x: (point.x - state.viewPanX) / state.viewZoom,
    y: (point.y - state.viewPanY) / state.viewZoom,
  };
}

function screenPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function applyGuides(point, options = {}) {
  if (state.snapMode !== "guides" && state.snapMode !== "grid-guides") {
    state.guides = [];
    return point;
  }

  const { excludeIndex = -1 } = options;
  const guided = { ...point };
  const guides = [];
  let nearestX = { distance: Infinity, value: null };
  let nearestY = { distance: Infinity, value: null };

  state.points.forEach((existing, index) => {
    if (index === excludeIndex) return;
    const xDistance = Math.abs(existing.x - point.x);
    const yDistance = Math.abs(existing.y - point.y);
    if (xDistance < nearestX.distance) {
      nearestX = { distance: xDistance, value: existing.x };
    }
    if (yDistance < nearestY.distance) {
      nearestY = { distance: yDistance, value: existing.y };
    }
  });

  const guideThreshold = guideSnapPx / state.viewZoom;
  if (nearestX.value !== null && nearestX.distance <= guideThreshold) {
    guided.x = nearestX.value;
    guides.push({ axis: "x", value: nearestX.value });
  }
  if (nearestY.value !== null && nearestY.distance <= guideThreshold) {
    guided.y = nearestY.value;
    guides.push({ axis: "y", value: nearestY.value });
  }

  state.guides = guides;
  return guided;
}

function snapDrawingPoint(point, anchor = null) {
  return snapPoint(point);
}

function pointerPosition(event) {
  return screenToWorld(screenPointerPosition(event));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function closestPointOnSegment(point, start, end) {
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

function segmentAtPoint(point) {
  if (state.points.length < 2) return null;
  const segmentCount = state.closed ? state.points.length : state.points.length - 1;
  const hitThreshold = 10 / state.viewZoom;
  let best = null;

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

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(point, polygon) {
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

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function tileIntersectsPolygon(tile, polygon) {
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

function tileCoverage(tile, polygon) {
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

function rotatedPoint(cx, cy, x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  };
}

function tilePolygon(x, y, width, height, angle, rowOffset) {
  const ox = x + rowOffset;
  const corners = [
    { x: ox, y },
    { x: ox + width, y },
    { x: ox + width, y: y + height },
    { x: ox, y: y + height },
  ];
  return corners.map((point) => rotatedPoint(origin.x, origin.y, point.x - origin.x, point.y - origin.y, angle));
}

function boundsFor(points) {
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

function tileCenter(tile) {
  return {
    x: tile.points.reduce((sum, point) => sum + point.x, 0) / tile.points.length,
    y: tile.points.reduce((sum, point) => sum + point.y, 0) / tile.points.length,
  };
}

function roundedRectPath(x, y, width, height, radius) {
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

function assignTileNumbers(tiles) {
  let nextSourceNumber = 1;
  const cutBins = [];

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
      let bin = cutBins.find((candidate) => candidate.remaining + 0.001 >= tile.coverage);
      if (!bin) {
        bin = {
          sourceNumber: nextSourceNumber,
          remaining: 1,
          fragmentCount: 0,
        };
        cutBins.push(bin);
        nextSourceNumber += 1;
      }

      bin.fragmentCount = (bin.fragmentCount || 0) + 1;
      bin.remaining -= tile.coverage;
      tile.sourceNumber = bin.sourceNumber;
      tile.fragmentNumber = bin.fragmentCount;
      tile.label = `${tile.sourceNumber}.${tile.fragmentNumber}`;
    });

  return nextSourceNumber - 1;
}

function collectIntersectingTile(tile, tiles) {
  if (!tileIntersectsPolygon(tile, state.points)) return 0;
  const coverageResult = tileCoverage(tile, state.points);
  const coverage = coverageResult.ratio;
  if (coverage === 0) return 0;
  const full = coverage >= 0.98;
  tiles.push({ points: tile, full, coverage, labelPoint: coverageResult.labelPoint });
  return full ? 0 : 1;
}

function herringbonePoint(x, y, angle, offsetX = 0, offsetY = 0) {
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

function herringboneTileSet(x0, y0, a, b, angle, offsetX = 0, offsetY = 0) {
  return [
    [
      herringbonePoint(x0, y0, angle, offsetX, offsetY),
      herringbonePoint(x0, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + b, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + b, y0, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(x0 + a, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(x0, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(x0, y0 + a + b, angle, offsetX, offsetY),
      herringbonePoint(x0 + a, y0 + a + b, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(x0 + a, y0 + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + b + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + b + a, y0 + a, angle, offsetX, offsetY),
    ],
    [
      herringbonePoint(x0 + a + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + a, y0 + a + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + a, y0 + a + b + a, angle, offsetX, offsetY),
      herringbonePoint(x0 + a + a, y0 + a + b + a, angle, offsetX, offsetY),
    ],
  ];
}

function calculateTiles() {
  if (!state.closed || state.points.length < 3) {
    return { tiles: [], cut: 0, materialTiles: 0 };
  }

  const tileWidth = cmToPx((Number(controls.tileWidth.value) + Number(controls.grout.value)) / 10);
  const tileHeight = cmToPx((Number(controls.tileHeight.value) + Number(controls.grout.value)) / 10);
  const layout = controls.layout.value;
  const baseRotation = Number(controls.rotation.value) * (Math.PI / 180);
  const angle = baseRotation + (layout === "diagonal" ? Math.PI / 4 : 0);
  const layoutOffsetX = cmToPx(Number(controls.layoutOffsetX.value) || 0);
  const layoutOffsetY = cmToPx(Number(controls.layoutOffsetY.value) || 0);
  const bounds = boundsFor(state.points);
  const padding = Math.max(tileWidth, tileHeight) * 3;
  const tiles = [];
  let cut = 0;

  const startX = Math.floor((bounds.minX - padding) / tileWidth) * tileWidth;
  const endX = bounds.maxX + padding;
  const startY = Math.floor((bounds.minY - padding) / tileHeight) * tileHeight;
  const endY = bounds.maxY + padding;

  if (layout === "herringbone") {
    const longSide = Math.max(tileWidth, tileHeight);
    const shortSide = Math.min(tileWidth, tileHeight);
    const repeatAlong = shortSide * 2;
    const repeatAcross = longSide;
    const herringbonePadding = Math.max(state.viewportWidth, state.viewportHeight) + longSide * 3;
    const alongCount = Math.ceil(herringbonePadding / repeatAlong) + 4;
    const acrossCount = Math.ceil(herringbonePadding / repeatAcross) + 4;

    for (let along = -alongCount; along <= alongCount; along += 1) {
      for (let across = -acrossCount; across <= acrossCount; across += 1) {
        const x0 = repeatAlong * along + repeatAcross * across;
        const y0 = repeatAlong * along - repeatAcross * across;
        herringboneTileSet(x0, y0, shortSide, longSide, baseRotation, layoutOffsetX, layoutOffsetY).forEach((tile) => {
          cut += collectIntersectingTile(tile, tiles);
        });
      }
    }
  } else {
    let row = 0;
    for (let y = startY; y <= endY; y += tileHeight) {
      const rowOffset = layout === "brick" && row % 2 === 1 ? tileWidth / 2 : 0;
      for (let x = startX; x <= endX; x += tileWidth) {
        const tile = tilePolygon(x + layoutOffsetX, y + layoutOffsetY, tileWidth, tileHeight, angle, rowOffset);
        cut += collectIntersectingTile(tile, tiles);
      }
      row += 1;
    }
  }

  const materialTiles = assignTileNumbers(tiles);
  return { tiles, cut, materialTiles };
}

function visibleWorldBounds() {
  const topLeft = screenToWorld({ x: 0, y: 0 });
  const bottomRight = screenToWorld({ x: state.viewportWidth, y: state.viewportHeight });
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}

function drawGrid() {
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

function drawGridScaleLabel() {
  const visibleStepCm = visibleGridStepCm();
  ctx.fillStyle = "#8a8177";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(
    `Видимая сетка: ${formatDrawingLength(visibleStepCm)} · Зум: ${Math.round(state.viewZoom * 100)}%`,
    14,
    state.viewportHeight - 18,
  );
}

function drawGuides() {
  if ((state.snapMode !== "guides" && state.snapMode !== "grid-guides") || state.guides.length === 0) return;
  const bounds = visibleWorldBounds();

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#d97706";
  state.guides.forEach((guide) => {
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

function drawSegmentLabels() {
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

function drawPolygon() {
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

function drawDraftSegment() {
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
  ctx.restore();
}

function drawTiles(tiles) {
  if (!state.closed) return;
  const highlightFullTiles = controls.highlightFullTiles.checked;
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

  if (controls.showTileNumbers.checked) {
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

function updateStats(tileResult) {
  const areaM2 = polygonArea(state.points) / (pxPerCm() ** 2) / 10000;
  const materialTiles = tileResult.materialTiles || 0;
  const raw = Math.ceil(materialTiles);
  const waste = Number(controls.waste.value) / 100;
  controls.area.textContent = state.closed ? areaM2.toFixed(2) : "0";
  controls.tilesRaw.textContent = state.closed ? String(raw) : "0";
  controls.tilesWithWaste.textContent = state.closed ? String(Math.ceil(materialTiles * (1 + waste))) : "0";
  controls.cutTiles.textContent = state.closed ? String(tileResult.cut) : "0";
}

function render() {
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

function resizeCanvas() {
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
  if (nearestIndex >= 0) {
    state.guides = [];
    state.draggingIndex = nearestIndex;
    state.dragSnapshot = geometrySnapshot();
    canvas.setPointerCapture(event.pointerId);
    render();
    return;
  }
  const segmentHit = segmentAtPoint(point);
  if (segmentHit) {
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
    canvas.setPointerCapture(event.pointerId);
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
    state.draftPoint = snapDrawingPoint(pointerPosition(event), anchor);
    render();
    return;
  }
  if (state.draggingIndex < 0) return;
  const guidedPoint = applyGuides(pointerPosition(event), { excludeIndex: state.draggingIndex });
  state.points[state.draggingIndex] = snapPoint(guidedPoint);
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (state.drawingSegment && state.draftPoint) {
    const anchor = state.points[state.points.length - 1];
    if (distance(anchor, state.draftPoint) >= cmToPx(drawingStepCm()) / 2) {
      const beforeSnapshot = geometrySnapshot();
      state.points.push(state.draftPoint);
      pushUndo(beforeSnapshot);
    }
  }
  if (state.draggingIndex >= 0 && state.dragSnapshot) {
    pushUndo(state.dragSnapshot);
  }
  state.draggingIndex = -1;
  state.dragSnapshot = null;
  state.drawingSegment = false;
  state.draftPoint = null;
  state.guides = [];
  state.panning = false;
  state.lastPanPoint = null;
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
});

controls.snapModeBtn.addEventListener("click", () => {
  const expanded = controls.snapModeBtn.getAttribute("aria-expanded") === "true";
  controls.snapModeBtn.setAttribute("aria-expanded", String(!expanded));
  controls.snapModeMenu.hidden = expanded;
});

controls.snapModeMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-snap-mode]");
  if (!button) return;
  state.snapMode = button.dataset.snapMode;
  controls.snapModeBtn.setAttribute("aria-expanded", "false");
  controls.snapModeMenu.hidden = true;
  syncSnapModeMenu();
  render();
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".snap-menu")) return;
  controls.snapModeBtn.setAttribute("aria-expanded", "false");
  controls.snapModeMenu.hidden = true;
});

controls.closePolygonBtn.addEventListener("click", () => {
  if (state.points.length >= 3) {
    const beforeSnapshot = geometrySnapshot();
    state.closed = true;
    pushUndo(beforeSnapshot);
  }
  render();
});

controls.removeLastPointBtn.addEventListener("click", () => {
  const beforeSnapshot = geometrySnapshot();
  state.points.pop();
  if (state.points.length < 3) {
    state.closed = false;
  }
  pushUndo(beforeSnapshot);
  state.draggingIndex = -1;
  state.dragSnapshot = null;
  state.drawingSegment = false;
  state.draftPoint = null;
  state.guides = [];
  render();
});

controls.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(serializeAppState(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `tile-plan-${date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

controls.importBtn.addEventListener("click", () => {
  controls.importFile.click();
});

controls.importFile.addEventListener("change", async () => {
  const file = controls.importFile.files?.[0];
  if (!file) return;

  try {
    const importedState = JSON.parse(await file.text());
    const beforeSnapshot = geometrySnapshot();
    applyAppState(importedState);
    pushUndo(beforeSnapshot);
    render();
  } catch (error) {
    alert("Не удалось импортировать чертеж. Проверьте, что выбран корректный JSON-файл.");
  } finally {
    controls.importFile.value = "";
  }
});

controls.clearBtn.addEventListener("click", () => {
  const beforeSnapshot = geometrySnapshot();
  state.points = [];
  state.closed = false;
  pushUndo(beforeSnapshot);
  render();
});

controls.drawUnit.addEventListener("change", () => {
  const currentStepCm = Math.max(Number(controls.gridStep.value) || 1, 0.01) * unitToCm[state.previousDrawUnit];
  state.previousDrawUnit = drawUnit();
  const convertedStep = currentStepCm / unitToCm[state.previousDrawUnit];
  controls.gridStep.value = Number(convertedStep.toFixed(3));
  render();
});

Object.values(controls).forEach((control) => {
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
    control.addEventListener("input", render);
  }
});

restoreAppState();
syncSnapModeMenu();
new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
