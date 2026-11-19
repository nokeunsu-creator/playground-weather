/**
 * 장소 데이터 빌드: 공원·화장실(표준데이터) + 놀이터(cpf 목록 + 지오코딩) → 시군구별 JSON.
 * 출력(기본 public/data, --out 으로 변경):
 *   places/{sgg}.json  PlacesFile
 *   index.json         DataIndex (시군구 목록·중심좌표·격자·건수)
 *   meta.json          빌드 정보
 */
import fs from "node:fs";
import path from "node:path";
import type { DataIndex, Place, PlaceKind, PlacesFile, SggInfo } from "../src/lib/types";
import { toGrid } from "../src/lib/kma-grid";
import { fetchStandard } from "./sources/standard-data";
import type { CpfRow } from "./sources/cpf-crawl";
import { fetchAllPfct, type RawItem } from "./sources/pfct-api";
import { fetchRides } from "./sources/ride-api";
import { fetchBusanNursing } from "./sources/nursing";
import { loadGeoCache, lookupGeo } from "./geocode";
import { matchSgg, matchSido, normalizeAddr, SGG_BY_CODE, sidoOfSgg } from "./sgg";
import { haversineKm } from "../src/lib/geo";

/**
 * 주소로 시군구를 못 찾았지만 좌표는 있는 경우(2026년 인천 중구→제물포구·영종구 같은 개편 전 주소):
 * 같은 시도 안에서 가장 가까운 시군구 중심으로 배정한다. 중심은 1차 매칭된 장소들로 계산.
 */
function makeFallback(places: Place[]): (addr: string, lat: number, lng: number) => string | undefined {
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const p of places) {
    const a = acc.get(p.sgg) ?? { lat: 0, lng: 0, n: 0 };
    a.lat += p.lat;
    a.lng += p.lng;
    a.n++;
    acc.set(p.sgg, a);
  }
  const centers = [...acc.entries()].map(([code, a]) => ({ code, lat: a.lat / a.n, lng: a.lng / a.n }));
  return (addr, lat, lng) => {
    const sido = matchSido(addr);
    const cands = sido ? centers.filter((c) => c.code.startsWith(sido.code)) : centers;
    let best: string | undefined;
    let bd = 40; // km 이상 떨어지면 포기
    for (const c of cands) {
      const d = haversineKm(lat, lng, c.lat, c.lng);
      if (d < bd) {
        bd = d;
        best = c.code;
      }
    }
    return best;
  };
}

const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return path.resolve(i > 0 ? process.argv[i + 1] : "public/data");
})();

