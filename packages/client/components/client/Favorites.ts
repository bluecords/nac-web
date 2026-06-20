import { Accessor, createSignal } from "solid-js";

export interface Favorite {
  userId: string;
  username: string;
  avatarURL: string | null;
  discriminator?: string;
}

const STORAGE_KEY = "nac-mobile-favorites";

function load(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(favs: Favorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  } catch (err) {
    // localStorage can throw (blocked site data, quota exceeded, managed
    // browser policy, etc). Without this catch, the throw happened before
    // the reactive signal update below it in addFavorite/removeFavorite,
    // so the star never even changed color — looked like the click did
    // nothing at all. Still update the in-memory signal so favoriting at
    // least works for the current session even if it can't persist.
    console.error("Failed to save favorites to localStorage:", err);
  }
}

const [favorites, setFavorites] = createSignal<Favorite[]>(load());

export function getFavorites(): Accessor<Favorite[]> {
  return favorites;
}

export function addFavorite(fav: Favorite) {
  if (favorites().some((f) => f.userId === fav.userId)) return;
  const next = [...favorites(), fav];
  save(next);
  setFavorites(next);
}

export function removeFavorite(userId: string) {
  const next = favorites().filter((f) => f.userId !== userId);
  save(next);
  setFavorites(next);
}

export function isFavorite(userId: string): boolean {
  return favorites().some((f) => f.userId === userId);
}

export function toggleFavorite(fav: Favorite) {
  if (isFavorite(fav.userId)) {
    removeFavorite(fav.userId);
  } else {
    addFavorite(fav);
  }
}
