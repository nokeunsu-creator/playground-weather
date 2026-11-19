import { describe, expect, it } from "vitest";
import { venueStatus } from "./venue";
import type { Place } from "./types";

const lib: Place = { id: "lb:1", kind: "venue", name: "어린이도서관", lat: 37, lng: 127, addr: "", sgg: "11680", hrs: { wd: "09:00-18:00", sat: "09:00-17:00", hol: "10:00-17:00" }, closedDays: [1] };
// 2026-11-17 화요일, 11-16 월요일, 11-22 일요일
const at = (d: string, t: string) => new Date(`${d}T${t}:00`);

describe("venueStatus", () => {
  it("평일 운영 중/전/후", () => {
    expect(venueStatus(lib, at("2026-11-17", "10:30"))).toEqual({ open: true, text: "18:00까지 운영" });
    expect(venueStatus(lib, at("2026-11-17", "08:00")).text).toBe("09:00 문 열어요");
    expect(venueStatus(lib, at("2026-11-17", "18:00")).text).toBe("오늘 운영 끝");
  });
  it("정기 휴관 요일", () => {
    expect(venueStatus(lib, at("2026-11-16", "10:30"))).toEqual({ open: false, text: "오늘 휴관" });
  });
  it("일요일은 공휴일 시간", () => {
    expect(venueStatus(lib, at("2026-11-22", "09:30")).text).toBe("10:00 문 열어요");
  });
  it("자정까지·정보 없음", () => {
    expect(venueStatus({ ...lib, hrs: { wd: "09:00-00:00" } }, at("2026-11-17", "23:00")).open).toBe(true);
    expect(venueStatus({ ...lib, hrs: undefined }, at("2026-11-17", "10:00"))).toEqual({ text: "" });
  });
});
