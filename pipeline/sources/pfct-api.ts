/**
 * 행정안전부_전국어린이놀이시설정보서비스 (data.go.kr 15124519, 이용허락 제한 없음, 자동승인, 개발계정 10,000/일)
 *   https://apis.data.go.kr/1741000/pfc3/getPfctInfo3?serviceKey=…&pageNo=1&numOfRows=1000&type=json
 * 전체 페이지를 받아 pipeline/.cache/pfct/items.json 에 저장한다(원본 필드 그대로).
 * 좌표 필드명·좌표계는 첫 호출에서 자동 감지(WGS84 / Web Mercator 3857)하고, 그 외 좌표계는 로그로 알린다.
 *
 * 사용: node --env-file-if-exists=.env node_modules/tsx/dist/cli.mjs pipeline/sources/pfct-api.ts [--probe]
 */
import fs from "node:fs";
import path from "node:path";

const CACHE = path.resolve("pipeline/.cache/pfct");
const BASE = "https://apis.data.go.kr/1741000/pfc3/getPfctInfo3";
const KEY = process.env.DATA_GO_KR_KEY;
const PAGE = Number(process.env.PFCT_PAGE_SIZE ?? 1000);

export type RawItem = Record<string, string | number | null>;

export interface PfctCoord {
  lat: number;
  lng: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(pageNo: number, numOfRows: number): Promise<{ items: RawItem[]; total: number }> {
  // 이 API는 pageIndex / recordCountPerPage 를 쓴다(응답 body 에 같은 이름으로 메아리). 표준 이름도 함께 보낸다.
  const url =
    `${BASE}?serviceKey=${encodeURIComponent(KEY!)}&type=json` +
    `&pageIndex=${pageNo}&recordCountPerPage=${numOfRows}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.startsWith("<") || text.includes("OpenAPI_ServiceResponse")) {
      const msg = text.match(/<returnAuthMsg>([^<]+)|"returnAuthMsg":\s*"([^"]+)/);
      throw new Error(`gateway: ${msg?.[1] ?? msg?.[2] ?? text.slice(0, 120)}`);
    }
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      return extract(j);
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1000 * i);
    }
  }
  throw new Error("unreachable");
}

/** 응답 구조가 기관마다 달라(response.body.items.item / PfctInfo[1].row 등) 가장 깊은 배열을 찾는다 */
function extract(j: Record<string, unknown>): { items: RawItem[]; total: number } {
  let total = 0;
  let items: RawItem[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) {
      if (o.length && typeof o[0] === "object" && o[0] && !Array.isArray(o[0]) && Object.keys(o[0] as object).length > 3) {
        if (o.length > items.length) items = o as RawItem[];
      }
      for (const x of o) walk(x);
    } else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (/^(totalCount|list_total_count|total|totalCnt)$/i.test(k) && Number.isFinite(Number(v))) total = Number(v);
        walk(v);
      }
    }
  };
  walk(j);
  return { items, total };
}

/** 좌표 필드 추정: 값 범위로 좌표계를 판별 */
export function detectCoord(item: RawItem): { xKey: string; yKey: string; crs: "wgs84" | "mercator" | "unknown" } | undefined {
  const keys = Object.keys(item);
  const num = (k: string) => Number(item[k]);
  const cand = keys.filter((k) => Number.isFinite(num(k)) && Math.abs(num(k)) > 10);
  // 명시적 이름 우선
  const latKey = keys.find((k) => /^(lat|latitude|la|y_?crd|ycrd|y)$/i.test(k) || /위도/.test(k));
  const lngKey = keys.find((k) => /^(lng|lon|longitude|lo|x_?crd|xcrd|x)$/i.test(k) || /경도/.test(k));
  const pairs: [string, string][] = [];
  if (latKey && lngKey) pairs.push([lngKey, latKey]);
  for (const a of cand) for (const b of cand) if (a !== b) pairs.push([a, b]);
  for (const [xk, yk] of pairs) {
    const x = num(xk);
    const y = num(yk);
    if (x >= 124 && x <= 132 && y >= 33 && y <= 39) return { xKey: xk, yKey: yk, crs: "wgs84" };
    if (x >= 1.38e7 && x <= 1.47e7 && y >= 3.9e6 && y <= 4.75e6) return { xKey: xk, yKey: yk, crs: "mercator" };
  }
  if (latKey && lngKey) return { xKey: lngKey, yKey: latKey, crs: "unknown" };
  return undefined;
}

export function mercatorToWgs84(x: number, y: number): PfctCoord {
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
}

export function toCoord(item: RawItem, det: NonNullable<ReturnType<typeof detectCoord>>): PfctCoord | undefined {
  const x = Number(item[det.xKey]);
  const y = Number(item[det.yKey]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (det.crs === "wgs84") return { lat: y, lng: x };
  if (det.crs === "mercator") return mercatorToWgs84(x, y);
  return undefined;
}

export async function fetchAllPfct(opts: { maxAgeHours?: number } = {}): Promise<RawItem[]> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, "items.json");
  const maxAge = (opts.maxAgeHours ?? 20) * 3600 * 1000;
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < maxAge) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as RawItem[];
  }
  if (!KEY) throw new Error("DATA_GO_KR_KEY 없음");
  const first = await fetchPage(1, PAGE);
  const total = first.total || first.items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  console.log(`[pfct] total=${total} pages=${pages} fields=${Object.keys(first.items[0] ?? {}).join(",")}`);
  const all = [...first.items];
  for (let p = 2; p <= pages; p++) {
    const r = await fetchPage(p, PAGE);
    all.push(...r.items);
    if (p % 10 === 0) console.log(`[pfct] page ${p}/${pages} (${all.length})`);
    await sleep(80);
  }
  fs.writeFileSync(file, JSON.stringify(all));
  console.log(`[pfct] cached ${all.length} items`);
  return all;
}

const isMain = process.argv[1] && /pfct-api\.ts$/.test(process.argv[1]);
if (isMain) {
  (async () => {
    if (process.argv.includes("--probe")) {
      const r = await fetchPage(1, 3);
      console.log(JSON.stringify(r, null, 1).slice(0, 3000));
      const det = r.items[0] && detectCoord(r.items[0]);
      console.log("coord detect:", det, det && toCoord(r.items[0], det));
      return;
    }
    const items = await fetchAllPfct({ maxAgeHours: 0 });
    const det = items[0] && detectCoord(items[0]);
    console.log("coord detect:", det);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
