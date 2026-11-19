/**
 * 갯벌·물때 데이터 → {out}/mudflat.json (MudflatFile)
 *  1) 갯벌 체험 장소
 *     - 국립해양조사원 갯벌체험지수(7일 체험 가능 시각·지수·날씨) 포인트
 *     - 전국농어촌체험휴양마을표준데이터 중 갯벌·조개 캐기 프로그램이 있는 마을(키 불필요)
 *     두 목록에서 1.5km 안의 같은 곳은 하나로 합친다.
 *  2) 물때: 장소마다 가장 가까운 조석 예보지점의 오늘부터 7일 고조·저조
 * API 를 아직 활용신청하지 않았으면 그 부분만 건너뛰고(notes 에 기록) 나머지는 낸다.
 * 예보지점 좌표는 이전 mudflat.json 에서 이어받아 호출을 줄인다.
 *
 * 사용: node --env-file-if-exists=.env node_modules/tsx/dist/cli.mjs pipeline/fetch-tide.ts --out pages
 */
import fs from "node:fs";
import path from "node:path";
import type { DataIndex, MudflatFile, MudflatSpot, TideStation } from "../src/lib/types";
import { haversineKm } from "../src/lib/geo";
import { fetchStandard } from "./sources/standard-data";
import { ApiNotRegistered, fetchMudflatIndex, fetchTideDay, mudflatPrograms, safeTel, safeUrl } from "./sources/khoa";
import { matchSgg, normalizeAddr } from "./sgg";

