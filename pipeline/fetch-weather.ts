/**
 * 시군구별 날씨 스냅샷 생성 → {out}/wx/{sgg}.json, {out}/wx/index.json
 *
 * 실제 모드(DATA_GO_KR_KEY 필요):
 *   - 기상청 단기예보(getVilageFcst)  : 발표시각이 바뀐 경우에만 재호출(하루 8회) → 48시간 시간별 예보
 *   - 기상청 초단기실황(getUltraSrtNcst): 매 실행 → 현재 기온·습도·바람·강수
 *   - 기상청 생활기상지수 자외선(getUVIdxV4), 보건기상지수(꽃가루·감기)  : 시도 단위
 *   - 에어코리아 시도별 실시간 측정(getCtprvnRltmMesureDnsty) + 측정소 목록 → 시군구별 PM10/PM2.5
 * 모의 모드(--mock 또는 키 없음): 월별 기후값 기반의 결정적 가짜 데이터(mock:true)
 *
 * 사용: tsx pipeline/fetch-weather.ts [--mock] [--out public/data] [--only 11680]
 */
import fs from "node:fs";
import path from "node:path";
import type { DataIndex, SggInfo, WxDay, WxHour, WxIndex, WxNow, WxSnapshot } from "../src/lib/types";
import { feelsLike } from "../src/lib/judge";
import { haversineKm } from "../src/lib/geo";
import { matchSgg, SIDO } from "./sgg";

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = path.resolve(arg("--out") ?? "public/data");
const WX = path.join(OUT, "wx");
const KEY = process.env.DATA_GO_KR_KEY;
const MOCK = argv.includes("--mock") || !KEY;
const ONLY = arg("--only");
const UA = "PlaygroundWeather-pipeline/0.1";

/** 보건기상지수 오퍼레이션 이름(키 발급 후 활용가이드와 대조해 수정) */
const IDX_OPS = {
  uv: { svc: "LivingWthrIdxServiceV4", op: "getUVIdxV4" },
  pollenOak: { svc: "HealthWthrIdxServiceV4", op: "getOakPollenRiskIdxV4", months: [4, 5, 6] },
  pollenPine: { svc: "HealthWthrIdxServiceV4", op: "getPinePollenRiskIdxV4", months: [4, 5, 6] },
  pollenWeed: { svc: "HealthWthrIdxServiceV4", op: "getWeedsPollenRiskIdxV4", months: [8, 9, 10] },
  cold: { svc: "HealthWthrIdxServiceV4", op: "getColdIdxV4", months: [9, 10, 11, 12, 1, 2, 3, 4] },
  asthma: { svc: "HealthWthrIdxServiceV4", op: "getAsthmaIdxV4" },
};

// ---------------- 시간(KST) ----------------
function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
const p2 = (n: number) => String(n).padStart(2, "0");
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}
function isoHour(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:00`;
}
/** 단기예보 발표 기준시각: 02,05,…,23시. 발표 후 45분부터 사용 */
function vilageBase(now: Date): { date: string; time: string } {
  const t = new Date(now.getTime() - 45 * 60 * 1000);
  const hours = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = t.getUTCHours();
  const base = hours.find((x) => x <= h);
  if (base == null) {
    const y = new Date(t.getTime() - 24 * 3600 * 1000);
    return { date: ymd(y), time: "2300" };
  }
  return { date: ymd(t), time: `${p2(base)}00` };
}
/** 초단기실황: 매시 40분 이후 해당 시각 사용 */
function ncstBase(now: Date): { date: string; time: string } {
  const t = new Date(now.getTime() - 40 * 60 * 1000);
  return { date: ymd(t), time: `${p2(t.getUTCHours())}00` };
}

// ---------------- HTTP ----------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let aborted = false;

async function getJson(url: string, tries = 3): Promise<unknown> {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      if (text.startsWith("<")) {
        // 공공데이터포털 게이트웨이 오류(XML)
        const code = text.match(/<returnReasonCode>(\d+)</)?.[1] ?? text.match(/<resultCode>(\d+)</)?.[1];
        if (code === "22") aborted = true;
        throw new Error(`gateway ${code ?? "?"}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
      }
      return JSON.parse(text);
    } catch (e) {
      if (i === tries || aborted) throw e;
      await sleep(800 * i);
    }
  }
  throw new Error("unreachable");
}

