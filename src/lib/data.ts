/**
 * 정적 데이터 로딩(index / places / wx). 서버 없음: GitHub Pages 등에 올라간 JSON만 읽는다.
 * - index.json: 하루 캐시(localStorage)
 * - places/{sgg}.json: Cache Storage(오프라인), 메모리
 * - wx/{sgg}.json: 항상 네트워크 우선, 실패 시 마지막 성공값
 */
import type { DataIndex, Place, PlacesFile, SggInfo, WxSnapshot, MudflatFile } from "./types";
import { haversineKm } from "./geo";

export const DATA_BASE: string = (import.meta.env.VITE_DATA_BASE as string | undefined)?.replace(/\/$/, "") || "/data";

const LS_INDEX = "pw.index.v1";
const LS_WX = "pw.wx.v1.";
const CACHE_NAME = "pw-data-v1";

let indexMem: DataIndex | undefined;
const placesMem = new Map<string, Promise<PlacesFile>>();

async function cachedFetch(url: string, opts: { maxAgeMs?: number } = {}): Promise<Response> {
  if (typeof caches === "undefined") return fetch(url);
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url);
  if (hit) {
    const at = Number(hit.headers.get("x-cached-at") ?? 0);
    if (!opts.maxAgeMs || Date.now() - at < opts.maxAgeMs) return hit;
  }
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.set("x-cached-at", String(Date.now()));
    const copy = new Response(body, { status: 200, headers });
    await cache.put(url, copy.clone());
    return copy;
  } catch (e) {
    if (hit) return hit;
    throw e;
  }
}

export async function loadIndex(): Promise<DataIndex> {
  if (indexMem) return indexMem;
  try {
    const raw = localStorage.getItem(LS_INDEX);
    if (raw) {
      const { at, data } = JSON.parse(raw) as { at: number; data: DataIndex };
      if (Date.now() - at < 24 * 3600 * 1000) {
        indexMem = data;
        // 뒤에서 조용히 갱신
        void refreshIndex();
        return data;
      }
    }
  } catch {
    /* ignore */
  }
  return refreshIndex();
}

async function refreshIndex(): Promise<DataIndex> {
  const res = await cachedFetch(`${DATA_BASE}/index.json`, { maxAgeMs: 6 * 3600 * 1000 });
  const data = (await res.json()) as DataIndex;
  indexMem = data;
  try {
    localStorage.setItem(LS_INDEX, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
  return data;
}

export function nearestSgg(index: DataIndex, lat: number, lng: number): SggInfo {
  let best = index.sgg[0];
  let bd = Infinity;
  for (const s of index.sgg) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** 가까운 시군구 n개(경계 근처 보완용) */
export function nearestSggs(index: DataIndex, lat: number, lng: number, n = 3): SggInfo[] {
  return [...index.sgg]
    .map((s) => ({ s, d: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.s);
}

export function loadPlaces(code: string): Promise<PlacesFile> {
  let p = placesMem.get(code);
  if (!p) {
    p = cachedFetch(`${DATA_BASE}/places/${code}.json`, { maxAgeMs: 7 * 24 * 3600 * 1000 }).then((r) => r.json() as Promise<PlacesFile>);
    p.catch(() => placesMem.delete(code));
    placesMem.set(code, p);
  }
  return p;
}

export interface NearbyPlace {
  place: Place;
  km: number;
}

export async function nearbyPlaces(index: DataIndex, lat: number, lng: number, radiusKm = 3, sggCount = 3): Promise<NearbyPlace[]> {
  const sggs = nearestSggs(index, lat, lng, sggCount);
  const files = await Promise.all(sggs.map((s) => loadPlaces(s.code).catch(() => undefined)));
  const out: NearbyPlace[] = [];
  for (const f of files) {
    if (!f) continue;
    for (const place of f.places) {
      const km = haversineKm(lat, lng, place.lat, place.lng);
      if (km <= radiusKm) out.push({ place, km });
    }
  }
  return out.sort((a, b) => a.km - b.km);
}

export async function loadWx(code: string): Promise<WxSnapshot> {
  try {
    const res = await fetch(`${DATA_BASE}/wx/${code}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = (await res.json()) as WxSnapshot;
    try {
      localStorage.setItem(LS_WX + code, JSON.stringify(snap));
    } catch {
      /* ignore */
    }
    return snap;
  } catch (e) {
    const raw = localStorage.getItem(LS_WX + code);
    if (raw) return JSON.parse(raw) as WxSnapshot;
    throw e;
  }
}

export function lastWx(code: string): WxSnapshot | undefined {
  try {
    const raw = localStorage.getItem(LS_WX + code);
    return raw ? (JSON.parse(raw) as WxSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

/** "YYYY-MM-DDTHH:00" 로컬 시각 문자열(앱은 한국 시간 기기 가정) */
export function localIsoHour(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

export function fmtAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const m = Math.round(ms / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

let mudMem: Promise<MudflatFile | undefined> | undefined;
/** 갯벌·물때(data/mudflat.json). 없거나 비어 있으면 undefined → 갯벌 탭을 숨긴다 */
export function loadMudflat(): Promise<MudflatFile | undefined> {
  mudMem ??= cachedFetch(`${DATA_BASE}/mudflat.json`, { maxAgeMs: 3 * 3600 * 1000 })
    .then((r) => r.json() as Promise<MudflatFile>)
    .then((f) => (f && Array.isArray(f.spots) && f.spots.length ? f : undefined))
    .catch(() => undefined);
  return mudMem;
}
