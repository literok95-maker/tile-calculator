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
});