interface KmaItem {
  category: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  obsrValue?: string;
}
async function kma(op: string, q: Record<string, string>): Promise<KmaItem[]> {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "1000", dataType: "JSON", ...q });
  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${op}?serviceKey=${encodeURIComponent(KEY!)}&${qs}`;
  const j = (await getJson(url)) as { response: { header: { resultCode: string; resultMsg: string }; body?: { items?: { item: KmaItem[] } } } };
  if (j.response.header.resultCode !== "00") {
    if (j.response.header.resultCode === "03") return []; // NO_DATA
    throw new Error(`${op} ${j.response.header.resultCode} ${j.response.header.resultMsg}`);
  }
  return j.response.body?.items?.item ?? [];
}

type IdxRow = Record<string, string>;
async function kmaIdx(svc: string, op: string, areaNo: string, time: string): Promise<IdxRow | undefined> {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "10", dataType: "JSON", areaNo, time });
  const url = `https://apis.data.go.kr/1360000/${svc}/${op}?serviceKey=${encodeURIComponent(KEY!)}&${qs}`;
  const j = (await getJson(url)) as { response: { header: { resultCode: string; resultMsg: string }; body?: { items?: { item: IdxRow[] } } } };
  if (j.response.header.resultCode !== "00") return undefined;
  return j.response.body?.items?.item?.[0];
}

