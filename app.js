const canvas = document.querySelector("#planner");
const ctx = canvas.getContext("2d");

const controls = {
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
  scale: 1,
};

const basePixelsPerCm = 2;
const snapCm = 10;
const origin = { x: 64, y: 64 };

function pxPerCm() {
  return basePixelsPerCm * Number(controls.scale.value);
}

function cmToPx(value) {
  return value * pxPerCm();
}

function pxToCm(value) {
  return value / pxPerCm();
}

function snapPoint(point) {
  const snapPx = cmToPx(snapCm);
  return {
    x: Math.round(point.x / snapPx) * snapPx,
    y: Math.round(point.y / snapPx) * snapPx,
  };
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
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

function calculateTiles() {
  if (!state.closed || state.points.length < 3) {
    return { tiles: [], cut: 0 };
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
        const center = {
          x: tile.reduce((sum, point) => sum + point.x, 0) / 4,
          y: tile.reduce((sum, point) => sum + point.y, 0) / 4,
        };
        const full = pointInPolygon(center, state.points) && tile.every((point) => pointInPolygon(point, state.points));
        if (!full) cut += 1;
        tiles.push({ points: tile, full });
      }
    }
    row += 1;
  }

  return { tiles, cut };
}

function drawGrid() {
  const minor = cmToPx(10);
  const major = cmToPx(50);
  ctx.lineWidth = 1;
  for (let x = origin.x % minor; x < canvas.width; x += minor) {
    ctx.strokeStyle = Math.abs((x - origin.x) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = origin.y % minor; y < canvas.height; y += minor) {
    ctx.strokeStyle = Math.abs((y - origin.y) % major) < 0.01 ? "#d6cfc4" : "#ebe5dc";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
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
}

function updateStats(tileResult) {
  const areaM2 = polygonArea(state.points) / (pxPerCm() ** 2) / 10000;
  const raw = tileResult.tiles.length;
  const waste = Number(controls.waste.value) / 100;
  controls.area.textContent = state.closed ? areaM2.toFixed(2) : "0";
  controls.tilesRaw.textContent = state.closed ? String(raw) : "0";
  controls.tilesWithWaste.textContent = state.closed ? String(Math.ceil(raw * (1 + waste))) : "0";
  controls.cutTiles.textContent = state.closed ? String(tileResult.cut) : "0";
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  const tileResult = calculateTiles();
  drawTiles(tileResult.tiles);
  drawPolygon();
  updateStats(tileResult);
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
    state.points.push(snapPoint(point));
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

Object.values(controls).forEach((control) => {
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
    control.addEventListener("input", render);
  }
});

render();
