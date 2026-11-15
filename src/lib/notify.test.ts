import { describe, expect, it } from "vitest";
import { buildMorningText, nextFireDate } from "./notify";
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
});

describe("buildMorningText", () => {
  const snap: WxSnapshot = {
    sgg: "11680",
    fetchedAt: "2026-11-15T00:00:00Z",
    base: "x",
    now: { at: "2026-11-15T07:00", temp: 5, feels: 3, reh: 50, wsd: 2, pty: 0, rain: 0, pm10: 20, pm25: 10 },
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
});
