/** 기기 로컬 설정(서버 없음). Capacitor Preferences → 웹에서는 localStorage. */
import { Preferences } from "@capacitor/preferences";
import type { ChildProfile, Place } from "./types";

export interface FavPlace {
  id: string;
  name: string;
  kind: Place["kind"];
  lat: number;
  lng: number;
  addr: string;
  sgg: string;
  addedAt: string;
}

export interface Settings {
  child: ChildProfile;
  /** 집(기본) 시군구 코드 */
  homeSgg?: string;
  homeName?: string;
  notify: { enabled: boolean; hour: number; minute: number };
  /** 전날 저녁 "내일 언제 나갈까" 알림 */
  evening: { enabled: boolean; hour: number; minute: number };
  favorites: FavPlace[];
  /** 마지막 위치 */
  last?: { lat: number; lng: number; at: string };
  /** 상세 열람 횟수(전면광고 빈도 계산) */
  detailViews: number;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  child: { age: "toddler", sensitive: false },
  notify: { enabled: false, hour: 7, minute: 30 },
  evening: { enabled: false, hour: 20, minute: 0 },
  favorites: [],
  detailViews: 0,
  onboarded: false,
};

const KEY = "pw.settings.v1";
let cache: Settings | undefined;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  const { value } = await Preferences.get({ key: KEY });
  cache = value ? { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  return cache;
}

export function getSettings(): Settings {
  return cache ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): Promise<Settings> {
  const cur = await loadSettings();
  const p = typeof patch === "function" ? patch(cur) : patch;
  cache = { ...cur, ...p };
  await Preferences.set({ key: KEY, value: JSON.stringify(cache) });
  for (const l of listeners) l(cache);
  return cache;
}

export function subscribe(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isFav(s: Settings, id: string): boolean {
  return s.favorites.some((f) => f.id === id);
}

export async function toggleFav(place: Place): Promise<boolean> {
  const s = await loadSettings();
  const exists = isFav(s, place.id);
  await updateSettings({
    favorites: exists
      ? s.favorites.filter((f) => f.id !== place.id)
      : [
          ...s.favorites,
          { id: place.id, name: place.name, kind: place.kind, lat: place.lat, lng: place.lng, addr: place.addr, sgg: place.sgg, addedAt: new Date().toISOString() },
        ].slice(-200),
  });
  return !exists;
}
