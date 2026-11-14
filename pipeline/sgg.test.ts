import { describe, expect, it } from "vitest";
import { addrForGeocode, matchSgg, matchSido, normalizeAddr, SGG } from "./sgg";

const byFull = (full: string) => SGG.find((s) => s.full === full)?.code;

describe("matchSgg", () => {
  it("일반 주소", () => {
    expect(matchSgg("서울특별시 강남구 개포로82길 7")?.code).toBe(byFull("서울특별시 강남구"));
    expect(matchSgg("경기도 수원시 영통구 월드컵로 206")?.code).toBe(byFull("경기도 수원시 영통구"));
    expect(matchSgg("경기도 수원시 월드컵로 206")?.code).toBe(byFull("경기도 수원시"));
  });
  it("짧은 시도명·옛 시도명", () => {
    expect(matchSgg("서울 강남구 테헤란로 1")?.code).toBe(byFull("서울특별시 강남구"));
    expect(matchSgg("강원도 홍천군 화촌면 구성포리 8-1")?.code).toBe(byFull("강원특별자치도 홍천군"));
    expect(matchSgg("전라북도 익산시 인북로77")?.code).toBe(byFull("전북특별자치도 익산시"));
  });
  it("2026년 전남광주통합특별시", () => {
    expect(matchSgg("광주광역시 북구 연제동 1059")?.code).toBe(byFull("전남광주통합특별시 북구"));
    expect(matchSgg("전라남도 순천시 서면 호남고속도로 3")?.code).toBe(byFull("전남광주통합특별시 순천시"));
    expect(matchSgg("경기도 광주시 광주대로55번길 6")?.code).toBe(byFull("경기도 광주시"));
  });
  it("세종은 시군구 코드 36110", () => {
    expect(matchSgg("세종특별자치시 조치원읍 신흥2길 2")?.code).toBe("36110");
    expect(matchSgg("세종시 나성동 1")?.code).toBe("36110");
  });
  it("개편 전 시군구는 매칭 실패하되 시도는 찾는다", () => {
    expect(matchSgg("인천광역시 중구 월미로 419")).toBeUndefined();
    expect(matchSido("인천광역시 중구 월미로 419")?.code).toBe("28");
  });
  it("정규화·지오코딩용 주소", () => {
    expect(normalizeAddr("12756 경기도 광주시 광주대로55번길 6 (경안동)")).toBe("경기도 광주시 광주대로55번길 6 (경안동)");
    expect(addrForGeocode("12756 경기도 광주시 광주대로55번길 6 (경안동)")).toBe("경기도 광주시 광주대로55번길 6");
  });
});
