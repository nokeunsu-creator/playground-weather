import { describe, expect, it } from "vitest";
import { nearestSgg, nearestSggs } from "./data";
import type { DataIndex, SggInfo } from "./types";

const sgg = (code: string, lat: number, lng: number): SggInfo => ({
  code,
  sido: "서울",
  name: code,
  lat,
  lng,
  nx: 0,
  ny: 0,
  airSido: "서울",
  areaNo: `${code}00000`,
  counts: { playground: 0, park: 0, toilet: 0 },
});
const index: DataIndex = { builtAt: "", sources: {}, sgg: [sgg("A", 37.5, 127.0), sgg("B", 37.6, 127.1), sgg("C", 35.1, 129.0)] };

describe("nearestSgg", () => {
  it("가장 가까운 시군구", () => {
    expect(nearestSgg(index, 37.51, 127.01).code).toBe("A");
    expect(nearestSgg(index, 35.0, 129.0).code).toBe("C");
  });
  it("가까운 순서 n개", () => {
    expect(nearestSggs(index, 37.59, 127.09, 2).map((s) => s.code)).toEqual(["B", "A"]);
  });
});
