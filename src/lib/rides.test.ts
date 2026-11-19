import { describe, expect, it } from "vitest";
import { floorList, matchesRides, rideKeys, rideList } from "./rides";
import type { Place } from "./types";

const pg = (rides: string[]): Place => ({ id: "pg:1", kind: "playground", name: "x", lat: 37, lng: 127, addr: "", sgg: "11680", rides });

describe("rides", () => {
  it("조합놀이대는 미끄럼틀로 보지만 물이용 조합놀이대형은 물놀이로만 본다", () => {
    expect(rideKeys(pg(["조합놀이대"])).has("slide")).toBe(true);
    const w = rideKeys(pg(["물이용놀이기구(조합놀이대형)"]));
    expect(w.has("water")).toBe(true);
    expect(w.has("slide")).toBe(false);
  });
  it("바닥재는 기구 목록에서 빠지고 바닥 종류로 나온다", () => {
    const p = pg(["그네", "충격흡수용표면재(모래)", "충격흡수용표면재(포설도포바닥재)"]);
    expect(rideList(p)).toEqual(["그네"]);
    expect(floorList(p)).toEqual(["모래", "고무·탄성"]);
  });
  it("고른 기구를 모두 가져야 통과", () => {
    const p = pg(["그네", "공중놀이기구", "충격흡수용표면재(모래)"]);
    expect(matchesRides(p, ["swing", "aerial"])).toBe(true);
    expect(matchesRides(p, ["swing", "spin"])).toBe(false);
    expect(matchesRides(p, [], "sand")).toBe(true);
    expect(matchesRides(p, [], "rubber")).toBe(false);
    expect(matchesRides({ ...p, kind: "park" }, ["swing"])).toBe(false);
  });
});
