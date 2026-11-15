import { describe, expect, it } from "vitest";
import { detectCoord, mercatorToWgs84, toCoord } from "./sources/pfct-api";

describe("pfct coord", () => {
  it("Web Mercator → WGS84 (경기 화성 부근)", () => {
    const c = mercatorToWgs84(14144087.4653, 4469799.53254);
    expect(c.lng).toBeCloseTo(127.05, 1);
    expect(c.lat).toBeCloseTo(37.2, 1);
  });
  it("필드 자동 감지: mercator", () => {
    const det = detectCoord({ fclty_nm: "a", adres: "b", x: "14144087.4653", y: "4469799.53254" });
    expect(det?.crs).toBe("mercator");
    const c = toCoord({ x: "14144087.4653", y: "4469799.53254" }, det!);
    expect(c?.lat).toBeGreaterThan(37);
  });
  it("필드 자동 감지: wgs84", () => {
    const det = detectCoord({ la: "37.5", lo: "127.0", nm: "x" });
    expect(det?.crs).toBe("wgs84");
    expect(toCoord({ la: "37.5", lo: "127.0" }, det!)).toEqual({ lat: 37.5, lng: 127 });
  });
});
