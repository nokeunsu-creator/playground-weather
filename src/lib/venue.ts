/** 도서관·박물관 "지금 운영 중" 계산. 공휴일 달력은 없어 일요일만 공휴일 시간으로 본다. */
import type { Place } from "./types";

export interface VenueStatus {
  /** true 운영 중, false 닫힘, undefined 정보 없음 */
  open?: boolean;
  text: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function todaySlot(p: Place, at: Date): string | undefined {
  const d = at.getDay();
  const h = p.hrs;
  if (!h) return undefined;
  if (d === 0) return h.hol;
  if (d === 6) return h.sat ?? h.wd;
  return h.wd;
}

export function venueStatus(p: Place, at = new Date()): VenueStatus {
  if (p.closedDays?.includes(at.getDay())) return { open: false, text: "오늘 휴관" };
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
