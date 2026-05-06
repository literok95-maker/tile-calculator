const canvas = document.querySelector("#planner");
const ctx = canvas.getContext("2d");

const controls = {
  drawUnit: document.querySelector("#drawUnit"),
  gridStep: document.querySelector("#gridStep"),
  angleSnap: document.querySelector("#angleSnap"),
  tileWidth: document.querySelector("#tileWidth"),
  tileHeight: document.querySelector("#tileHeight"),
  grout: document.querySelector("#grout"),
  waste: document.querySelector("#waste"),
  layout: document.querySelector("#layout"),
  rotation: document.querySelector("#rotation"),
  scale: document.querySelector("#scale"),
  area: document.querySelector("#area"),
  tilesRaw: document.querySelector("#tilesRaw"),
  tilesWithWaste: document.querySelector("#tilesWithWaste"),
  cutTiles: document.querySelector("#cutTiles"),
  closePolygonBtn: document.querySelector("#closePolygonBtn"),
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
  previousDrawUnit: "cm",
  viewportWidth: 1120,
  viewportHeight: 760,
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
const snapAngles = [0, 90];

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
  while (cmToPx(stepCm) < 8) {
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
  const snapPx = cmToPx(drawingStepCm());
  return {
    x: Math.round(point.x / snapPx) * snapPx,
    y: Math.round(point.y / snapPx) * snapPx,
  };
}

function snapAnglePoint(anchor, rawPoint) {
  if (!controls.angleSnap.checked) return rawPoint;
  const dx = rawPoint.x - anchor.x;
  const dy = rawPoint.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return rawPoint;

  const rawDegrees = Math.atan2(dy, dx) * (180 / Math.PI);
  const normalized = ((rawDegrees % 360) + 360) % 360;
  const quadrant = Math.floor(normalized / 90);
  const local = normalized - quadrant * 90;
  const nearestLocal = snapAngles.reduce((best, angle) => (
    Math.abs(angle - local) < Math.abs(best - local) ? angle : best
  ), snapAngles[0]);
  const snappedDegrees = quadrant * 90 + nearestLocal;
  const radians = snappedDegrees * (Math.PI / 180);
  return {
    x: anchor.x + Math.cos(radians) * length,
    y: anchor.y + Math.sin(radians) * length,
  };
}

function snapDrawingPoint(point, anchor = null) {
  if (!anchor) return snapPoint(point);
  if (!controls.angleSnap.checked) return snapPoint(point);
  const angleSnapped = snapAnglePoint(anchor, point);
  const length = distance(anchor, angleSnapped);
  const stepPx = cmToPx(drawingStepCm());
  const snappedLength = Math.max(Math.round(length / stepPx) * stepPx, stepPx);
  const angle = Math.atan2(angleSnapped.y - anchor.y, angleSnapped.x - anchor.x);
  return {
    x: anchor.x + Math.cos(angle) * snappedLength,
    y: anchor.y + Math.sin(angle) * snappedLength,
  };
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

      bin.fragmentCount += 1;
      bin.remaining -= tile.coverage;
      tile.sourceNumber = bin.sourceNumber;
      tile.fragmentNumber = bin.fragmentCount;
      tile.label = `${bin.sourceNumber}.${bin.fragmentNumber}`;
    });

  return nextSourceNumber - 1;
}

