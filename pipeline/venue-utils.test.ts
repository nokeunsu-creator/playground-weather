import { describe, expect, it } from "vitest";
import { childFee, closedWeekdays, isLongClosed, venueHours } from "./venue-utils";

describe("도서관·박물관 정리", () => {
  it("운영시간", () => {
    expect(venueHours("09:00", "18:00", "0900", "1700", "", "")).toEqual({ wd: "09:00-18:00", sat: "09:00-17:00", hol: undefined });
    expect(venueHours("00:00", "00:00")).toBeUndefined();
  });
  it("매주 휴관 요일만 뽑고 격주·n째주는 제외", () => {
    expect(closedWeekdays("매주 월요일+1월 1일+설날+추석날")).toEqual([1]);
    expect(closedWeekdays("매주 월요일, 화요일")).toEqual([1, 2]);
    expect(closedWeekdays("둘째·넷째 월요일+법정공휴일")).toBeUndefined();
    expect(closedWeekdays("연중무휴")).toBeUndefined();
    expect(closedWeekdays("화요일+일요일을 제외한 법정공휴일")).toEqual([2]);
    expect(closedWeekdays("토+일+법정공휴일")).toEqual([0, 6]);
    expect(closedWeekdays("매주월요일+국가지정공휴일")).toEqual([1]);
    expect(closedWeekdays("매주 월+국가지정공휴일")).toEqual([1]);
    expect(closedWeekdays("주말, 법정공휴일")).toEqual([0, 6]);
    expect(closedWeekdays("월(단, 월요일이 공휴일인 경우 당일은 개관하고 그 다음 첫번째 평일에 휴관)")).toEqual([1]);
  });
  it("장기 휴관 판별", () => {
    expect(isLongClosed("휴관중")).toBe(true);
    expect(isLongClosed("매주 월요일")).toBe(false);
  });
  it("어린이 관람료", () => {
    expect(childFee("0")).toBe("무료");
    expect(childFee("2000")).toBe("어린이 2,000원");
    expect(childFee("null")).toBeUndefined();
  });
});
