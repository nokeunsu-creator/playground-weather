import { describe, expect, it } from "vitest";
import { drops, sumCounts } from "./check-drop";

describe("게시 전 급감 확인", () => {
  const idx = (pg: number, nursing: number) => ({
    sgg: [
      { counts: { playground: pg / 2, park: 100, nursing } },
      { counts: { playground: pg / 2, park: 100 } },
    ],
  });
  it("시군구별 건수를 종류별로 더한다", () => {
    expect(sumCounts(idx(1000, 304))).toEqual({ playground: 1000, park: 200, nursing: 304 });
  });
  it("20% 넘게 줄면 잡고, 조금 줄면 통과", () => {
    const prev = sumCounts(idx(85000, 304));
    expect(drops(prev, sumCounts(idx(84000, 300)))).toEqual([]);
    expect(drops(prev, sumCounts(idx(0, 304))).map((d) => d.kind)).toEqual(["playground"]);
    expect(drops(prev, sumCounts(idx(85000, 0))).map((d) => d.kind)).toEqual(["nursing"]);
  });
  it("원래 적은 종류(50곳 미만)는 보지 않는다", () => {
    expect(drops({ venue: 10 }, { venue: 0 })).toEqual([]);
  });
});
