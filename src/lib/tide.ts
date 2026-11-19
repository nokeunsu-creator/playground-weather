/**
 * 갯벌 체험 시간 계산.
 *  - 해 뜨고 지는 시각(좌표·날짜로 계산, 한국 시각)
 *  - 조개 캐기 권장 시간: 저조 2시간 전 ~ 저조 1시간 후, 해 있는 동안만, 1시간 이상일 때
 *    (밀물은 저조 직후부터 빠르게 들어오므로 저조 1시간 뒤에는 나오는 것을 기준으로 한다)
 *  - 하루 조차(고조−저조)로 이번 주 중 물이 많이/적게 빠지는 날 표시
 */
import type { Level } from "./judge";
import type { MudflatFcst, MudflatSpot, TideEvent, TideStation } from "./types";

export const DIG_BEFORE_MIN = 120;
export const DIG_AFTER_MIN = 60;

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/**
 * 해 뜨는·지는 시각(한국 시각 "HH:MM"). Almanac for Computers 근사식, 오차 수 분.
 * 백야·극야는 없지만 계산이 안 되면 undefined.
 */
export function sunTimes(date: string, lat: number, lng: number): { rise: string; set: string } | undefined {
  const [y, m, d] = date.split("-").map(Number);
  const rad = Math.PI / 180;
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const lngHour = lng / 15;
  const calc = (rising: boolean): number | undefined => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const L = (((M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634) % 360) + 360) % 360;
    let RA = ((Math.atan(0.91764 * Math.tan(L * rad)) / rad) % 360 + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return undefined;
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const ut = (((T - lngHour) % 24) + 24) % 24;
    return ((ut + 9) % 24) * 60;
  };
  const r = calc(true);
  const s = calc(false);
  if (r == null || s == null) return undefined;
  return { rise: toHm(r), set: toHm(s) };
}

export function eventsOn(st: TideStation | undefined, date: string): TideEvent[] {
  return (st?.events ?? []).filter((e) => e.t.startsWith(date));
}

export interface DigWindow {
  start: string;
  end: string;
  /** 기준 저조 "HH:MM"과 조위(cm) */
  low?: string;
  lowH?: number;
}

/** 저조마다 권장 시간을 만들고 해 있는 시간으로 자른다 */
export function digWindows(events: TideEvent[], sun?: { rise: string; set: string }): DigWindow[] {
  const rise = sun ? toMin(sun.rise) : 7 * 60;
  const set = sun ? toMin(sun.set) : 18 * 60;
  const out: DigWindow[] = [];
  for (const e of events) {
    if (e.type !== "low") continue;
    const low = toMin(e.t.slice(11, 16));
    const s = Math.max(low - DIG_BEFORE_MIN, rise);
    const en = Math.min(low + DIG_AFTER_MIN, set);
    if (en - s >= 60) out.push({ start: toHm(s), end: toHm(en), low: e.t.slice(11, 16), lowH: e.h });
  }
  return out;
}

export type RangeClass = "big" | "mid" | "small";

/** 날짜별 조차와 이번 주 안에서의 상대 등급 */
export function weekRanges(st: TideStation | undefined, dates: string[]): Record<string, { range: number; cls: RangeClass } | undefined> {
  const out: Record<string, { range: number; cls: RangeClass } | undefined> = {};
  const raw: Record<string, number> = {};
  for (const d of dates) {
    const ev = eventsOn(st, d);
    const hi = ev.filter((e) => e.type === "high").map((e) => e.h);
    const lo = ev.filter((e) => e.type === "low").map((e) => e.h);
    if (hi.length && lo.length) raw[d] = Math.max(...hi) - Math.min(...lo);
  }
  const max = Math.max(0, ...Object.values(raw));
  for (const d of dates) {
    const r = raw[d];
    if (r == null || max <= 0) continue;
    out[d] = { range: r, cls: r >= max * 0.85 ? "big" : r <= max * 0.55 ? "small" : "mid" };
  }
  return out;
}

export function indexLevel(index?: string): Level | undefined {
  if (!index) return undefined;
  if (/나쁨/.test(index)) return "bad";
  if (/보통/.test(index)) return "caution";
  if (/좋음/.test(index)) return "good";
  return undefined;
}

export interface SpotDay {
  date: string;
  /** 갯벌체험지수(있으면) */
  fcst?: MudflatFcst;
  /** 체험 시간: 지수의 체험 가능 시각, 없으면 물때로 계산한 권장 시간 */
  windows: DigWindow[];
  /** windows 출처 */
  from: "index" | "tide" | "none";
  events: TideEvent[];
  sun?: { rise: string; set: string };
  level?: Level;
}

export function spotDay(spot: MudflatSpot, stations: Record<string, TideStation>, date: string): SpotDay {
  const st = spot.station ? stations[spot.station] : undefined;
  const events = eventsOn(st, date);
  const sun = sunTimes(date, spot.lat, spot.lng);
  const fcst = spot.fcst?.find((f) => f.date === date);
  if (fcst?.start && fcst.end && fcst.start < fcst.end) {
    const lowsIn = events.filter((e) => e.type === "low" && e.t.slice(11, 16) >= fcst.start! && e.t.slice(11, 16) <= fcst.end!);
    return {
      date,
      fcst,
      windows: [{ start: fcst.start, end: fcst.end, low: lowsIn[0]?.t.slice(11, 16), lowH: lowsIn[0]?.h }],
      from: "index",
      events,
      sun,
      level: indexLevel(fcst.index),
    };
  }
  const windows = digWindows(events, sun);
  return { date, fcst, windows, from: windows.length ? "tide" : "none", events, sun, level: fcst ? indexLevel(fcst.index) : undefined };
}

/** "오늘", "내일", "토 11/22" */
export function dayLabel(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  const wd = "일월화수목금토"[d.getDay()];
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** 오늘이면 이미 끝난 체험 시간을 빼고, 다 지났는지 알려준다 */
export function upcoming(d: SpotDay, today: string, nowHm: string): { windows: DigWindow[]; past: boolean } {
  if (d.date !== today) return { windows: d.windows, past: false };
  const left = d.windows.filter((w) => w.end > nowHm);
  return { windows: left, past: d.windows.length > 0 && left.length === 0 };
}
