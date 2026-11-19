import { describe, expect, it } from "vitest";
import { buildEveningText } from "./notify";
import type { WxHour, WxSnapshot } from "./types";

const kid = { age: "toddler" as const, sensitive: false };
const T = "2026-11-20";
const hour = (h: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${T}T${String(h).padStart(2, "0")}:00`, temp: 12 + (h > 12 ? 3 : 0), feels: 12, reh: 50, wsd: 2, pop: 0, pty: 0, sky: 1, uv: 3, ...over });
const snap = (hours: WxHour[]): WxSnapshot => ({
  sgg: "11680",
  fetchedAt: "",
  base: "",
  now: { at: "", temp: 10, feels: 10, reh: 50, wsd: 2, pty: 0, rain: 0, pm10: 20, pm25: 10 },
  hours,
  days: [],
  idx: {},
});
const fire = new Date(2026, 10, 19, 20, 0); // 11-19 20:00 → 내일 11-20

describe("buildEveningText", () => {
  it("좋은 날: 가장 좋은 시간·기온 범위·옷차림", () => {
    const hs = Array.from({ length: 24 }, (_, h) => hour(h));
    const t = buildEveningText(snap(hs), kid, fire, "강남구");
    expect(t.title).toBe("강남구 내일 아이 외출 계획");
    expect(t.body).toContain("내일은 9~11시가 가장 좋아요");
    expect(t.body).toContain("12°~15°");
  });
  it("종일 비: 실내 추천과 도서관·박물관 안내", () => {
    const hs = Array.from({ length: 24 }, (_, h) => hour(h, { pty: 1, rain: 3, pop: 90 }));
    const t = buildEveningText(snap(hs), kid, fire, "강남구");
    expect(t.body).toContain("내일은 실내 놀이 추천");
    expect(t.body).toContain("도서관·박물관");
  });
  it("내일 예보가 없으면 앱 열기 안내", () => {
    expect(buildEveningText(snap([]), kid, fire, "강남구").body).toContain("앱을 열어");
  });
});
