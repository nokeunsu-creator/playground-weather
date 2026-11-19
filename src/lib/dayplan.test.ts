import { describe, expect, it } from "vitest";
import { dayPlan } from "./judge";
import type { WxHour, WxSnapshot } from "./types";

const kid = { age: "kid" as const, sensitive: false };

function hour(date: string, h: number, over: Partial<WxHour> = {}): WxHour {
  return { t: `${date}T${String(h).padStart(2, "0")}:00`, temp: 18, feels: 18, reh: 50, wsd: 2, pop: 0, pty: 0, sky: 1, uv: 3, ...over };
}
function snap(hours: WxHour[]): WxSnapshot {
  return {
    sgg: "11680",
    fetchedAt: "2026-11-19T00:00:00Z",
    base: "",
    now: { at: "", temp: 18, feels: 18, reh: 50, wsd: 2, pty: 0, rain: 0, pm10: 20, pm25: 10 },
    hours,
    days: [],
    idx: {},
  };
}
const D = "2026-11-19";

describe("dayPlan", () => {
  it("비 오는 시간을 피해 가장 좋은 2시간을 고른다", () => {
    const hs = [];
    for (let h = 0; h < 24; h++) hs.push(hour(D, h, h >= 9 && h <= 14 ? { pty: 1, rain: 2, pop: 90 } : {}));
    const p = dayPlan(snap(hs), kid, D);
    expect(p.cells[0].hour).toBe(7);
    expect(p.cells.at(-1)?.hour).toBe(19);
    expect(p.best?.level).toBe("good");
    expect(["07:00", "15:00", "16:00", "17:00"]).toContain(p.best?.start);
  });
  it("하루 종일 좋으면 이른 아침보다 낮 시간을 추천", () => {
    const hs = [];
    for (let h = 0; h < 24; h++) hs.push(hour(D, h));
    expect(dayPlan(snap(hs), kid, D).best?.start).toBe("09:00");
  });
  it("지나간 시간은 빼고 계산한다", () => {
    const hs = [];
    for (let h = 0; h < 24; h++) hs.push(hour(D, h, h >= 15 ? { pty: 1, rain: 3, pop: 90 } : {}));
    const p = dayPlan(snap(hs), kid, D, `${D}T15:00`);
    expect(p.cells.every((c) => c.hour >= 15)).toBe(true);
    expect(p.best?.level).toBe("bad");
    expect(p.best?.reason).toContain("비");
  });
  it("남은 시간이 한 시간이면 1시간 구간", () => {
    const hs = [hour(D, 19), hour(D, 20)];
    const p = dayPlan(snap(hs), kid, D, `${D}T19:00`);
    expect(p.best).toMatchObject({ start: "19:00", end: "20:00" });
  });
  it("놀이 시간이 끝났으면 비어 있다", () => {
    const p = dayPlan(snap([hour(D, 20), hour(D, 21)]), kid, D, `${D}T20:00`);
    expect(p.cells).toHaveLength(0);
    expect(p.best).toBeUndefined();
  });
});
