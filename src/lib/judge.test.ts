import { describe, expect, it } from "vitest";
import { currentInput, feelsLike, judge, pm10Grade, pm25Grade, type JudgeInput } from "./judge";

const base: JudgeInput = {
  temp: 20,
  feels: 20,
  reh: 50,
  wsd: 2,
  pop: 10,
  pty: 0,
  pm10: 25,
  pm25: 12,
  uv: 4,
  idx: {},
  hour: 10,
};
const kid = { age: "kid" as const, sensitive: false };
const infant = { age: "infant" as const, sensitive: false };

describe("judge", () => {
  it("맑고 온화하면 good", () => {
    const j = judge(base, kid);
    expect(j.level).toBe("good");
    expect(j.score).toBeGreaterThanOrEqual(90);
    expect(j.items).toContain("선크림");
  });
  it("초미세먼지 나쁨이면 bad + 마스크", () => {
    const j = judge({ ...base, pm25: 50 }, kid);
    expect(j.level).toBe("bad");
    expect(j.items.join()).toContain("마스크");
  });
  it("영아는 같은 조건에서 더 보수적", () => {
    const k = judge({ ...base, feels: 2, temp: 3 }, kid);
    const i = judge({ ...base, feels: 2, temp: 3 }, infant);
    expect(i.score).toBeLessThan(k.score);
  });
  it("비 오면 bad, 우비", () => {
    const j = judge({ ...base, pty: 1, rain: 2 }, kid);
    expect(j.level).toBe("bad");
    expect(j.items).toContain("우비·장화");
  });
  it("폭염 체감 36은 bad, 실내", () => {
    const j = judge({ ...base, temp: 34, feels: 36, reh: 60 }, kid);
    expect(j.level).toBe("bad");
    expect(j.maxMinutes).toBeLessThanOrEqual(20);
  });
  it("미세먼지 등급 경계", () => {
    expect(pm10Grade(30)).toBe(0);
    expect(pm10Grade(31)).toBe(1);
    expect(pm10Grade(81)).toBe(2);
    expect(pm25Grade(35)).toBe(1);
    expect(pm25Grade(36)).toBe(2);
    expect(pm25Grade(76)).toBe(3);
  });
  it("체감온도: 추운 날 바람이 있으면 더 낮다", () => {
    expect(feelsLike(0, 5, 50)).toBeLessThan(0);
    expect(feelsLike(20, 5, 50)).toBe(20);
    expect(feelsLike(33, 1, 80)).toBeGreaterThan(33);
  });
});

describe("판정 보완(2026-11-20 점검)", () => {
  it("good 이어도 자외선·추위가 정한 시간 제한을 지킨다", () => {
    const uv = judge({ ...base, temp: 24, feels: 24, uv: 9, hour: 12 }, infant);
    expect(uv.level).toBe("good");
    expect(uv.maxMinutes).toBeLessThanOrEqual(45);
    const cold = judge({ ...base, temp: 3, feels: 3, uv: 1 }, kid);
    expect(cold.maxMinutes).toBeLessThanOrEqual(60);
    // 감점이 없으면 그대로 넉넉하다
    expect(judge(base, kid).maxMinutes).toBeGreaterThanOrEqual(120);
  });
  it("밤 감점은 그 지역 일몰 기준(해 시각을 모르면 20시~7시)", () => {
    const sun = { rise: "07:18", set: "17:19" };
    const dark = (hour: number, minute?: number) => judge({ ...base, hour, minute, sun }, kid).reasons.some((r) => r.key === "night");
    expect(dark(17)).toBe(false); // 17시 칸(가운데 17:30)은 일몰 30분 안
    expect(dark(18)).toBe(true);
    expect(dark(17, 55)).toBe(true); // 지금 17:55
    expect(dark(6)).toBe(true);
    expect(dark(7)).toBe(false);
    expect(judge({ ...base, hour: 19 }, kid).reasons.some((r) => r.key === "night")).toBe(false);
    expect(judge({ ...base, hour: 20 }, kid).reasons.some((r) => r.key === "night")).toBe(true);
  });
});

describe("currentInput: 오래된 실황 대신 지금 시각 예보", () => {
  const snap = {
    sgg: "11680",
    fetchedAt: "2026-11-19T08:31:00Z",
    base: "x",
    now: { at: "2026-11-19T17:00", temp: 2.6, feels: -1.3, reh: 40, wsd: 2.5, pty: 3, rain: 0, pm10: 16, pm25: 8 },
    hours: [{ t: "2026-11-20T09:00", temp: -3, feels: -6, reh: 50, wsd: 2, pop: 0, pty: 0, sky: 1 }],
    days: [],
    idx: {},
  };
  it("실황이 1시간 넘게 지났고 예보행이 있으면 예보로", () => {
    const r = currentInput(snap, new Date(2026, 10, 20, 9, 10), "2026-11-20T09:00");
    expect(r?.fromForecast).toBe(true);
    expect(r?.input.temp).toBe(-3);
    expect(r?.input.pty).toBe(0); // 어제 저녁 눈(pty 3)을 끌고 오지 않는다
    expect(r?.input.pm25).toBe(8); // 미세먼지는 측정값 유지
  });
  it("실황이 최신이면 실황", () => {
    const r = currentInput(snap, new Date(2026, 10, 19, 17, 20), "2026-11-19T17:00");
    expect(r?.fromForecast).toBe(false);
    expect(r?.input.temp).toBe(2.6);
  });
  it("예보 범위도 벗어났으면 undefined(오래된 데이터 안내)", () => {
    expect(currentInput(snap, new Date(2026, 10, 22, 9, 0), "2026-11-22T09:00")).toBeUndefined();
  });
});
