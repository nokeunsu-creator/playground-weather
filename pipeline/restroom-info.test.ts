import { describe, expect, it } from "vitest";
import { buildDiaperIndex, lookupDiaper, parseCsv } from "./sources/restroom-info";

const CSV = [
  "화장실명,소재지도로명주소,소재지지번주소,기저귀교환대유무,기저귀교환대장소,데이터기준일자",
  '사직공원 화장실,"서울특별시 종로구 사직로 89 (사직동)",서울특별시 종로구 사직동 1-28,Y,여자화장실+남자화장실,2025-11-10',
  "한강공원 1화장실,서울특별시 마포구 마포나루길 1,,Y,여자화장실,2026-01-01",
  "한강공원 2화장실,서울특별시 마포구 마포나루길 1,,N,,2026-01-01",
  "역전 화장실,부산광역시 동구 중앙대로 206,,Y,,2024-12-31",
].join("\r\n");

describe("공중화장실정보 기저귀교환대 연결", () => {
  const idx = buildDiaperIndex(parseCsv(CSV));
  it("행·기저귀 수와 기준일", () => {
    expect(idx.rows).toBe(4);
    expect(idx.withDiaper).toBe(3);
    expect(idx.date).toBe("2026-01-01");
  });
  it("주소(괄호·공백 무시)+이름으로 연결하고 장소를 읽기 좋게", () => {
    expect(lookupDiaper(idx, ["서울특별시 종로구 사직로 89", null], "사직공원  화장실")).toBe("여자화장실, 남자화장실");
  });
  it("같은 주소에 '없음'이 섞이면 주소만으로는 판단하지 않음", () => {
    expect(lookupDiaper(idx, ["서울특별시 마포구 마포나루길 1"], "다른 이름")).toBeUndefined();
    expect(lookupDiaper(idx, ["서울특별시 마포구 마포나루길 1"], "한강공원 1화장실")).toBe("여자화장실");
    expect(lookupDiaper(idx, ["서울특별시 마포구 마포나루길 1"], "한강공원 2화장실")).toBeUndefined();
  });
  it("주소가 하나뿐이고 있음이면 이름이 달라도 연결, 장소 미상은 빈 문자열", () => {
    expect(lookupDiaper(idx, ["null", "부산광역시 동구 중앙대로 206"], "부산역 공중화장실")).toBe("");
  });
});
