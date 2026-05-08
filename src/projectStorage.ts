import { assertSavedProject, type SavedProject, STORAGE_KEY } from "./projectState";

export function saveProjectToStorage(project: SavedProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadProjectFromStorage(): SavedProject | null {
  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) return null;

  const savedState: unknown = JSON.parse(rawState);
  assertSavedProject(savedState);
  return savedState;
}

export function clearStoredProject(): void {
  localStorage.removeItem(STORAGE_KEY);
}
