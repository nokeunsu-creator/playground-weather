/**
 * 갯벌 체험 시간 계산.
 *  - 해 뜨고 지는 시각(좌표·날짜로 계산, 한국 시각)
 *  - 조개 캐기 권장 시간: 저조 2시간 전 ~ 저조 1시간 후, 해 있는 동안만, 1시간 이상일 때
 *    (밀물은 저조 직후부터 빠르게 들어오므로 저조 1시간 뒤에는 나오는 것을 기준으로 한다)
 *  - 하루 조차(고조−저조)로 이번 주 중 물이 많이/적게 빠지는 날 표시
 */
import type { Level } from "./judge";
import type { MudflatFcst, MudflatSpot, TideEvent, TideStation } from "./types";
import { sunTimes, toHm, toMin } from "./sun";

export { sunTimes };

export const DIG_BEFORE_MIN = 120;
export const DIG_AFTER_MIN = 60;

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

/**
 * 국립해양조사원이 그날은 체험할 수 없다고 예보한 경우(겨울·강풍 등).
 * 실제 응답은 totalIndex "체험불가" + 체험 시각 "00:00"~"00:00" 으로 온다(2026-11 확인).
 */
export const isClosedIndex = (index?: string): boolean => !!index && /불가/.test(index);

export function indexLevel(index?: string): Level | undefined {
  if (!index) return undefined;
  if (isClosedIndex(index) || /나쁨/.test(index)) return "bad";
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
  /** windows 출처. closed = 체험지수가 "체험불가"(물때로 다시 계산해 권하지 않는다) */
  from: "index" | "tide" | "closed" | "none";
  events: TideEvent[];
  sun?: { rise: string; set: string };
  level?: Level;
}

export function spotDay(spot: MudflatSpot, stations: Record<string, TideStation>, date: string): SpotDay {
  const st = spot.station ? stations[spot.station] : undefined;
  const events = eventsOn(st, date);
  const sun = sunTimes(date, spot.lat, spot.lng);
  const fcst = spot.fcst?.find((f) => f.date === date);
  if (fcst && isClosedIndex(fcst.index)) {
    return { date, fcst, windows: [], from: "closed", events, sun, level: "bad" };
  }
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
