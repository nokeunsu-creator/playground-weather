/**
 * 행정안전부_공중화장실정보 (data.go.kr 15075531, 이용허락 제한 없음, 매일 갱신, 약 5.3만 행)
 *   https://file.localdata.go.kr/file/download/public_restroom_info/info  (CP949 CSV, Referer 필요)
 * 좌표가 없어 장소로 직접 쓰지 않는다. 대신 좌표가 있는 공중화장실 표준데이터(2020 기준)에
 * "기저귀교환대유무/장소"를 주소+이름(또는 주소)으로 붙인다. 표준데이터의 기저귀 항목은 전부 비어 있다.
 */
import fs from "node:fs";
import path from "node:path";

const URL = "https://file.localdata.go.kr/file/download/public_restroom_info/info";
const CACHE = path.resolve("pipeline/.cache/std/restroom-info.csv");

/** 따옴표·쉼표·줄바꿈을 처리하는 작은 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/** 주소·이름 비교용: 괄호 내용과 공백 제거 */
export function normKey(s?: string | null): string {
  if (!s || s === "null") return "";
  return s.replace(/\([^)]*\)/g, "").replace(/\s+/g, "");
}

export interface DiaperIndex {
  /** 주소|이름 → 기저귀교환대 장소("" = 있음, 장소 미상) 또는 null(없음) */
  exact: Map<string, string | null>;
  /** 주소 → 그 주소의 모든 행이 "있음"이면 장소, 하나라도 없으면 null */
  byAddr: Map<string, string | null>;
  rows: number;
  withDiaper: number;
  date?: string;
}

export function buildDiaperIndex(rows: string[][]): DiaperIndex {
  const H = rows[0] ?? [];
  const ix = (n: string) => H.indexOf(n);
  const iName = ix("화장실명");
  const iRoad = ix("소재지도로명주소");
  const iLot = ix("소재지지번주소");
  const iHas = ix("기저귀교환대유무");
  const iPos = ix("기저귀교환대장소");
  const iDate = ix("데이터기준일자");
  if ([iName, iRoad, iLot, iHas].some((i) => i < 0)) throw new Error(`공중화장실정보 헤더가 예상과 다름: ${H.slice(0, 8).join(",")}`);
  const exact = new Map<string, string | null>();
  const byAddr = new Map<string, string | null>();
  let n = 0;
  let y = 0;
  let date = "";
  // 원본에 미래 날짜가 섞여 있어(예: 2026-12-11) 오늘 이후 값은 기준일로 쓰지 않는다
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows.slice(1)) {
    if (r.length !== H.length) continue;
    n++;
    const has = r[iHas] === "Y";
    if (has) y++;
    const pos = has ? (r[iPos] ?? "").replace(/\+/g, ", ").trim() : null;
    const name = normKey(r[iName]);
    if (iDate >= 0 && r[iDate] > date && r[iDate] <= today) date = r[iDate];
    for (const a of [normKey(r[iRoad]), normKey(r[iLot])]) {
      if (!a) continue;
      exact.set(`${a}|${name}`, pos);
      // 같은 주소에 "없음"이 하나라도 있으면 주소만으로는 판단하지 않는다
      const prev = byAddr.get(a);
      byAddr.set(a, prev === undefined ? pos : prev === null || pos === null ? null : prev);
    }
  }
  return { exact, byAddr, rows: n, withDiaper: y, date: date || undefined };
}

/**
 * 표준데이터 화장실 한 곳의 기저귀교환대 장소.
 * 반환: 장소 문자열(빈 문자열이면 "있음") / undefined(없음 또는 모름)
 */
export function lookupDiaper(idx: DiaperIndex, addrs: (string | undefined | null)[], name: string): string | undefined {
  const keys = addrs.map(normKey).filter(Boolean);
  const nm = normKey(name);
  for (const a of keys) {
    const v = idx.exact.get(`${a}|${nm}`);
    if (v !== undefined) return v ?? undefined;
  }
  for (const a of keys) {
    const v = idx.byAddr.get(a);
    if (v !== undefined) return v ?? undefined;
  }
  return undefined;
}

export async function fetchDiaperIndex(opts: { maxAgeHours?: number } = {}): Promise<DiaperIndex> {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const maxAge = (opts.maxAgeHours ?? 24) * 3600 * 1000;
  if (!fs.existsSync(CACHE) || Date.now() - fs.statSync(CACHE).mtimeMs > maxAge) {
    const res = await fetch(URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; playweather-pipeline)", Referer: "https://www.data.go.kr/" },
      signal: AbortSignal.timeout(180000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.length < 100000) throw new Error(`다운로드 실패 HTTP ${res.status}, ${buf.length} bytes`);
    fs.writeFileSync(CACHE, buf);
  }
  const text = new TextDecoder("euc-kr").decode(fs.readFileSync(CACHE));
  return buildDiaperIndex(parseCsv(text));
}

const isMain = process.argv[1] && /restroom-info\.ts$/.test(process.argv[1]);
if (isMain) {
  fetchDiaperIndex({ maxAgeHours: 0 }).then((i) => console.log(`rows=${i.rows} withDiaper=${i.withDiaper} date=${i.date}`));
}
