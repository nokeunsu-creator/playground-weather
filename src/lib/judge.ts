/**
 * 아이 외출 판정 엔진.
 * 입력: 한 시점의 날씨/대기/지수 + 아이 프로필 → 점수(0~100), 등급, 이유, 옷차림, 준비물.
 * 기준 출처: 환경부 미세먼지 등급, 기상청 자외선 단계, 질병청 폭염·한파 영유아 권고를 보수적으로 적용.
 */
import type { AgeGroup, ChildProfile, WxHour, WxIndex, WxNow, WxSnapshot } from "./types";

export type Level = "good" | "caution" | "bad";

export interface JudgeInput {
  temp: number;
  feels: number;
  reh: number;
  wsd: number;
  pop: number;
  pty: number;
  rain?: number;
  sky?: number;
  pm10?: number;
  pm25?: number;
  uv?: number;
  idx: WxIndex;
  /** 0~23 */
  hour: number;
}

export interface Reason {
  key: string;
  text: string;
  /** 감점 */
  penalty: number;
  level: Level;
}

export interface Judgement {
  score: number;
  level: Level;
  headline: string;
  reasons: Reason[];
  outfit: string[];
  items: string[];
  /** 권장 야외 활동 시간(분). 0이면 실내 권장 */
  maxMinutes: number;
}

export const LEVEL_LABEL: Record<Level, string> = {
  good: "나가도 좋아요",
  caution: "짧게 다녀와요",
  bad: "오늘은 실내 추천",
};
export const LEVEL_EMOJI: Record<Level, string> = { good: "🟢", caution: "🟡", bad: "🔴" };

export function pm10Grade(v?: number): 0 | 1 | 2 | 3 | undefined {
  if (v == null) return undefined;
  return v <= 30 ? 0 : v <= 80 ? 1 : v <= 150 ? 2 : 3;
}
export function pm25Grade(v?: number): 0 | 1 | 2 | 3 | undefined {
  if (v == null) return undefined;
  return v <= 15 ? 0 : v <= 35 ? 1 : v <= 75 ? 2 : 3;
}
export const PM_LABEL = ["좋음", "보통", "나쁨", "매우나쁨"];

export function uvLabel(uv: number): string {
  return uv < 3 ? "낮음" : uv < 6 ? "보통" : uv < 8 ? "높음" : uv < 11 ? "매우높음" : "위험";
}

/** 체감온도: 추울 때(≤10℃, 바람) 풍속냉각식, 더울 때(≥27℃) 습구온도 기반 근사(기상청 여름 체감온도) */
export function feelsLike(temp: number, wsd: number, reh: number): number {
  const kmh = wsd * 3.6;
  if (temp <= 10 && kmh >= 4.8) {
    const v = Math.pow(kmh, 0.16);
    return Math.round((13.12 + 0.6215 * temp - 11.37 * v + 0.3965 * temp * v) * 10) / 10;
  }
  if (temp >= 27) {
    const tw =
      temp * Math.atan(0.151977 * Math.sqrt(reh + 8.313659)) +
      Math.atan(temp + reh) -
      Math.atan(reh - 1.67633) +
      0.00391838 * Math.pow(reh, 1.5) * Math.atan(0.023101 * reh) -
      4.686035;
    const f = -0.2442 + 0.55399 * tw + 0.45535 * temp - 0.0022 * tw * tw + 0.00278 * tw * temp + 3.0;
    return Math.round(f * 10) / 10;
  }
  return temp;
}

export const AGE_LABEL: Record<AgeGroup, string> = { infant: "0~2세", toddler: "3~6세", kid: "7세 이상" };