function calculateTiles() {
  if (!state.closed || state.points.length < 3) {
    return { tiles: [], cut: 0, materialTiles: 0 };
  }

  const tileWidth = cmToPx(Number(controls.tileWidth.value) + Number(controls.grout.value) / 10);
  const tileHeight = cmToPx(Number(controls.tileHeight.value) + Number(controls.grout.value) / 10);
  const layout = controls.layout.value;
  const baseRotation = Number(controls.rotation.value) * (Math.PI / 180);
  const angle = baseRotation + (layout === "diagonal" ? Math.PI / 4 : 0);
  const bounds = boundsFor(state.points);
  const padding = Math.max(tileWidth, tileHeight) * 3;
  const tiles = [];
  let cut = 0;

  const startX = Math.floor((bounds.minX - padding) / tileWidth) * tileWidth;
  const endX = bounds.maxX + padding;
  const startY = Math.floor((bounds.minY - padding) / tileHeight) * tileHeight;
  const endY = bounds.maxY + padding;

  let row = 0;
  for (let y = startY; y <= endY; y += tileHeight) {
    const rowOffset = layout === "brick" && row % 2 === 1 ? tileWidth / 2 : 0;
    for (let x = startX; x <= endX; x += tileWidth) {
      const tile = tilePolygon(x, y, tileWidth, tileHeight, angle, rowOffset);
      if (tileIntersectsPolygon(tile, state.points)) {
        const coverageResult = tileCoverage(tile, state.points);
        const coverage = coverageResult.ratio;
        if (coverage === 0) continue;
        const full = coverage >= 0.98;
        if (!full) cut += 1;
        tiles.push({ points: tile, full, coverage, labelPoint: coverageResult.labelPoint });
      }
    }
    row += 1;
  }

  const materialTiles = assignTileNumbers(tiles);
  return { tiles, cut, materialTiles };
}

function drawGrid() {
  const visibleStepCm = visibleGridStepCm();
  const minor = cmToPx(visibleStepCm);
  const major = minor * 5;
  ctx.lineWidth = 1;
  for (let x = origin.x % minor; x < state.viewportWidth; x += minor) {
    ctx.strokeStyle = Math.abs((x - origin.x) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.viewportHeight);
    ctx.stroke();
  }
  for (let y = origin.y % minor; y < state.viewportHeight; y += minor) {
    ctx.strokeStyle = Math.abs((y - origin.y) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.viewportWidth, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#8a8177";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(`Видимая сетка: ${formatDrawingLength(visibleStepCm)}`, 14, state.viewportHeight - 18);
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
  drawSegmentLabels();
}

function drawTiles(tiles) {
  if (!state.closed) return;
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
    ctx.fillStyle = tile.full ? "rgba(77, 132, 184, 0.22)" : "rgba(200, 95, 53, 0.24)";
    ctx.strokeStyle = tile.full ? "rgba(39, 97, 147, 0.65)" : "rgba(166, 73, 36, 0.75)";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  tiles.forEach((tile) => {
    if (!tile.label) return;
    const center = tile.labelPoint || tileCenter(tile);
    const label = tile.label;
    ctx.font = tile.full ? "700 13px Inter, system-ui, sans-serif" : "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.max(ctx.measureText(label).width + 10, tile.full ? 24 : 30);
    const height = 20;

    ctx.fillStyle = tile.full ? "rgba(255, 253, 250, 0.92)" : "rgba(255, 244, 236, 0.95)";
    ctx.strokeStyle = tile.full ? "rgba(39, 97, 147, 0.65)" : "rgba(166, 73, 36, 0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundedRectPath(center.x - width / 2, center.y - height / 2, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tile.full ? "#214f78" : "#9d4525";
    ctx.fillText(label, center.x, center.y + 0.5);
  });

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
  ctx.clearRect(0, 0, state.viewportWidth, state.viewportHeight);
  drawGrid();
  const tileResult = calculateTiles();
  drawTiles(tileResult.tiles);
  drawPolygon();
  updateStats(tileResult);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(Math.round(rect.width), 1);
  const height = Math.max(Math.round(rect.height), 1);
  state.viewportWidth = width;
  state.viewportHeight = height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

canvas.addEventListener("pointerdown", (event) => {
  const point = pointerPosition(event);
  const nearestIndex = state.points.findIndex((existing) => distance(existing, point) < 12);
  if (nearestIndex >= 0) {
    state.draggingIndex = nearestIndex;
    canvas.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (!state.closed) {
    const anchor = state.points[state.points.length - 1] || null;
    state.points.push(snapDrawingPoint(point, anchor));
    render();
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (state.draggingIndex < 0) return;
  state.points[state.draggingIndex] = snapPoint(pointerPosition(event));
  render();
});

canvas.addEventListener("pointerup", (event) => {
  state.draggingIndex = -1;
  canvas.releasePointerCapture(event.pointerId);
  render();
});

controls.closePolygonBtn.addEventListener("click", () => {
  if (state.points.length >= 3) state.closed = true;
  render();
});

controls.clearBtn.addEventListener("click", () => {
  state.points = [];
  state.closed = false;
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

new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