interface AirItem {
  stationName: string;
  pm10Value: string;
  pm25Value: string;
  dataTime: string;
}
interface Station {
  stationName: string;
  addr: string;
  dmX: string;
  dmY: string;
}
async function airSido(sidoName: string): Promise<AirItem[]> {
  const qs = new URLSearchParams({ returnType: "json", numOfRows: "1000", pageNo: "1", sidoName, ver: "1.3" });
  const url = `https://apis.data.go.kr/B552584/ArpltnInfoInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(KEY!)}&${qs}`;
  const j = (await getJson(url)) as { response: { header: { resultCode: string }; body?: { items?: AirItem[] } } };
  return j.response.body?.items ?? [];
}
async function airStations(): Promise<Station[]> {
  const qs = new URLSearchParams({ returnType: "json", numOfRows: "1000", pageNo: "1" });
  const url = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?serviceKey=${encodeURIComponent(KEY!)}&${qs}`;
  const j = (await getJson(url)) as { response: { body?: { items?: Station[] } } };
  return j.response.body?.items ?? [];
}

// ---------------- 파싱 ----------------
function parsePcp(s?: string): number {
  if (!s || s.includes("없음") || s === "0") return 0;
  if (s.includes("미만")) return 0.5;
  const m = s.match(/([\d.]+)/);
  return m ? Number(m[1]) : 0;
}

function buildHours(items: KmaItem[], uv: IdxRow | undefined, uvBase: Date | undefined, from: Date): { hours: WxHour[]; days: WxDay[] } {
  const byT = new Map<string, Record<string, string>>();
  const days = new Map<string, WxDay>();
  for (const it of items) {
    if (!it.fcstDate || !it.fcstTime) continue;
    const date = `${it.fcstDate.slice(0, 4)}-${it.fcstDate.slice(4, 6)}-${it.fcstDate.slice(6, 8)}`;
    if (it.category === "TMN" || it.category === "TMX") {
      const d = days.get(date) ?? { date };
      if (it.category === "TMN") d.tmn = Number(it.fcstValue);
      else d.tmx = Number(it.fcstValue);
      days.set(date, d);
      continue;
    }
    const t = `${date}T${it.fcstTime.slice(0, 2)}:00`;
    const o = byT.get(t) ?? {};
    o[it.category] = it.fcstValue ?? "";
    byT.set(t, o);
  }
  const fromIso = isoHour(from);
  const hours: WxHour[] = [];
  for (const [t, o] of [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (t < fromIso || !("TMP" in o)) continue;
    const temp = Number(o.TMP);
    const reh = Number(o.REH ?? 50);
    const wsd = Number(o.WSD ?? 0);
    const h: WxHour = {
      t,
      temp,
      feels: feelsLike(temp, wsd, reh),
      reh,
      wsd,
      pop: Number(o.POP ?? 0),
      pty: Number(o.PTY ?? 0),
      sky: Number(o.SKY ?? 1),
      rain: parsePcp(o.PCP),
    };
    if (uv && uvBase) {
      const diffH = Math.round((Date.parse(t + ":00Z") - uvBase.getTime()) / 3600000);
      if (diffH >= 0 && diffH <= 75) {
        const v = uv[`h${Math.floor(diffH / 3) * 3}`];
        if (v != null && v !== "") h.uv = Number(v);
      }
    }
    hours.push(h);
    if (hours.length >= 48) break;
  }
  return { hours, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

// ---------------- 모의 데이터 ----------------
function hashSeed(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}
const CLIMO = [-2, 1, 6, 12, 18, 22, 25, 26, 21, 15, 7, 0];

function mockSnapshot(s: SggInfo, now: Date): WxSnapshot {
  const today = isoHour(now).slice(0, 10);
  const rnd = hashSeed(`${s.code}|${today}`);
  const month = now.getUTCMonth();
  const base = CLIMO[month] - (s.lat - 36) * 0.6 + (rnd() - 0.5) * 6;
  const rainy = rnd() < 0.25;
  const pmBase = 15 + rnd() * 50;
  const hours: WxHour[] = [];
  const start = new Date(now.getTime());
  start.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    const d = new Date(start.getTime() + i * 3600000);
    const hh = d.getUTCHours();
    const temp = Math.round((base + 6 * Math.sin(((hh - 9) / 24) * Math.PI * 2) + (rnd() - 0.5)) * 10) / 10;
    const wsd = Math.round((1 + rnd() * 4) * 10) / 10;
    const reh = Math.round(40 + rnd() * 40);
    const r = rainy && hh >= 12 && hh <= 18 && i < 24;
    hours.push({
      t: isoHour(d),
      temp,
      feels: feelsLike(temp, wsd, reh),
      reh,
      wsd,
      pop: r ? 70 : Math.round(rnd() * 30),
      pty: r ? (temp < 1 ? 3 : 1) : 0,
      sky: r ? 4 : rnd() < 0.5 ? 1 : 3,
      rain: r ? 2 : 0,
      uv: hh >= 7 && hh <= 18 ? Math.round(Math.max(0, Math.sin(((hh - 6) / 13) * Math.PI) * (month >= 4 && month <= 8 ? 9 : 4))) : 0,
    });
  }
  const h0 = hours[0];
  const days: WxDay[] = [];
  for (const d of [today, hours[hours.length - 1].t.slice(0, 10)]) {
    const hs = hours.filter((h) => h.t.startsWith(d));
    if (hs.length) days.push({ date: d, tmn: Math.min(...hs.map((h) => h.temp)), tmx: Math.max(...hs.map((h) => h.temp)) });
  }
  const pm10 = Math.round(pmBase * 1.6);
  const pm25 = Math.round(pmBase);
  const idx: WxIndex = {
    uvMax: Math.max(...hours.filter((h) => h.t.startsWith(today)).map((h) => h.uv ?? 0)),
    pollen: [3, 4, 5].includes(month) || [7, 8, 9].includes(month) ? Math.floor(rnd() * 4) : undefined,
    cold: month >= 8 || month <= 3 ? Math.floor(rnd() * 4) : undefined,
    asthma: Math.floor(rnd() * 3),
  };
  const nowRow: WxNow = {
    at: isoHour(now),
    temp: h0.temp,
    feels: h0.feels,
    reh: h0.reh,
    wsd: h0.wsd,
    pty: h0.pty,
    rain: h0.rain ?? 0,
    pm10,
    pm25,
    pmAt: isoHour(now),
    station: "모의",
  };
  return { sgg: s.code, fetchedAt: new Date().toISOString(), base: `${today} mock`, mock: true, now: nowRow, hours, days, idx };
}

// ---------------- 실제 수집 ----------------
async function realSnapshots(sggs: SggInfo[], now: Date): Promise<{ ok: WxSnapshot[]; failed: string[] }> {
  const vb = vilageBase(now);
  const nb = ncstBase(now);
  const baseStr = `${vb.date}${vb.time}`;
  console.log(`[wx] vilage base ${baseStr}, ncst ${nb.date}${nb.time}`);

  // 시도별 지수(자외선·꽃가루·감기·천식)
  const month = now.getUTCMonth() + 1;
  const idxTime = `${ymd(now)}${now.getUTCHours() >= 18 ? "18" : "06"}`;
  const uvBase = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() >= 18 ? 18 : 6));
  const sidoIdx = new Map<string, { uv?: IdxRow; idx: WxIndex }>();
  for (const sd of SIDO) {
    const out: { uv?: IdxRow; idx: WxIndex } = { idx: {} };
    try {
      out.uv = await kmaIdx(IDX_OPS.uv.svc, IDX_OPS.uv.op, sd.areaNo, idxTime);
      if (out.uv) {
        const vals = Object.entries(out.uv)
          .filter(([k]) => /^h\d+$/.test(k))
          .map(([, v]) => Number(v))
          .filter((v) => Number.isFinite(v));
        if (vals.length) out.idx.uvMax = Math.max(...vals.slice(0, 8));
      }
    } catch (e) {
      console.warn(`[wx] uv ${sd.short}: ${(e as Error).message}`);
    }
    const pollen: number[] = [];
    for (const key of ["pollenOak", "pollenPine", "pollenWeed", "cold", "asthma"] as const) {
      const op = IDX_OPS[key];
      if ("months" in op && !op.months.includes(month)) continue;
      try {
        const row = await kmaIdx(op.svc, op.op, sd.areaNo, idxTime);
        const v = Number(row?.today ?? row?.h0 ?? row?.h3);
        if (!Number.isFinite(v)) continue;
        if (key.startsWith("pollen")) pollen.push(v);
        else if (key === "cold") out.idx.cold = v;
        else out.idx.asthma = v;
      } catch {
        /* 오퍼레이션 이름 불일치 등은 무시 */
      }
      if (aborted) break;
    }
    if (pollen.length) out.idx.pollen = Math.max(...pollen);
    sidoIdx.set(sd.short, out);
    if (aborted) break;
  }

  // 에어코리아
  const stations = await airStations().catch((e) => {
    console.warn(`[wx] stations: ${(e as Error).message}`);
    return [] as Station[];
  });
  const stationSgg = new Map<string, string>();
  for (const st of stations) {
    const m = matchSgg(st.addr);
    if (m) stationSgg.set(st.stationName, m.code);
  }
  const airBySido = new Map<string, AirItem[]>();
  for (const sd of SIDO) {
    if (aborted) break;
    // "광주,전남" 처럼 여러 sidoName 을 합쳐야 하는 시도(통합특별시)도 있다
    const merged: AirItem[] = [];
    for (const name of sd.air.split(",")) {
      try {
        merged.push(...(await airSido(name.trim())));
      } catch (e) {
        console.warn(`[wx] air ${name}: ${(e as Error).message}`);
      }
    }
    airBySido.set(sd.air, merged);
  }
  function pmFor(s: SggInfo): Partial<WxNow> {
    const items = airBySido.get(s.airSido) ?? [];
    const valid = items.filter((it) => Number.isFinite(Number(it.pm10Value)) || Number.isFinite(Number(it.pm25Value)));
    let pick = valid.find((it) => stationSgg.get(it.stationName) === s.code);
    if (!pick) {
      let best = Infinity;
      for (const it of valid) {
        const st = stations.find((x) => x.stationName === it.stationName);
        if (!st) continue;
        const d = haversineKm(s.lat, s.lng, Number(st.dmX), Number(st.dmY));
        if (d < best) {
          best = d;
          pick = it;
        }
      }
    }
    if (!pick) return {};
    const pm10 = Number(pick.pm10Value);
    const pm25 = Number(pick.pm25Value);
    return {
      pm10: Number.isFinite(pm10) ? pm10 : undefined,
      pm25: Number.isFinite(pm25) ? pm25 : undefined,
      pmAt: pick.dataTime,
      station: pick.stationName,
    };
  }

  // 시군구별 예보·실황
  const ok: WxSnapshot[] = [];
  const failed: string[] = [];
  const gridCache = new Map<string, Promise<KmaItem[]>>();
  let i = 0;
  async function worker() {
    while (i < sggs.length && !aborted) {
      const s = sggs[i++];
      const file = path.join(WX, `${s.code}.json`);
      const prev = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as WxSnapshot) : undefined;
      try {
        const gk = `${s.nx},${s.ny}`;
        let hours: WxHour[];
        let days: WxDay[];
        const sidoInfo = sidoIdx.get(s.sido);
        if (prev && !prev.mock && prev.base === baseStr && prev.hours.length >= 24) {
          hours = prev.hours;
          days = prev.days;
        } else {
          let p = gridCache.get(gk);
          if (!p) {
            p = kma("getVilageFcst", { base_date: vb.date, base_time: vb.time, nx: String(s.nx), ny: String(s.ny) });
            gridCache.set(gk, p);
          }
          const items = await p;
          ({ hours, days } = buildHours(items, sidoInfo?.uv, uvBase, now));
        }
        const nc = await kma("getUltraSrtNcst", { base_date: nb.date, base_time: nb.time, nx: String(s.nx), ny: String(s.ny) });
        const obs: Record<string, number> = {};
        for (const it of nc) obs[it.category] = Number(it.obsrValue);
        const h0 = hours[0];
        const temp = Number.isFinite(obs.T1H) ? obs.T1H : h0?.temp ?? 0;
        const reh = Number.isFinite(obs.REH) ? obs.REH : h0?.reh ?? 50;
        const wsd = Number.isFinite(obs.WSD) ? obs.WSD : h0?.wsd ?? 0;
        const nowRow: WxNow = {
          at: isoHour(now),
          temp,
          feels: feelsLike(temp, wsd, reh),
          reh,
          wsd,
          pty: Number.isFinite(obs.PTY) ? obs.PTY : h0?.pty ?? 0,
          rain: Number.isFinite(obs.RN1) ? obs.RN1 : 0,
          ...pmFor(s),
        };
        ok.push({
          sgg: s.code,
          fetchedAt: new Date().toISOString(),
          base: baseStr,
          now: nowRow,
          hours,
          days,
          idx: sidoInfo?.idx ?? {},
        });
      } catch (e) {
        failed.push(`${s.code} ${(e as Error).message}`);
        if (prev) ok.push({ ...prev, fetchedAt: prev.fetchedAt });
      }
      await sleep(40);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return { ok, failed };
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")) as DataIndex;
  let sggs = index.sgg;
  if (ONLY) sggs = sggs.filter((s) => s.code === ONLY);
  fs.mkdirSync(WX, { recursive: true });
  const now = kstNow();
  let snaps: WxSnapshot[];
  let failed: string[] = [];
  if (MOCK) {
    console.log(`[wx] MOCK mode (${KEY ? "--mock" : "DATA_GO_KR_KEY 없음"}) for ${sggs.length} sgg`);
    snaps = sggs.map((s) => mockSnapshot(s, now));
  } else {
    ({ ok: snaps, failed } = await realSnapshots(sggs, now));
  }
  for (const s of snaps) fs.writeFileSync(path.join(WX, `${s.sgg}.json`), JSON.stringify(s));
  const summary = {
    fetchedAt: new Date().toISOString(),
    kst: isoHour(now),
    mock: MOCK,
    count: snaps.length,
    failed: failed.length,
    failedSamples: failed.slice(0, 10),
    aborted,
  };
  fs.writeFileSync(path.join(WX, "index.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (aborted) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
