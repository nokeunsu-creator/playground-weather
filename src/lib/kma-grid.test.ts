import { describe, expect, it } from "vitest";
import { toGrid } from "./kma-grid";

describe("toGrid", () => {
  it("서울 종로구 → (60,127)", () => {
    expect(toGrid(37.5729, 126.9794)).toEqual({ nx: 60, ny: 127 });
  });
  it("부산 중구 → (97,74)", () => {
    expect(toGrid(35.1064, 129.0324)).toEqual({ nx: 97, ny: 74 });
  });
  it("제주시 → (53,38)", () => {
    expect(toGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
  });
});