export function judge(input: JudgeInput, child: ChildProfile): Judgement {
  const reasons: Reason[] = [];
  const outfit: string[] = [];
  const items: string[] = [];
  const strict = child.age === "infant" ? 1.3 : child.age === "toddler" ? 1.1 : 1.0;
  const sens = child.sensitive ? 1.25 : 1.0;
  let maxMinutes = 180;

  const add = (key: string, text: string, penalty: number, level: Level) => {
    reasons.push({ key, text, penalty: Math.round(penalty), level });
  };

  // ---- 강수 ----
  if (input.pty > 0 && (input.rain ?? 1) > 0) {
    const snow = input.pty === 3 || input.pty === 2;
    add("rain", snow ? "눈이 와요" : "비가 와요", input.pty === 4 ? 30 : 45, "bad");
    items.push(snow ? "방수 장갑·부츠" : "우비·장화");
    maxMinutes = Math.min(maxMinutes, 30);
  } else if (input.pop >= 60) {
    add("pop", `비 올 확률 ${input.pop}%`, 18, "caution");
    items.push("접이식 우산");
  } else if (input.pop >= 40) {
    add("pop", `비 올 확률 ${input.pop}%`, 8, "caution");
    items.push("접이식 우산");
  }

  // ---- 체감온도 ----
  const f = Math.round(input.feels);
  if (f <= -10) {
    add("cold", `체감 ${f}℃, 한파 수준`, 55 * strict, "bad");
    maxMinutes = Math.min(maxMinutes, 0);
  } else if (f <= -3) {
    add("cold", `체감 ${f}℃, 많이 추워요`, 32 * strict, "caution");
    maxMinutes = Math.min(maxMinutes, 30);
  } else if (f <= 4) {
    add("cold", `체감 ${f}℃, 쌀쌀해요`, 14 * strict, "caution");
    maxMinutes = Math.min(maxMinutes, 60);
  } else if (f >= 35) {
    add("heat", `체감 ${f}℃, 폭염 수준`, 55 * strict, "bad");
    maxMinutes = Math.min(maxMinutes, 0);
  } else if (f >= 31) {
    add("heat", `체감 ${f}℃, 매우 더워요`, 32 * strict, "caution");
    maxMinutes = Math.min(maxMinutes, 30);
  } else if (f >= 28) {
    add("heat", `체감 ${f}℃, 더워요`, 12 * strict, "caution");
    maxMinutes = Math.min(maxMinutes, 60);
  }

  // 옷차림(실제 기온 기준)
  const t = input.temp;
  if (t <= 0) outfit.push("두꺼운 패딩", "내복", "모자·목도리·장갑");
  else if (t <= 5) outfit.push("패딩·두꺼운 외투", "내복", "모자·장갑");
  else if (t <= 9) outfit.push("두꺼운 외투", "긴팔·긴바지", "목도리");
  else if (t <= 14) outfit.push("자켓·가디건", "긴팔·긴바지");
  else if (t <= 19) outfit.push("얇은 외투", "긴팔");
  else if (t <= 23) outfit.push("긴팔 또는 반팔", "얇은 겉옷 하나");
  else if (t <= 27) outfit.push("반팔·반바지");
  else outfit.push("얇은 반팔", "통풍 잘 되는 옷");

  // ---- 바람 ----
  if (input.wsd >= 9) {
    add("wind", `바람 ${input.wsd}m/s, 강풍`, 20 * strict, "caution");
  } else if (input.wsd >= 6) {
    add("wind", `바람 ${input.wsd}m/s, 꽤 불어요`, 8, "caution");
  }

  // ---- 미세먼지 ----
  const g10 = pm10Grade(input.pm10);
  const g25 = pm25Grade(input.pm25);
  const g = Math.max(g10 ?? 0, g25 ?? 0) as 0 | 1 | 2 | 3;
  const hasPm = g10 != null || g25 != null;
  if (hasPm) {
    const which = (g25 ?? 0) >= (g10 ?? 0) ? `초미세먼지 ${input.pm25}` : `미세먼지 ${input.pm10}`;
    if (g === 3) {
      add("pm", `${which}, 매우나쁨`, 60 * sens, "bad");
      maxMinutes = Math.min(maxMinutes, 0);
    } else if (g === 2) {
      add("pm", `${which}, 나쁨`, 35 * sens * (child.age === "infant" ? 1.2 : 1), "bad");
      items.push("KF80 이상 마스크");
      maxMinutes = Math.min(maxMinutes, 30);
    } else if (g === 1) {
      const upper = (input.pm25 ?? 0) > 25 || (input.pm10 ?? 0) > 55;
      if (upper && (child.sensitive || child.age === "infant")) {
        add("pm", `${which}, 보통(상단)`, 10, "caution");
        items.push("마스크(민감군)");
      }
    }
  }

  // ---- 자외선 ----
  const uv = input.uv ?? (input.hour >= 10 && input.hour <= 15 ? input.idx.uvMax : undefined);
  if (uv != null) {
    if (uv >= 8) {
      add("uv", `자외선 ${uv}, ${uvLabel(uv)}`, 18 * strict, "caution");
      items.push("선크림·모자·그늘 필수");
      maxMinutes = Math.min(maxMinutes, 45);
    } else if (uv >= 6) {
      add("uv", `자외선 ${uv}, 높음`, 8, "caution");
      items.push("선크림·모자");
    } else if (uv >= 3) {
      items.push("선크림");
    }
  }

  // ---- 꽃가루 ----
  if (input.idx.pollen != null && input.idx.pollen >= 2) {
    add(
      "pollen",
      input.idx.pollen >= 3 ? "꽃가루 매우 많음" : "꽃가루 많음",
      (input.idx.pollen >= 3 ? 18 : 8) * sens,
      "caution",
    );
    if (child.sensitive) items.push("알레르기약·마스크");
  }

  // ---- 감기가능지수 / 천식 ----
  if (input.idx.cold != null && input.idx.cold >= 2) {
    add(
      "coldidx",
      input.idx.cold >= 3 ? "감기 걸리기 매우 쉬운 날씨" : "감기 걸리기 쉬운 날씨",
      input.idx.cold >= 3 ? 10 : 5,
      "caution",
    );
    items.push("여벌 겉옷");
  }
  if (child.sensitive && input.idx.asthma != null && input.idx.asthma >= 2) {
    add("asthma", "천식·호흡기 주의 지수 높음", 12, "caution");
  }

  // ---- 밤 ----
  if (input.hour < 7 || input.hour >= 20) {
    add("night", "해 진 뒤에는 놀이터보다 실내가 좋아요", 10, "caution");
  }

  // 아이 공통 준비물
  items.push("물");
  if (input.temp >= 24 && input.pty === 0) items.push("여벌 옷·수건");

  const penalty = reasons.reduce((s, r) => s + r.penalty, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const hasBad = reasons.some((r) => r.level === "bad");
  const level: Level = hasBad || score < 40 ? "bad" : score >= 70 ? "good" : "caution";
  if (level === "good") maxMinutes = Math.max(maxMinutes, 120);
  if (level === "bad") maxMinutes = Math.min(maxMinutes, 20);

  const sorted = reasons.sort((a, b) => b.penalty - a.penalty);
  const headline =
    level === "good"
      ? sorted.length === 0
        ? "완벽한 놀이터 날씨예요"
        : "나가도 좋아요"
      : level === "caution"
        ? `${sorted[0]?.text ?? "조심해서"}. 짧게 다녀와요`
        : `${sorted[0]?.text ?? ""}. 오늘은 실내 추천`;

  return { score, level, headline, reasons: sorted, outfit: dedupe(outfit), items: dedupe(items), maxMinutes };
}

function dedupe<T>(a: T[]): T[] {
  return [...new Set(a)];
}

export function inputFromNow(now: WxNow, hourRow: WxHour | undefined, idx: WxIndex, at: Date): JudgeInput {
  return {
    temp: now.temp,
    feels: now.feels ?? feelsLike(now.temp, now.wsd, now.reh),
    reh: now.reh,
    wsd: now.wsd,
    pop: hourRow?.pop ?? 0,
    pty: now.pty,
    rain: now.rain,
    sky: hourRow?.sky,
    pm10: now.pm10,
    pm25: now.pm25,
    uv: hourRow?.uv,
    idx,
    hour: at.getHours(),
  };
}

export function inputFromHour(h: WxHour, now: WxNow, idx: WxIndex): JudgeInput {
  return {
    temp: h.temp,
    feels: h.feels ?? feelsLike(h.temp, h.wsd, h.reh),
    reh: h.reh,
    wsd: h.wsd,
    pop: h.pop,
    pty: h.pty,
    rain: h.rain,
    sky: h.sky,
    // 미세먼지 예보는 없으므로 현재값 유지
    pm10: now.pm10,
    pm25: now.pm25,
    uv: h.uv,
    idx,
    hour: Number(h.t.slice(11, 13)),
  };
}

export interface BestWindow {
  start: string;
  end: string;
  score: number;
  level: Level;
}

/** 오늘 07~19시 중 2시간 창의 평균 점수가 가장 높은 구간 */
export function bestWindow(snap: WxSnapshot, child: ChildProfile, today: string): BestWindow | undefined {
  const rows = snap.hours
    .filter((h) => h.t.startsWith(today))
    .filter((h) => {
      const hh = Number(h.t.slice(11, 13));
      return hh >= 7 && hh <= 19;
    });
  if (rows.length < 2) return undefined;
  const scores = rows.map((h) => judge(inputFromHour(h, snap.now, snap.idx), child));
  let best: BestWindow | undefined;
  for (let i = 0; i < rows.length - 1; i++) {
    const s = (scores[i].score + scores[i + 1].score) / 2;
    if (!best || s > best.score) {
      const a = scores[i].level;
      const b = scores[i + 1].level;
      const lv: Level = a === "bad" || b === "bad" ? "bad" : a === "caution" || b === "caution" ? "caution" : "good";
      best = {
        start: rows[i].t.slice(11, 16),
        end: `${String(Number(rows[i + 1].t.slice(11, 13)) + 1).padStart(2, "0")}:00`,
        score: Math.round(s),
        level: lv,
      };
    }
  }
  return best;
}
