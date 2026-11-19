/**
 * 국립해양조사원(KHOA) 공공데이터포털 API.
 *  - 갯벌체험지수(15142489): apis.data.go.kr/1192136/fcstMudflatv2/GetFcstMudflatApiServicev2
 *      reqDate(YYYYMMDD) 기준 7일, 전국 주요 갯벌체험 포인트별 체험 가능 시각·날씨·지수
 *  - 조석예보 고·저조(15156018): apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService
 *      obsCode + reqDate(하루) → 고조·저조 시각과 조위(cm), 예보지점 위경도
 * 둘 다 공공누리 1유형(출처표시), 개발계정 자동승인·하루 1만 건.
 */
import type { MudflatFcst, TideEvent } from "../../src/lib/types";

const MUDFLAT = "https://apis.data.go.kr/1192136/fcstMudflatv2/GetFcstMudflatApiServicev2";
const TIDE = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

export class ApiNotRegistered extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 응답 안의 item 배열을 꺼낸다(response 감싸기·단일 객체 모두 처리) */
export function itemsOf(j: unknown): Record<string, unknown>[] {
  const root = ((j as { response?: unknown }).response ?? j) as {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: unknown } | unknown[]; totalCount?: number };
  };
  const code = root.header?.resultCode;
  if (code && code !== "00" && code !== "0") throw new Error(`KHOA ${code} ${root.header?.resultMsg ?? ""}`.trim());
  const items = root.body?.items as { item?: unknown } | unknown[] | undefined;
  const raw = Array.isArray(items) ? items : items?.item;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];
}

export function totalOf(j: unknown): number | undefined {
  const root = ((j as { response?: unknown }).response ?? j) as { body?: { totalCount?: number; items?: { totalCount?: number } } };
  const n = Number(root.body?.totalCount ?? root.body?.items?.totalCount);
  return Number.isFinite(n) ? n : undefined;
}

async function getJson(url: string): Promise<unknown> {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) throw new ApiNotRegistered("활용신청 안 됨(SERVICE_KEY_IS_NOT_REGISTERED)");
      if (text.includes("OpenAPI_ServiceResponse")) {
        const msg = text.match(/returnAuthMsg[^\w가-힣]*([^"<]+)/)?.[1] ?? text.slice(0, 120);
        throw new Error(`gateway: ${msg.trim()}`);
      }
      return JSON.parse(text);
    } catch (e) {
      if (e instanceof ApiNotRegistered || i === 3) throw e;
      await sleep(1200 * i);
    }
  }
  throw new Error("unreachable");
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** "20261120" | "2026-11-20" → "2026-11-20" */
export function ymd(v: unknown): string | undefined {
  const d = digits(v);
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : undefined;
}

/** "10:30" | "1030" | "10:30:00" → "10:30" */
export function hhmm(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/) ?? s.match(/^(\d{2})(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : undefined;
}

const num = (v: unknown) => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export interface RawMudflatPoint {
  name: string;
  lat: number;
  lng: number;
  fcst: MudflatFcst[];
}

/** 갯벌체험지수 item 들을 장소별로 묶는다 */
export function groupMudflat(items: Record<string, unknown>[]): RawMudflatPoint[] {
  const by = new Map<string, RawMudflatPoint>();
  for (const it of items) {
    const name = String(it.mdftExpcnVlgNm ?? "").trim();
    const lat = num(it.lat);
    const lng = num(it.lot);
    const date = ymd(it.predcYmd);
    if (!name || lat == null || lng == null || !date) continue;
    const key = `${name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    const p = by.get(key) ?? { name, lat, lng, fcst: [] };
    if (!p.fcst.some((f) => f.date === date)) {
      p.fcst.push({
        date,
        start: hhmm(it.mdftExprnBgngTm),
        end: hhmm(it.mdftExprnEndTm),
        index: String(it.totalIndex ?? "").trim() || undefined,
        score: num(it.lastScr),
        weather: String(it.weather ?? "").trim() || undefined,
        tmin: num(it.minArtmp),
        tmax: num(it.maxArtmp),
        wmax: num(it.maxWspd),
      });
    }
    by.set(key, p);
  }
  for (const p of by.values()) p.fcst.sort((a, b) => a.date.localeCompare(b.date));
  return [...by.values()];
}

export async function fetchMudflatIndex(key: string, reqDate: string): Promise<RawMudflatPoint[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= 20; page++) {
    const j = await getJson(`${MUDFLAT}?serviceKey=${encodeURIComponent(key)}&type=json&reqDate=${reqDate}&pageNo=${page}&numOfRows=300`);
    const items = itemsOf(j);
    all.push(...items);
    const total = totalOf(j);
    if (!items.length || (total != null && all.length >= total)) break;
    await sleep(80);
  }
  return groupMudflat(all);
}

/** extrSe 1 오전 고조, 2 오전 저조, 3 오후 고조, 4 오후 저조 */
export function parseTide(items: Record<string, unknown>[]): { lat?: number; lng?: number; name?: string; events: TideEvent[] } {
  const events: TideEvent[] = [];
  let lat: number | undefined;
  let lng: number | undefined;
  let name: string | undefined;
  for (const it of items) {
    lat ??= num(it.lat);
    lng ??= num(it.lot);
    name ??= String(it.obsvtrNm ?? "").trim() || undefined;
    const d = digits(it.predcDt);
    const h = num(it.predcTdlvVl);
    const se = Number(it.extrSe);
    if (d.length < 12 || h == null || ![1, 2, 3, 4].includes(se)) continue;
    events.push({
      t: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}`,
      h: Math.round(h),
      type: se === 1 || se === 3 ? "high" : "low",
    });
  }
  events.sort((a, b) => a.t.localeCompare(b.t));
  return { lat, lng, name, events };
}

export async function fetchTideDay(key: string, obsCode: string, reqDate: string) {
  const j = await getJson(`${TIDE}?serviceKey=${encodeURIComponent(key)}&type=json&obsCode=${obsCode}&reqDate=${reqDate}&pageNo=1&numOfRows=20`);
  return parseTide(itemsOf(j));
}

/** 갯벌·조개 캐기와 관련된 체험 프로그램 */
// "머드"는 온천·머드팩·가공품까지 걸려서 뺀다(보령 갯벌 마을은 다른 낱말로 잡힘)
export const MUDFLAT_RE = /갯벌|조개|바지락|맛조개|해루질|꼬막|칠게|게\s?잡이|낙지\s?잡|굴\s?따기|백합\s?잡/;

/** 체험 프로그램 문자열에서 갯벌 관련 항목만 */
export function mudflatPrograms(text?: string | null): string[] {
  return (text ?? "")
    .split(/[+,/·]/)
    .map((s) => s.trim())
    .filter((s) => s && MUDFLAT_RE.test(s))
    .slice(0, 6);
}

/** 공공데이터 홈페이지 값 중 http(s) 주소만 */
export function safeUrl(v?: string | null): string | undefined {
  const s = (v ?? "").trim();
  if (!s || s === "null") return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^www\./i.test(s) ? `https://${s}` : "";
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** 전화번호: 숫자·하이픈만 */
export function safeTel(v?: string | null): string | undefined {
  const s = (v ?? "").replace(/[^\d-]/g, "");
  return s.replace(/\D/g, "").length >= 8 ? s : undefined;
}
