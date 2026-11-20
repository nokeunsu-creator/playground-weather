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
  it("공휴일: 원문에 공휴일이 있으면 휴관, 없으면 일·공휴일 시간", () => {
    // 2026-05-05 어린이날(화)
    const legal = { ...lib, closedDays: [1], closed: "월요일+일요일을 제외한 법정공휴일" };
    expect(venueStatus(legal, at("2026-05-05", "11:00"))).toEqual({ open: false, text: "오늘 휴관(공휴일)" });
    expect(venueStatus({ ...lib, closed: "월요일" }, at("2026-05-05", "09:30")).text).toBe("10:00 문 열어요");
    // 2026-03-01 삼일절이 일요일: "일요일을 제외한 법정공휴일"이면 일요일 시간으로 연다
    expect(venueStatus(legal, at("2026-03-01", "11:00")).open).toBe(true);
    // 대체공휴일(2026-03-02 월)
    expect(venueStatus({ ...lib, closedDays: [], closed: "토+일요일+법정공휴일" }, at("2026-03-02", "11:00")).open).toBe(false);
  });
  it("설·추석 연휴, 국경일, 근로자의날", () => {
    const lunar = { ...lib, closedDays: [1], closed: "월+신정+설 연휴+추석 연휴" };
    expect(venueStatus(lunar, at("2026-02-17", "11:00")).open).toBe(false);
    expect(venueStatus(lunar, at("2026-09-24", "11:00")).open).toBe(false);
    expect(venueStatus(lunar, at("2026-05-05", "11:00")).open).toBe(true); // 어린이날은 원문에 없다
    expect(venueStatus({ ...lib, closedDays: [], closed: "국경일" }, at("2026-10-09", "11:00")).open).toBe(false);
    expect(venueStatus({ ...lib, closedDays: [], closed: "국경일" }, at("2026-05-05", "11:00")).open).toBe(true);
    expect(venueStatus({ ...lib, closedDays: [1], closed: "월+토+일+공휴일+근로자의날" }, at("2026-05-01", "11:00")).open).toBe(false);
  });
  it("자정까지·정보 없음", () => {
    expect(venueStatus({ ...lib, hrs: { wd: "09:00-00:00" } }, at("2026-11-17", "23:00")).open).toBe(true);
    expect(venueStatus({ ...lib, hrs: undefined }, at("2026-11-17", "10:00"))).toEqual({ text: "" });
  });
});
