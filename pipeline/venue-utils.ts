/** 도서관·박물관 표준데이터 정리 함수(운영시간·휴관 요일·관람료) */
import type { Place } from "../src/lib/types";

export function cleanText(v?: string | null): string | undefined {
  const s = (v ?? "").trim();
  return s && s !== "null" && s !== "-" ? s : undefined;
}
function hhmm(v?: string): string | undefined {
  const m = (v ?? "").match(/^(\d{1,2}):?(\d{2})/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function span(a?: string, b?: string): string | undefined {
  const x = hhmm(a);
  const y = hhmm(b);
  return x && y && x !== y ? `${x}-${y}` : undefined;
}
/** 평일·토요일·공휴일 운영시간("HH:MM-HH:MM"). 값이 없으면 필드 생략 */
export function venueHours(wo?: string, wc?: string, so?: string, sc?: string, ho?: string, hc?: string): Place["hrs"] {
  const h = { wd: span(wo, wc), sat: span(so, sc), hol: span(ho, hc) };
  return h.wd || h.sat || h.hol ? h : undefined;
}
/** "매주 월요일+1월 1일+설날" → [1]. 격주·n째주는 매주 휴관이 아니라 제외 */
export function closedWeekdays(text?: string | null): number[] | undefined {
  if (!text) return undefined;
  const out = new Set<number>();
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  // 괄호 안 단서("단, 공휴일이면 개관")는 쉼표가 섞여 있어 먼저 지운다
  for (const part of text.replace(/\([^)]*\)?/g, "").split(/[+,/·]|\s{2,}/)) {
    // "일요일을 제외한 법정공휴일" 처럼 제외를 말하는 부분과 격주·n째주는 매주 휴관이 아니다
    if (/째|격주|둘째|넷째|마지막|제외|빼고/.test(part)) continue;
    const t = part.replace(/매주|정기|휴관일?|\s/g, "");
    if (t === "주말") {
      out.add(0).add(6);
      continue;
    }
    // "토+일+법정공휴일", "매주 월" 처럼 요일 한 글자만 쓴 경우
    if (/^[일월화수목금토]$/.test(t)) {
      out.add(names.indexOf(t));
      continue;
    }
    if (!/매주|요일|휴관/.test(part)) continue;
    names.forEach((n, i) => {
      if (new RegExp(`${n}요일`).test(part)) out.add(i);
    });
  }
  return out.size ? [...out].sort() : undefined;
}
export function childFee(v?: string): string | undefined {
  const s = cleanText(v);
  if (s == null) return undefined;
  const n = Number(s.replace(/[^\d]/g, ""));
  if (/무료/.test(s) || (s.replace(/[^\d]/g, "") !== "" && n === 0)) return "무료";
  return Number.isFinite(n) && n > 0 ? `어린이 ${n.toLocaleString("ko-KR")}원` : s;
}


/** 장기 휴관·폐관 표시면 목록에서 뺀다 */
export function isLongClosed(text?: string | null): boolean {
  return /휴관중|휴관 중|임시휴관|장기휴관|폐관|리모델링/.test(text ?? "");
}
