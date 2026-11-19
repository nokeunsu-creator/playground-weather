import { describe, expect, it } from "vitest";
import { isPublicNursing } from "./sources/nursing";

describe("isPublicNursing", () => {
  it("직원 전용은 뺀다", () => {
    expect(isPublicNursing("직원용")).toBe(false);
    expect(isPublicNursing(" 직원 ")).toBe(false);
  });
  it("외부인이 쓸 수 있으면 남긴다", () => {
    for (const t of ["외부인", "외부인+직원", "직원+외부인", "외부/직원용"]) expect(isPublicNursing(t)).toBe(true);
  });
  it("값이 없거나 알 수 없으면 남긴다", () => {
    expect(isPublicNursing(undefined)).toBe(true);
    expect(isPublicNursing("")).toBe(true);
    expect(isPublicNursing("지원")).toBe(true);
  });
});
