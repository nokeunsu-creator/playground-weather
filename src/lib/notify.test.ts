import { describe, expect, it } from "vitest";
import { buildEveningText, buildMorningText, fireDates, nextFireDate, NOTIFY_DAYS } from "./notify";
import type { WxSnapshot } from "./types";

describe("nextFireDate", () => {
  it("오늘 시각이 아직 안 지났으면 오늘", () => {
    const now = new Date(2026, 10, 15, 6, 0);
    const d = nextFireDate(7, 30, now);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(30);
  });
  it("지났으면 내일", () => {
    const now = new Date(2026, 10, 15, 9, 0);
    expect(nextFireDate(7, 30, now).getDate()).toBe(16);
  });
  it("7일치를 하루 간격으로(월말 넘김 포함)", () => {
    const ds = fireDates(7, 30, new Date(2026, 10, 27, 9, 0));
    expect(ds).toHaveLength(NOTIFY_DAYS);
    expect(ds.map((d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`)).toEqual([
      "11/28 7:30",
      "11/29 7:30",
      "11/30 7:30",
      "12/1 7:30",
      "12/2 7:30",
      "12/3 7:30",
      "12/4 7:30",
    ]);
  });
});

describe("buildMorningText", () => {
  const snap: WxSnapshot = {
    sgg: "11680",
    fetchedAt: "2026-11-15T00:00:00Z",
    base: "x",
    now: { at: "2026-11-15T07:00", temp: 5, feels: 3, reh: 50, wsd: 2, pty: 0, rain: 0, pm10: 20, pm25: 10, pmAt: "2026-11-15 06:00" },
    hours: [
      { t: "2026-11-15T08:00", temp: 6, feels: 4, reh: 50, wsd: 2, pop: 10, pty: 0, sky: 1 },
      { t: "2026-11-15T09:00", temp: 8, feels: 7, reh: 50, wsd: 2, pop: 10, pty: 0, sky: 1 },
    ],
    days: [],
    idx: {},
  };
  it("알림 1시간 뒤 예보로 판정 문구를 만든다", () => {
    const fireAt = new Date(2026, 10, 15, 7, 0);
    const t = buildMorningText(snap, { age: "toddler", sensitive: false }, fireAt, "강남구");
    expect(t.title).toContain("강남구");
    expect(t.body).toMatch(/🟢|🟡|🔴/);
    expect(t.body).toContain("6℃");
    expect(t.body).toContain("미세먼지 좋음");
  });
  it("해당 시각 예보가 없으면 안내 문구", () => {
    const t = buildMorningText({ ...snap, hours: [] }, { age: "kid", sensitive: false }, new Date(2026, 10, 20, 7, 0), "강남구");
    expect(t.body).toContain("앱을 열어");
  });
  it("미세먼지 측정이 12시간 넘게 지났으면 넣지 않는다", () => {
    const stale = { ...snap, now: { ...snap.now, pmAt: "2026-11-14 17:00" } };
    const t = buildMorningText(stale, { age: "toddler", sensitive: false }, new Date(2026, 10, 15, 7, 0), "강남구");
    expect(t.body).toContain("6℃");
    expect(t.body).not.toContain("미세먼지");
  });
});

describe("buildEveningText", () => {
  const hours = (date: string, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ t: `${date}T${String(from + i).padStart(2, "0")}:00`, temp: 5 + i, feels: 5 + i, reh: 50, wsd: 1, pop: 0, pty: 0, sky: 1 }));
  const base: WxSnapshot = {
    sgg: "11680",
    fetchedAt: "2026-11-20T08:00:00Z",
    base: "x",
    now: { at: "2026-11-20T17:00", temp: 5, feels: 5, reh: 50, wsd: 1, pty: 0, rain: 0 },
    hours: [],
    days: [],
    idx: {},
  };
  const fireAt = new Date(2026, 10, 20, 20, 0);
  it("내일 하루 예보가 다 있으면 가장 좋은 시간과 기온 범위", () => {
    const t = buildEveningText({ ...base, hours: hours("2026-11-21", 0, 23) }, { age: "kid", sensitive: false }, fireAt, "강남구");
    expect(t.body).toMatch(/내일은 \d+~\d+시가/);
    expect(t.body).toContain("5°~28°");
  });
  it("내일 놀이 시간(07~19시) 예보가 일부만 있으면 일반 문구", () => {
    const t = buildEveningText({ ...base, hours: hours("2026-11-21", 0, 9) }, { age: "kid", sensitive: false }, fireAt, "강남구");
    expect(t.body).toBe("앱을 열어 내일 날씨를 확인하세요");
  });
});