function num(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function inKorea(lat?: number, lng?: number): lat is number {
  return lat != null && lng != null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}
function splitList(s?: string): string[] {
  if (!s) return [];
  return s
    .split(/[+,·、/]|\s{2,}/)
    .map((x) => x.trim())
    .filter((x) => x && x !== "-" && x !== "없음");
}
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
function ymd(s?: string): string | undefined {
  const m = s?.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}

/** 실내로 보는 설치장소(행안부 분류명 기준) */
const INDOOR_SITES = ["목욕장업소", "식품접객업소", "대규모점포", "실내", "키즈카페", "의료기관", "숙박", "휴게소", "놀이제공영업소", "박물관", "육아종합지원센터", "도서관", "백화점", "쇼핑"];

async function main() {
  const t0 = Date.now();
  const parks = await fetchStandard("parks");
  const toilets = await fetchStandard("toilets");
  const geo = loadGeoCache();

  const places: Place[] = [];
  /** 주소 매칭 실패했지만 좌표가 있어 2차 배정할 장소(sgg 비움) */
  const pending: Place[] = [];
  const sources: Record<string, string> = {};
  let noSgg = 0;

  // ---- 공원 ----
  let refDate = "";
  for (const r of parks.rows) {
    const lat = num(r.LATITUDE);
    const lng = num(r.LONGITUDE);
    if (!inKorea(lat, lng)) continue;
    const addr = normalizeAddr(r.RDNMADR || r.LNMADR || "");
    const sgg = matchSgg(addr)?.code ?? (SGG_BY_CODE.has(r.MANAGE_NO?.slice(0, 5)) ? r.MANAGE_NO.slice(0, 5) : "");
    const fac = [...splitList(r.AMSMT_FCLTY), ...splitList(r.MVM_FCLTY), ...splitList(r.CNVNNC_FCLTY)];
    (sgg ? places : pending).push({
      id: `pk:${r.MANAGE_NO || fnv(r.PARK_NM + addr)}`,
      kind: "park",
      name: r.PARK_NM?.trim() || "공원",
      lat,
      lng: lng as number,
      addr,
      sgg,
      parkType: r.PARK_SE || undefined,
      facilities: fac.length ? fac.slice(0, 12) : undefined,
      area: num(r.PARK_AR),
      tel: r.PHONE_NUMBER || undefined,
    });
    if (r.REFERENCE_DATE > refDate) refDate = r.REFERENCE_DATE;
  }
  sources.parks = `전국도시공원정보표준데이터 ${parks.totalCount}건, 기준일 ${refDate}`;

  // ---- 화장실 ----
  refDate = "";
  for (const r of toilets.rows) {
    const lat = num(r.LATITUDE);
    const lng = num(r.LONGITUDE);
    if (!inKorea(lat, lng)) continue;
    const addr = normalizeAddr(r.RDNMADR || r.LNMADR || "");
    const sgg = matchSgg(addr)?.code ?? "";
    const kidsBowls = (num(r.MEN_CHILDREN_TOILET_BOWL_NUMBER) ?? 0) + (num(r.LADIES_CHILDREN_TOILET_BOWL_NUMBER) ?? 0) + (num(r.MEN_CHILDREN_URINAL_NUMBER) ?? 0);
    const diaper = (r.DIPERS_EXCHG_POSI || "").trim();
    const fac: string[] = [];
    if (diaper && diaper !== "없음" && diaper !== "-") fac.push("기저귀교환대");
    if (kidsBowls > 0) fac.push("어린이변기");
    if (r.UNISEX_TOILET_YN === "Y") fac.push("남녀공용");
    (sgg ? places : pending).push({
      id: `wc:${fnv(`${r.TOILET_NM}|${addr}|${lat}|${lng}`)}`,
      kind: "toilet",
      name: r.TOILET_NM?.trim() || "공중화장실",
      lat,
      lng: lng as number,
      addr,
      sgg,
      open: r.OPEN_TIME || undefined,
      diaper: diaper && diaper !== "없음" ? diaper : undefined,
      facilities: fac.length ? fac : undefined,
      tel: r.PHONE_NUMBER || undefined,
    });
    if (r.REFERENCE_DATE > refDate) refDate = r.REFERENCE_DATE;
  }
  sources.toilets = `전국공중화장실표준데이터 ${toilets.totalCount}건, 기준일 ${refDate}`;

  // ---- 놀이터: 1순위 행안부 전국어린이놀이시설정보 API(좌표·공공/민간·실내외 포함) ----
  const listFile = path.resolve("pipeline/.cache/cpf/list.jsonl");
  let pgTotal = 0;
  let pgNoGeo = 0;
  let pfctItems: RawItem[] = [];
  try {
    pfctItems = await fetchAllPfct();
  } catch (e) {
    console.warn(`[places] 놀이시설 API 실패(${(e as Error).message}) → cpf 목록으로 대체 시도`);
  }
  if (pfctItems.length) {
    // 놀이기구 유형(그네·미끄럼틀·조합놀이대 …) — 실패해도 진행
    let rides: Record<string, string[]> = {};
    try {
      rides = await fetchRides();
    } catch (e) {
      console.warn(`[places] 기구정보 API 실패(${(e as Error).message}) → 기구 없이 진행`);
    }
    // cpf 목록이 있으면 안전검사 상태만 보강
    const cpfExtra = new Map<string, CpfRow>();
    if (fs.existsSync(listFile)) {
      for (const l of fs.readFileSync(listFile, "utf8").split("\n")) {
        if (!l) continue;
        const r = JSON.parse(l) as CpfRow;
        cpfExtra.set(r.id, r);
      }
    }
    pgTotal = pfctItems.length;
    for (const r of pfctItems) {
      if (r.operYnCdNm && r.operYnCdNm !== "운영") continue;
      // 폐쇄일자: 값이 없을 때 공백 8칸으로 오는 행이 17,850건 → 숫자가 있을 때만 폐쇄로 본다
      if (/\d/.test(String(r.clsgYmd ?? ""))) continue;
      const lat = num(String(r.latCrtsVl ?? ""));
      const lng = num(String(r.lotCrtsVl ?? ""));
      if (!inKorea(lat, lng)) {
        pgNoGeo++;
        continue;
      }
      const addr = normalizeAddr(String(r.ronaAddr || r.lotnoAddr || r.rgnCdNm || ""));
      const rgn = String(r.rgnCd ?? "").slice(0, 5);
      const sgg = (SGG_BY_CODE.has(rgn) ? rgn : undefined) ?? matchSgg(addr)?.code ?? "";
      const site = String(r.instlPlaceCdNm ?? "").trim();
      const extra = cpfExtra.get(String(r.pfctSn));
      (sgg ? places : pending).push({
        id: `pg:${r.pfctSn}`,
        kind: "playground",
        name: String(r.pfctNm ?? "").trim() || "어린이놀이시설",
        lat,
        lng: lng as number,
        addr,
        sgg,
        site: site || undefined,
        indoor: r.idrodrCdNm === "실내" || undefined,
        water: r.wowaStylRideCd === "X001" || undefined,
        excellent: r.exfcYn === "Y" || undefined,
        pub: r.prvtPblcYnCdNm === "공공" ? true : r.prvtPblcYnCdNm === "민간" ? false : undefined,
        installed: ymd(String(r.instlYmd ?? "")),
        inspectOk: extra?.inspect ? extra.inspect.includes("완료") || extra.inspect.includes("합격") : undefined,
        rides: rides[String(r.pfctSn)],
      });
    }
    sources.playgrounds = `행정안전부 전국어린이놀이시설정보서비스 ${pgTotal}건(좌표 ${pgTotal - pgNoGeo}건), 기구정보 ${Object.keys(rides).length}개 시설`;
  } else if (fs.existsSync(listFile)) {
    const water = new Set<string>(readJsonIf<string[]>("pipeline/.cache/cpf/water.json") ?? []);
    const excellent = new Set<string>(readJsonIf<string[]>("pipeline/.cache/cpf/excellent.json") ?? []);
    const rows = fs
      .readFileSync(listFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as CpfRow);
    pgTotal = rows.length;
    for (const r of rows) {
      if (r.operating && r.operating !== "운영") continue;
      const addr = normalizeAddr(r.addr);
      const sgg = matchSgg(addr)?.code ?? "";
      const hit = lookupGeo(geo, r.addr);
      if (!hit) {
        pgNoGeo++;
        continue;
      }
      (sgg ? places : pending).push({
        id: `pg:${r.id}`,
        kind: "playground",
        name: r.name || "어린이놀이시설",
        lat: hit.lat,
        lng: hit.lng,
        addr,
        sgg,
        site: r.site || undefined,
        indoor: INDOOR_SITES.some((k) => r.site.includes(k)) || undefined,
        water: water.has(r.id) || undefined,
        excellent: excellent.has(r.id) || undefined,
        installed: ymd(r.installed),
        inspectOk: r.inspect ? r.inspect.includes("완료") || r.inspect.includes("합격") : undefined,
      });
    }
    sources.playgrounds = `행안부 어린이놀이시설 안전관리시스템 ${pgTotal}건(좌표 확보 ${pgTotal - pgNoGeo}건)`;
  } else {
    console.warn("[places] 놀이터 목록 없음(pipeline/.cache/cpf/list.jsonl) → 공원·화장실만 빌드");
  }

  // ---- 수유실(좌표 있는 지역 데이터만) ----
  try {
    const ns = await fetchBusanNursing();
    for (const r of ns.rows) {
      if (!inKorea(r.lat, r.lng)) continue;
      const addr = normalizeAddr(r.addr);
      const sgg = matchSgg(addr)?.code ?? "";
      (sgg ? places : pending).push({
        id: `ns:${fnv(`${r.name}|${addr}|${r.spot ?? ""}`)}`,
        kind: "nursing",
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        addr,
        sgg,
        spot: r.spot,
        target: r.target,
        father: r.father,
        tel: r.tel,
      });
    }
    sources.nursing = ns.note;
    console.log(`[places] ${ns.note}`);
  } catch (e) {
    console.warn(`[places] 수유실 수집 실패(${(e as Error).message}) → 건너뜀`);
  }

  // ---- 2차 배정: 옛 주소(개편 전 시군구) → 같은 시도 안 가장 가까운 시군구 ----
  const fallback = makeFallback(places);
  for (const p of pending) {
    const code = fallback(p.addr, p.lat, p.lng);
    if (code) {
      p.sgg = code;
      places.push(p);
    } else noSgg++;
  }
  console.log(`[places] 2차 배정 ${pending.length - noSgg}/${pending.length}`);

  // ---- 시군구별 파일 ----
  const bySgg = new Map<string, Place[]>();
  for (const p of places) {
    const list = bySgg.get(p.sgg) ?? [];
    list.push(p);
    bySgg.set(p.sgg, list);
  }
  fs.rmSync(path.join(OUT, "places"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "places"), { recursive: true });
  const builtAt = new Date().toISOString();
  const sggInfos: SggInfo[] = [];
  for (const [code, list] of bySgg) {
    const sc = SGG_BY_CODE.get(code);
    const sd = sidoOfSgg(code);
    if (!sc || !sd) continue;
    list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "ko"));
    const file: PlacesFile = { sgg: code, builtAt, places: list.map(compact) };
    fs.writeFileSync(path.join(OUT, "places", `${code}.json`), JSON.stringify(file));
    const lat = median(list.map((p) => p.lat));
    const lng = median(list.map((p) => p.lng));
    const counts: Record<PlaceKind, number> = { playground: 0, park: 0, toilet: 0, nursing: 0 };
    for (const p of list) counts[p.kind]++;
    sggInfos.push({
      code,
      sido: sd.short,
      name: sc.name,
      lat: round(lat, 5),
      lng: round(lng, 5),
      ...toGrid(lat, lng),
      airSido: sd.air,
      areaNo: `${code}00000`,
      counts,
    });
  }
  sggInfos.sort((a, b) => a.code.localeCompare(b.code));
  const index: DataIndex = { builtAt, sources, sgg: sggInfos };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
  const meta = {
    builtAt,
    places: places.length,
    sgg: sggInfos.length,
    playgroundsTotal: pgTotal,
    playgroundsWithoutCoords: pgNoGeo,
    unmatchedAddresses: noSgg,
    sources,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

function readJsonIf<T>(p: string): T | undefined {
  const f = path.resolve(p);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as T) : undefined;
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function round(n: number, d: number): number {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}
/** undefined 필드 제거 + 좌표 반올림(파일 크기) */
function compact(p: Place): Place {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") o[k] = v;
  o.lat = round(p.lat, 6);
  o.lng = round(p.lng, 6);
  return o as unknown as Place;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
