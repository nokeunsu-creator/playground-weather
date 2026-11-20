import { describe, expect, it } from "vitest";
import { isDark, sunTimes, toHm } from "./sun";

describe("toHm", () => {
  it("반올림을 먼저 해서 '06:60'이 나오지 않는다", () => {
    expect(toHm(419.6)).toBe("07:00");
    expect(toHm(1079.5)).toBe("18:00");
    expect(toHm(1439.7)).toBe("00:00");
    expect(toHm(605)).toBe("10:05");
  });
  it("1년 내내 해 시각에 60분이 없다", () => {
    for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
      const s = sunTimes(d.toISOString().slice(0, 10), 37.5665, 126.978)!;
      expect(s.rise).toMatch(/^\d\d:[0-5]\d$/);
      expect(s.set).toMatch(/^\d\d:[0-5]\d$/);
    }
  });
});

describe("isDark", () => {
  it("해 시각을 모르면 20시~7시", () => {
    expect(isDark(19, undefined)).toBe(false);
    expect(isDark(20, undefined)).toBe(true);
    expect(isDark(6, undefined)).toBe(true);
  });
});
