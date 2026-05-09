import { describe, expect, it } from "vitest";
import {
  createInitialPlannerState,
  geometrySnapshot,
  pushUndo,
  redoGeometry,
  restoreGeometry,
  undoGeometry,
} from "./plannerState";

describe("planner state", () => {
  it("captures and restores geometry snapshots", () => {
    const state = createInitialPlannerState();
    const snapshot = geometrySnapshot(state);

    state.points = [];
    state.closed = false;
    restoreGeometry(state, snapshot);

    expect(state.points).toEqual(snapshot.points);
    expect(state.closed).toBe(true);
    expect(state.draggingIndex).toBe(-1);
  });

  it("tracks undo and redo geometry changes", () => {
    const state = createInitialPlannerState();
    const before = geometrySnapshot(state);

    state.points.push({ x: 900, y: 900 });
    pushUndo(state, before);

    expect(state.undoStack).toHaveLength(1);
    expect(undoGeometry(state)).toBe(true);
    expect(state.points).toHaveLength(before.points.length);
    expect(redoGeometry(state)).toBe(true);
    expect(state.points).toHaveLength(before.points.length + 1);
  });

  it("reports false when undo and redo history is empty", () => {
    const state = createInitialPlannerState();

    expect(undoGeometry(state)).toBe(false);
    expect(redoGeometry(state)).toBe(false);
    expect(state.points).toHaveLength(4);
  });

  it("clears redo history after a new undo snapshot", () => {
    const state = createInitialPlannerState();
    const before = geometrySnapshot(state);

    state.points.push({ x: 900, y: 900 });
    pushUndo(state, before);
    undoGeometry(state);

    expect(state.redoStack).toHaveLength(1);
    const nextBefore = geometrySnapshot(state);
    state.points.push({ x: 1000, y: 1000 });
    pushUndo(state, nextBefore);
    expect(state.redoStack).toHaveLength(0);
  });
});
