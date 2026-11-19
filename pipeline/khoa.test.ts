import { describe, expect, it } from "vitest";
import { groupMudflat, hhmm, itemsOf, mudflatPrograms, parseTide, safeTel, safeUrl, ymd } from "./sources/khoa";

describe("KHOA 응답 파싱", () => {
  it("item 꺼내기: response 감싸기·단일 객체·오류 코드", () => {
    expect(itemsOf({ response: { header: { resultCode: "00" }, body: { items: { item: [{ a: 1 }] } } } })).toHaveLength(1);
    expect(itemsOf({ header: { resultCode: "00" }, body: { items: { item: { a: 1 } } } })).toHaveLength(1);
    expect(itemsOf({ header: { resultCode: "00" }, body: { items: "" } })).toEqual([]);
    expect(() => itemsOf({ header: { resultCode: "03", resultMsg: "NODATA" } })).toThrow(/03/);
  });
  it("날짜·시각 형식", () => {
    expect(ymd("20261120")).toBe("2026-11-20");
    expect(ymd("2026-11-20")).toBe("2026-11-20");
    expect(hhmm("1030")).toBe("10:30");
    expect(hhmm("9:05")).toBe("09:05");
    expect(hhmm("10:30:00")).toBe("10:30");
    expect(hhmm("")).toBeUndefined();
  });
  it("갯벌체험지수를 장소별 7일로 묶는다", () => {
    const base = { mdftExpcnVlgNm: "선재도", lat: 37.24, lot: 126.51, minArtmp: "3", maxArtmp: "11", maxWspd: "4.2", weather: "맑음", totalIndex: "좋음", lastScr: 80 };
    const g = groupMudflat([
      { ...base, predcYmd: "20261121", mdftExprnBgngTm: "11:00", mdftExprnEndTm: "14:30" },
      { ...base, predcYmd: "20261120", mdftExprnBgngTm: "1015", mdftExprnEndTm: "1340" },
      { ...base, predcYmd: "20261120", mdftExprnBgngTm: "1015", mdftExprnEndTm: "1340" },
      { mdftExpcnVlgNm: "", lat: 1, lot: 1, predcYmd: "20261120" },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].fcst.map((f) => f.date)).toEqual(["2026-11-20", "2026-11-21"]);
    expect(g[0].fcst[0]).toMatchObject({ start: "10:15", end: "13:40", index: "좋음", score: 80, tmax: 11, wmax: 4.2 });
  });
  it("고조·저조(극치구분 1~4)", () => {
    const r = parseTide([
      { obsvtrNm: "인천", lat: 37.45, lot: 126.59, predcDt: "2026-11-20 17:40", predcTdlvVl: 88.4, extrSe: 4 },
      { obsvtrNm: "인천", lat: 37.45, lot: 126.59, predcDt: "202611200512", predcTdlvVl: 32, extrSe: "2" },
      { obsvtrNm: "인천", lat: 37.45, lot: 126.59, predcDt: "2026-11-20 11:20:00", predcTdlvVl: 689, extrSe: 1 },
      { predcDt: "bad", predcTdlvVl: 1, extrSe: 1 },
    ]);
    expect(r).toMatchObject({ lat: 37.45, lng: 126.59, name: "인천" });
    expect(r.events).toEqual([
      { t: "2026-11-20T05:12", h: 32, type: "low" },
      { t: "2026-11-20T11:20", h: 689, type: "high" },
      { t: "2026-11-20T17:40", h: 88, type: "low" },
    ]);
  });
});

describe("체험마을 정리", () => {
  it("갯벌 관련 프로그램만", () => {
    expect(mudflatPrograms("갯벌생태체험+꽃차체험+바지락캐기+선상낚시")).toEqual(["갯벌생태체험", "바지락캐기"]);
    expect(mudflatPrograms("소라미역국만들기+감자전")).toEqual([]);
    expect(mudflatPrograms("실리카머드축제+모내기심고머드팩즐기기")).toEqual([]);
  });
  it("홈페이지는 http(s)만, 전화는 숫자·하이픈만", () => {
    expect(safeUrl("www.example.kr")).toBe("https://www.example.kr/");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("null")).toBeUndefined();
    expect(safeTel("041-123-4567")).toBe("041-123-4567");
    expect(safeTel("문의")).toBeUndefined();
  });
});
