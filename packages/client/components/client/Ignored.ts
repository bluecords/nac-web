import { Accessor, createSignal } from "solid-js";

/**
 * A member being "ignored" is a purely client-local preference, same as
 * `Favorites.ts` - unlike Block, NAC has no server-side relationship for it
 * (checked: no such concept anywhere in stoatchat's user/relationship model).
 * Ignoring someone only collapses their messages in the client that ignored
 * them; it is not visible to them or to anyone else, and does not need a
 * server round-trip.
 */
const STORAGE_KEY = "nac-ignored-users";

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    // See the identical catch in Favorites.ts: without this, a throw here
    // (blocked site data, quota, managed browser policy) would happen
    // before the signal update below it, so the menu item would look like
    // it did nothing at all.
    console.error("Failed to save ignored users to localStorage:", err);
  }
}

const [ignored, setIgnored] = createSignal<string[]>(load());

export function getIgnored(): Accessor<string[]> {
  return ignored;
}

export function addIgnored(userId: string) {
  if (ignored().includes(userId)) return;
  const next = [...ignored(), userId];
  save(next);
  setIgnored(next);
}

export function removeIgnored(userId: string) {
  const next = ignored().filter((id) => id !== userId);
  save(next);
  setIgnored(next);
}

export function isIgnored(userId: string): boolean {
  return ignored().includes(userId);
}

export function toggleIgnored(userId: string) {
  if (isIgnored(userId)) {
    removeIgnored(userId);
  } else {
    addIgnored(userId);
  }
}
