/**
 * 주소 → 좌표 지오코딩(놀이터 목록은 좌표가 없다).
 * 1순위 브이월드(VWORLD_KEY), 2순위 카카오 로컬(KAKAO_REST_KEY). 키가 없으면 건너뛴다.
 * 결과 캐시: pipeline/.cache/geocode.json  { [정규화주소]: {lat,lng,src} | null }
 * 사용: tsx pipeline/geocode.ts [--limit N]
 */
import fs from "node:fs";
import path from "node:path";
import { addrForGeocode } from "./sgg";

const CACHE_FILE = path.resolve("pipeline/.cache/geocode.json");
const UA = "PlaygroundWeather-pipeline/0.1";

export type GeoHit = { lat: number; lng: number; src: "vworld" | "kakao" };
type GeoCache = Record<string, GeoHit | null>;

export function loadGeoCache(): GeoCache {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as GeoCache;
}
function saveGeoCache(c: GeoCache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

function inKorea(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

async function vworld(addr: string, key: string): Promise<GeoHit | null> {
  for (const type of ["road", "parcel"]) {
    const url =
      `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326` +
      `&refine=true&simple=false&format=json&type=${type}&key=${key}&address=${encodeURIComponent(addr)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`vworld HTTP ${res.status}`);
    const j = (await res.json()) as { response: { status: string; result?: { point: { x: string; y: string } } } };
    if (j.response.status === "OK" && j.response.result) {
      const lat = Number(j.response.result.point.y);
      const lng = Number(j.response.result.point.x);
      if (inKorea(lat, lng)) return { lat, lng, src: "vworld" };
    }
  }
  return null;
}

async function kakao(addr: string, key: string): Promise<GeoHit | null> {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}`, "User-Agent": UA } });
  if (res.status === 429) throw new Error("kakao rate limited");
  if (!res.ok) throw new Error(`kakao HTTP ${res.status}`);
  const j = (await res.json()) as { documents: { x: string; y: string }[] };
  const d = j.documents[0];
  if (!d) return null;
  const lat = Number(d.y);
  const lng = Number(d.x);
  return inKorea(lat, lng) ? { lat, lng, src: "kakao" } : null;
}

export interface GeocodeOptions {
  limit?: number;
  concurrency?: number;
}

/** 주소 목록을 지오코딩해 캐시를 채운다. 반환: 새로 처리한 건수 */
export async function geocodeAddresses(addrs: string[], opts: GeocodeOptions = {}): Promise<number> {
  const vk = process.env.VWORLD_KEY;
  const kk = process.env.KAKAO_REST_KEY;
  if (!vk && !kk) {
    console.log("[geocode] VWORLD_KEY/KAKAO_REST_KEY 없음 → 건너뜀");
    return 0;
  }
  const cache = loadGeoCache();
  const todo = [...new Set(addrs.map(addrForGeocode).filter((a) => a && !(a in cache)))];
  const limit = opts.limit ?? Number(process.env.GEOCODE_LIMIT ?? 30000);
  const queue = todo.slice(0, limit);
  console.log(`[geocode] cached=${Object.keys(cache).length} todo=${todo.length} run=${queue.length}`);
  let i = 0;
  let done = 0;
  let fail = 0;
  const t0 = Date.now();
  async function worker() {
    while (i < queue.length) {
      const a = queue[i++];
      try {
        let hit: GeoHit | null = null;
        if (vk) hit = await vworld(a, vk);
        if (!hit && kk) hit = await kakao(a, kk);
        cache[a] = hit;
        if (!hit) fail++;
      } catch (e) {
        console.warn(`[geocode] ${a}: ${(e as Error).message}`);
        // 키 소진/차단이면 중단
        if (/429|rate|403/.test(String(e))) {
          i = queue.length;
        }
        break;
      }
      done++;
      if (done % 500 === 0) {
        saveGeoCache(cache);
        console.log(`[geocode] ${done}/${queue.length} (${fail} miss) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker));
  saveGeoCache(cache);
  console.log(`[geocode] done ${done}, miss ${fail}, cache=${Object.keys(cache).length}`);
  return done;
}

export function lookupGeo(cache: GeoCache, rawAddr: string): GeoHit | null | undefined {
  return cache[addrForGeocode(rawAddr)];
}

const isMain = process.argv[1] && /geocode\.ts$/.test(process.argv[1]);
if (isMain) {
  (async () => {
    const listFile = path.resolve("pipeline/.cache/cpf/list.jsonl");
    if (!fs.existsSync(listFile)) throw new Error("먼저 npm run pipeline:crawl 을 실행하세요");
    const addrs = fs
      .readFileSync(listFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { addr: string }).addr);
    const li = process.argv.indexOf("--limit");
    await geocodeAddresses(addrs, { limit: li > 0 ? Number(process.argv[li + 1]) : undefined });
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