const KEY = process.env.DATA_GO_KR_KEY;
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return path.resolve(i > 0 ? process.argv[i + 1] : "public/data");
})();
const DAYS = 7;
/** 이보다 먼 예보지점은 물때로 쓰지 않는다 */
const MAX_STATION_KM = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
/** 한국 시각 기준 오늘부터 n일의 YYYYMMDD */
function kstDays(n: number): string[] {
  const out: string[] = [];
  const base = Date.now() + 9 * 3600 * 1000;
  for (let i = 0; i < n; i++) out.push(new Date(base + i * 86400000).toISOString().slice(0, 10).replace(/-/g, ""));
  return out;
}
function readJson<T>(f: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function main() {
  const t0 = Date.now();
  const notes: string[] = [];
  const sources: Record<string, string> = {};
  const index = readJson<DataIndex>(path.join(OUT, "index.json"));
  const prev = readJson<MudflatFile>(path.join(OUT, "mudflat.json"));
  const nearestSgg = (lat: number, lng: number) => {
    if (!index) return undefined;
    let best: string | undefined;
    let bd = 40;
    for (const s of index.sgg) {
      const d = haversineKm(lat, lng, s.lat, s.lng);
      if (d < bd) {
        bd = d;
        best = s.code;
      }
    }
    return best;
  };

  // ---- 1-a. 농어촌체험휴양마을(갯벌 프로그램) ----
  const spots: MudflatSpot[] = [];
  try {
    const v = await fetchStandard("villages");
    let ref = "";
    for (const r of v.rows) {
      const programs = mudflatPrograms(r.EXPRN_CN);
      if (!programs.length) continue;
      const lat = Number(r.LATITUDE);
      const lng = Number(r.LONGITUDE);
      if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) continue;
      const addr = normalizeAddr(r.RDNMADR || r.LNMADR || "");
      spots.push({
        id: `vl:${fnv(`${r.EXPRN_VILAGE_NM}|${addr}`)}`,
        name: (r.EXPRN_VILAGE_NM || "체험마을").trim(),
        lat,
        lng,
        src: "village",
        addr: addr || undefined,
        sgg: matchSgg(addr)?.code ?? nearestSgg(lat, lng),
        tel: safeTel(r.PHONE_NUMBER),
        url: safeUrl(r.HOMEPAGE_URL),
        programs,
      });
      if (r.REFERENCE_DATE > ref) ref = r.REFERENCE_DATE;
    }
    sources.villages = `전국농어촌체험휴양마을표준데이터 중 갯벌 체험 마을 ${spots.length}곳, 기준일 ${ref}`;
  } catch (e) {
    notes.push(`체험마을 표준데이터 실패: ${(e as Error).message}`);
  }

  // ---- 1-b. 갯벌체험지수 포인트(7일) ----
  const days = kstDays(DAYS);
  const todayIso = `${days[0].slice(0, 4)}-${days[0].slice(4, 6)}-${days[0].slice(6, 8)}`;
  if (!KEY) notes.push("DATA_GO_KR_KEY 없음: 갯벌체험지수·물때 건너뜀");
  if (KEY) {
    try {
      const points = await fetchMudflatIndex(KEY, days[0]);
      let merged = 0;
      for (const p of points) {
        // 1.5km 안 체험마을이 있으면 그 마을 정보를 합친다
        const near = spots.find((s) => s.src === "village" && haversineKm(s.lat, s.lng, p.lat, p.lng) <= 1.5);
        if (near) {
          near.src = "khoa";
          near.fcst = p.fcst;
          near.name = p.name.length >= 2 ? p.name : near.name;
          merged++;
          continue;
        }
        spots.push({ id: `kh:${fnv(`${p.name}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`)}`, name: p.name, lat: p.lat, lng: p.lng, src: "khoa", sgg: nearestSgg(p.lat, p.lng), fcst: p.fcst });
      }
      sources.mudflatIndex = `국립해양조사원 갯벌체험지수 ${points.length}곳(체험마을과 합침 ${merged}), ${days[0]} 기준 7일`;
    } catch (e) {
      if (e instanceof ApiNotRegistered) {
        notes.push("갯벌체험지수 API(15142489) 활용신청 필요");
      } else {
        // 국립해양조사원 서버가 자주 시간 초과(SERVICETIMEOUT)된다. 이전 결과 중 오늘 이후 날짜는 살린다.
        notes.push(`갯벌체험지수 실패: ${(e as Error).message}`);
        let restored = 0;
        for (const old of prev?.spots ?? []) {
          if (old.src !== "khoa") continue;
          const fcst = (old.fcst ?? []).filter((f) => f.date >= todayIso);
          if (!fcst.length) continue;
          const cur = spots.find((s) => s.id === old.id);
          if (cur) Object.assign(cur, { src: "khoa", name: old.name, fcst });
          else spots.push({ ...old, fcst, station: undefined, stationKm: undefined });
          restored++;
        }
        if (restored) sources.mudflatIndex = `국립해양조사원 갯벌체험지수(이전 수집값) ${restored}곳`;
      }
    }
  }

  // ---- 2. 물때 ----
  // 예보지점 좌표는 tide-stations.json 에 넣어 두었다(없는 지점만 API 로 알아낸다).
  const list = (readJson<{ stations: { code: string; name: string; lat?: number; lng?: number }[] }>(path.resolve("pipeline/data/tide-stations.json"))?.stations ?? []).map((s) => ({ ...s }));
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const s of list) if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) coords.set(s.code, { lat: s.lat!, lng: s.lng! });
  for (const s of Object.values(prev?.stations ?? {})) if (Number.isFinite(s.lat)) coords.set(s.code, { lat: s.lat, lng: s.lng });
  const stations: Record<string, TideStation> = {};
  let calls = 0;
  let failed = 0;
  let reusedDays = 0;
  // 연속으로 이만큼 실패하면 서버가 멈춘 것으로 보고 더 부르지 않는다(실패 한 건이 재시도 포함 2분 남짓 → 작업 시간 제한 보호)
  const MAX_CONSECUTIVE_FAIL = 3;
  let streak = 0;
  /** 한 번 호출. 실패하면 undefined(활용신청 문제는 그대로 던짐) */
  const tryDay = async (code: string, ymd: string) => {
    if (streak >= MAX_CONSECUTIVE_FAIL) {
      failed++;
      return undefined;
    }
    try {
      const r = await fetchTideDay(KEY!, code, ymd);
      calls++;
      streak = 0;
      await sleep(60);
      return r;
    } catch (e) {
      if (e instanceof ApiNotRegistered) throw e;
      failed++;
      streak++;
      return undefined;
    }
  };
  if (KEY) {
    try {
      // 좌표 모르는 지점은 오늘 예보를 한 번 받아 좌표를 얻는다
      const todayCache = new Map<string, Awaited<ReturnType<typeof fetchTideDay>>>();
      for (const s of list) {
        if (coords.has(s.code)) continue;
        const r = await tryDay(s.code, days[0]);
        if (!r) continue;
        todayCache.set(s.code, r);
        if (r.lat != null && r.lng != null) coords.set(s.code, { lat: r.lat, lng: r.lng });
      }
      // 장소마다 가까운 예보지점
      for (const sp of spots) {
        let best: string | undefined;
        let bd = MAX_STATION_KM;
        for (const [code, c] of coords) {
          const d = haversineKm(sp.lat, sp.lng, c.lat, c.lng);
          if (d < bd) {
            bd = d;
            best = code;
          }
        }
        if (best) {
          sp.station = best;
          sp.stationKm = Math.round(bd * 10) / 10;
        }
      }
      const used = [...new Set(spots.map((s) => s.station).filter(Boolean) as string[])];
      for (const code of used) {
        const meta = list.find((s) => s.code === code);
        const c = coords.get(code)!;
        const events: TideStation["events"] = [];
        for (const [i, d] of days.entries()) {
          const r = (i === 0 ? todayCache.get(code) : undefined) ?? (await tryDay(code, d));
          if (r) {
            events.push(...r.events);
            continue;
          }
          // 실패한 날은 이전 수집값으로 채운다
          const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
          const old = (prev?.stations?.[code]?.events ?? []).filter((ev) => ev.t.startsWith(iso));
          if (old.length) reusedDays++;
          events.push(...old);
        }
        if (events.length) stations[code] = { code, name: meta?.name ?? code, lat: c.lat, lng: c.lng, events: events.sort((a, b) => a.t.localeCompare(b.t)) };
      }
      // 물때를 하나도 못 얻은 지점에 붙은 장소는 지점을 뗀다(앱이 빈 물때를 보여 주지 않도록)
      for (const sp of spots) {
        if (sp.station && !stations[sp.station]) {
          delete sp.station;
          delete sp.stationKm;
        }
      }
      sources.tide = `국립해양조사원 조석예보(고, 저조) 예보지점 ${Object.keys(stations).length}곳, ${days[0]}부터 ${DAYS}일, 호출 ${calls}건`;
      if (failed) notes.push(`물때 호출 실패 ${failed}건(이전 수집값으로 채운 날 ${reusedDays}개)`);
    } catch (e) {
      if (e instanceof ApiNotRegistered) notes.push("조석예보(고, 저조) API(15156018) 활용신청 필요");
      else notes.push(`물때 실패: ${(e as Error).message}`);
      for (const k of Object.keys(stations)) delete stations[k];
      for (const sp of spots) {
        delete sp.station;
        delete sp.stationKm;
      }
    }
  }
  spots.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const file: MudflatFile = { builtAt: new Date().toISOString(), sources, notes, stations, spots };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "mudflat.json"), JSON.stringify(file));
  console.log(
    JSON.stringify(
      { spots: spots.length, khoa: spots.filter((s) => s.src === "khoa").length, withStation: spots.filter((s) => s.station).length, stations: Object.keys(stations).length, notes, sources, seconds: Math.round((Date.now() - t0) / 1000) },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
