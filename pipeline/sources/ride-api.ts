/**
 * 행정안전부_전국어린이놀이시설기구정보서비스 (data.go.kr 15124521)
 *   https://apis.data.go.kr/1741000/ride4/getRide4?serviceKey=…&type=json&pageIndex=N&recordCountPerPage=1000
 * 43만 건(기구 1건 = 1행, pfctSn 으로 시설 연결). 시설별 기구 유형 목록으로 묶어 캐시한다.
 * 결과: pipeline/.cache/pfct/rides.json  { [pfctSn]: ["조합놀이대","그네",…] }
 */
import fs from "node:fs";
import path from "node:path";

const CACHE = path.resolve("pipeline/.cache/pfct");
const BASE = "https://apis.data.go.kr/1741000/ride4/getRide4";
const KEY = process.env.DATA_GO_KR_KEY;
const PAGE = 1000;

interface RideRow {
  pfctSn: string;
  rideStylCdNm?: string | null;
  rideNm?: string | null;
  dscdYmd?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(pageIndex: number): Promise<{ rows: RideRow[]; total: number }> {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY!)}&type=json&pageIndex=${pageIndex}&recordCountPerPage=${PAGE}`;
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (text.includes("OpenAPI_ServiceResponse") || text.startsWith("<")) {
      throw new Error(`gateway: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    }
    try {
      const j = JSON.parse(text) as { response: { body: { totalCnt: number; items: RideRow[] } } };
      return { rows: j.response.body.items ?? [], total: Number(j.response.body.totalCnt) };
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1000 * i);
    }
  }
  throw new Error("unreachable");
}

export async function fetchRides(opts: { maxAgeHours?: number } = {}): Promise<Record<string, string[]>> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, "rides.json");
  const maxAge = (opts.maxAgeHours ?? 24 * 6) * 3600 * 1000;
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < maxAge) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string[]>;
  }
  if (!KEY) throw new Error("DATA_GO_KR_KEY 없음");
  const first = await page(1);
  const pages = Math.ceil(first.total / PAGE);
  console.log(`[rides] total=${first.total} pages=${pages}`);
  const map = new Map<string, Set<string>>();
  const add = (rows: RideRow[]) => {
    for (const r of rows) {
      if (r.dscdYmd && /\d/.test(r.dscdYmd)) continue; // 폐기된 기구
      const name = (r.rideStylCdNm || r.rideNm || "").trim();
      if (!name || !r.pfctSn) continue;
      const s = map.get(String(r.pfctSn)) ?? new Set<string>();
      s.add(name);
      map.set(String(r.pfctSn), s);
    }
  };
  add(first.rows);
  for (let p = 2; p <= pages; p++) {
    add((await page(p)).rows);
    if (p % 50 === 0) console.log(`[rides] page ${p}/${pages} (${map.size} facilities)`);
    await sleep(60);
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of map) out[k] = [...v].slice(0, 12);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`[rides] cached ${map.size} facilities`);
  return out;
}

const isMain = process.argv[1] && /ride-api\.ts$/.test(process.argv[1]);
if (isMain) {
  fetchRides({ maxAgeHours: 0 }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
