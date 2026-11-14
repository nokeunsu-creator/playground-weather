import { describe, expect, it } from "vitest";
import { feelsLike, judge, pm10Grade, pm25Grade, type JudgeInput } from "./judge";

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
