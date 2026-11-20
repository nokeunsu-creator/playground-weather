/**
 * 도서관·박물관 "지금 운영 중" 계산.
 * 공휴일에는 휴관 원문(closed)에 "공휴일"·"설 연휴" 등이 있으면 닫힘, 없으면 일·공휴일 시간(hol)으로 본다.
 */
import type { Place } from "./types";

export interface VenueStatus {
  /** true 운영 중, false 닫힘, undefined 정보 없음 */
  open?: boolean;
  text: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

type HolidayKind = "new" | "seol" | "chuseok" | "nat" | "etc";
/**
 * 2026~2027 관공서 공휴일(대체공휴일·전국동시지방선거일 포함). new 신정, seol 설 연휴, chuseok 추석 연휴, nat 국경일.
 * 표 밖의 해는 공휴일을 모른다(예전처럼 일요일만 일·공휴일 시간).
 */
const HOLIDAYS: Record<string, HolidayKind> = {
  "2026-01-01": "new",
  "2026-02-16": "seol",
  "2026-02-17": "seol",
  "2026-02-18": "seol",
  "2026-03-01": "nat",
  "2026-03-02": "etc",
  "2026-05-05": "etc",
  "2026-05-24": "etc",
  "2026-05-25": "etc",
  "2026-06-03": "etc",
  "2026-06-06": "etc",
  "2026-08-15": "nat",
  "2026-08-17": "etc",
  "2026-09-24": "chuseok",
  "2026-09-25": "chuseok",
  "2026-09-26": "chuseok",
  "2026-10-03": "nat",
  "2026-10-05": "etc",
  "2026-10-09": "nat",
  "2026-12-25": "etc",
  "2027-01-01": "new",
  "2027-02-06": "seol",
  "2027-02-07": "seol",
  "2027-02-08": "seol",
  "2027-02-09": "etc",
  "2027-03-01": "nat",
  "2027-05-05": "etc",
  "2027-05-13": "etc",
  "2027-06-06": "etc",
  "2027-08-15": "nat",
  "2027-08-16": "etc",
  "2027-09-14": "chuseok",
  "2027-09-15": "chuseok",
  "2027-09-16": "chuseok",
  "2027-10-03": "nat",
  "2027-10-04": "etc",
  "2027-10-09": "nat",
  "2027-10-11": "etc",
  "2027-12-25": "etc",
  "2027-12-27": "etc",
};

const ymdOf = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
export const holidayKind = (at: Date): HolidayKind | undefined => HOLIDAYS[ymdOf(at)];

/** 휴관 원문으로 보아 오늘(공휴일·근로자의날) 닫는가 */
export function closedOnSpecialDay(closed: string | undefined, at: Date): boolean {
  if (!closed) return false;
  const t = closed.replace(/\s/g, "");
  if (at.getMonth() === 4 && at.getDate() === 1 && /근로자의날|노동절/.test(t)) return true;
  const kind = holidayKind(at);
  if (!kind) return false;
  // "일요일을 제외한 법정공휴일": 일요일과 겹친 공휴일은 문을 연다
  if (at.getDay() === 0 && /일요일을?제외한/.test(t)) return false;
  if (/공휴일|휴일/.test(t)) return true;
  if (kind === "nat" && /국경일/.test(t)) return true;
  if (kind === "seol" && /설날|설연휴|설당일|설명절|구정/.test(t)) return true;
  if (kind === "chuseok" && /추석/.test(t)) return true;
  if (kind === "new" && /신정|1월1일/.test(t)) return true;
  return false;
}

export function todaySlot(p: Place, at: Date): string | undefined {
  const d = at.getDay();
  const h = p.hrs;
  if (!h) return undefined;
  if (d === 0 || holidayKind(at)) return h.hol;
  if (d === 6) return h.sat ?? h.wd;
  return h.wd;
}

export function venueStatus(p: Place, at = new Date()): VenueStatus {
  if (p.closedDays?.includes(at.getDay())) return { open: false, text: "오늘 휴관" };
  if (closedOnSpecialDay(p.closed, at)) return { open: false, text: "오늘 휴관(공휴일)" };
  const slot = todaySlot(p, at);
  if (!slot) return { text: "" };
  const [a, b0] = slot.split("-");
  // 종료가 시작보다 이르면(자정 넘김·00:00) 하루 끝으로 본다
  const b = b0 <= a ? "24:00" : b0;
  const now = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (now < a) return { open: false, text: `${a} 문 열어요` };
  if (now >= b) return { open: false, text: "오늘 운영 끝" };
  return { open: true, text: `${b0 <= a ? "늦게까지" : `${b}까지`} 운영` };
}

export function hoursRows(p: Place): [string, string][] {
  const h = p.hrs;
  if (!h) return [];
  const rows: [string, string][] = [];
  if (h.wd) rows.push(["평일", h.wd.replace("-", " ~ ")]);
  if (h.sat && h.sat !== h.wd) rows.push(["토요일", h.sat.replace("-", " ~ ")]);
  if (h.hol) rows.push(["일·공휴일", h.hol.replace("-", " ~ ")]);
  return rows;
}
