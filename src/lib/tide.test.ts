import { describe, expect, it } from "vitest";
import { dayLabel, digWindows, indexLevel, spotDay, sunTimes, weekRanges } from "./tide";
import type { MudflatSpot, TideEvent, TideStation } from "./types";

const min = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

describe("해 뜨는·지는 시각", () => {
  it("서울 11월 20일 ≈ 07:15 / 17:17", () => {
    const s = sunTimes("2026-11-20", 37.5665, 126.978)!;
    expect(Math.abs(min(s.rise) - min("07:15"))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(s.set) - min("17:17"))).toBeLessThanOrEqual(6);
  });
  it("서울 하지 ≈ 05:11 / 19:57", () => {
    const s = sunTimes("2026-06-21", 37.5665, 126.978)!;
    expect(Math.abs(min(s.rise) - min("05:11"))).toBeLessThanOrEqual(6);
    expect(Math.abs(min(s.set) - min("19:57"))).toBeLessThanOrEqual(6);
  });
});

const ev = (t: string, h: number, type: "high" | "low"): TideEvent => ({ t: `2026-11-21T${t}`, h, type });

describe("조개 캐기 권장 시간", () => {
  const sun = { rise: "07:15", set: "17:17" };
  it("저조 2시간 전 ~ 1시간 후", () => {
    expect(digWindows([ev("11:20", 690, "high"), ev("13:30", 60, "low")], sun)).toEqual([{ start: "11:30", end: "14:30", low: "13:30", lowH: 60 }]);
  });
  it("해 있는 시간으로 자르고 1시간 미만이면 뺀다", () => {
    expect(digWindows([ev("07:40", 40, "low")], sun)).toEqual([{ start: "07:15", end: "08:40", low: "07:40", lowH: 40 }]);
    expect(digWindows([ev("05:30", 40, "low"), ev("18:40", 50, "low")], sun)).toEqual([]);
    expect(digWindows([ev("18:10", 50, "low")], sun)).toEqual([{ start: "16:10", end: "17:17", low: "18:10", lowH: 50 }]);
  });
});

const st: TideStation = {
  code: "DT_0001",
  name: "인천",
  lat: 37.45,
  lng: 126.59,
  events: [
    { t: "2026-11-20T05:00", h: 900, type: "high" },
    { t: "2026-11-20T11:30", h: 20, type: "low" },
    { t: "2026-11-21T06:00", h: 700, type: "high" },
    { t: "2026-11-21T12:40", h: 150, type: "low" },
    { t: "2026-11-22T07:00", h: 520, type: "high" },
    { t: "2026-11-22T13:50", h: 250, type: "low" },
  ],
};

describe("이번 주 조차 등급", () => {
  it("가장 큰 날 big, 절반 남짓이면 small", () => {
    const r = weekRanges(st, ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
    expect(r["2026-11-20"]).toEqual({ range: 880, cls: "big" });
    expect(r["2026-11-21"]?.cls).toBe("mid");
    expect(r["2026-11-22"]?.cls).toBe("small");
    expect(r["2026-11-23"]).toBeUndefined();
  });
});

describe("장소 하루 정리", () => {
  const base: MudflatSpot = { id: "x", name: "선재도", lat: 37.24, lng: 126.51, src: "village", station: "DT_0001" };
  it("갯벌체험지수가 있으면 그 체험 시간을 쓴다", () => {
    const d = spotDay({ ...base, src: "khoa", fcst: [{ date: "2026-11-20", start: "10:00", end: "13:30", index: "매우좋음" }] }, { DT_0001: st }, "2026-11-20");
    expect(d.from).toBe("index");
    expect(d.windows[0]).toMatchObject({ start: "10:00", end: "13:30", low: "11:30" });
    expect(d.level).toBe("good");
  });
  it("없으면 물때로 계산", () => {
    const d = spotDay(base, { DT_0001: st }, "2026-11-21");
    expect(d.from).toBe("tide");
    expect(d.windows[0]).toMatchObject({ start: "10:40", end: "13:40", low: "12:40" });
  });
  it("물때도 없으면 none", () => {
    expect(spotDay({ ...base, station: undefined }, {}, "2026-11-21").from).toBe("none");
  });
  it("체험불가(00:00~00:00)면 물때로 다시 계산해 권하지 않는다", () => {
    // 2026-11-20 실제 응답 모양: totalIndex 체험불가, 체험 시각 00:00~00:00
    const fcst = [{ date: "2026-11-21", start: "00:00", end: "00:00", index: "체험불가", weather: "흐림", wmax: 13.9 }];
    const d = spotDay({ ...base, src: "khoa", fcst }, { DT_0001: st }, "2026-11-21");
    expect(d.from).toBe("closed");
    expect(d.windows).toEqual([]);
    expect(d.level).toBe("bad");
    expect(d.events.length).toBeGreaterThan(0); // 물때 표는 그대로 보여 줄 수 있다
  });
  it("지수 등급·날짜 라벨", () => {
    expect(indexLevel("매우나쁨")).toBe("bad");
    expect(indexLevel("체험불가")).toBe("bad");
    expect(indexLevel("보통")).toBe("caution");
    expect(dayLabel("2026-11-21", "2026-11-20")).toBe("내일");
    expect(dayLabel("2026-11-22", "2026-11-20")).toBe("일 11/22");
  });
});

describe("오늘 지난 체험 시간", () => {
  it("끝난 시간은 빼고, 다 끝나면 past", async () => {
    const { upcoming } = await import("./tide");
    const d = { date: "2026-11-20", windows: [{ start: "05:00", end: "08:00" }, { start: "15:00", end: "17:00" }], from: "tide" as const, events: [] };
    expect(upcoming(d, "2026-11-20", "10:00")).toEqual({ windows: [{ start: "15:00", end: "17:00" }], past: false });
    expect(upcoming(d, "2026-11-20", "17:30")).toEqual({ windows: [], past: true });
    expect(upcoming(d, "2026-11-21", "17:30").past).toBe(false);
  });
});
