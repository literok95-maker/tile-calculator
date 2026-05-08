export interface PlannerEventHandlers {
  pointerDown(event: PointerEvent): void;
  pointerMove(event: PointerEvent): void;
  pointerUp(event: PointerEvent): void;
  wheel(event: WheelEvent): void;
  auxClick(event: MouseEvent): void;
  keyDown(event: KeyboardEvent): void;
}

export function bindPlannerEvents(canvas: HTMLCanvasElement, handlers: PlannerEventHandlers): () => void {
  canvas.addEventListener("pointerdown", handlers.pointerDown);
  canvas.addEventListener("pointermove", handlers.pointerMove);
  canvas.addEventListener("pointerup", handlers.pointerUp);
  canvas.addEventListener("wheel", handlers.wheel, { passive: false });
  canvas.addEventListener("auxclick", handlers.auxClick);
  window.addEventListener("keydown", handlers.keyDown);

  return () => {
    canvas.removeEventListener("pointerdown", handlers.pointerDown);
    canvas.removeEventListener("pointermove", handlers.pointerMove);
    canvas.removeEventListener("pointerup", handlers.pointerUp);
    canvas.removeEventListener("wheel", handlers.wheel);
    canvas.removeEventListener("auxclick", handlers.auxClick);
    window.removeEventListener("keydown", handlers.keyDown);
  };
}
