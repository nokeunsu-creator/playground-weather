import { describe, expect, it } from "vitest";
import { basisLabel, effectiveChild, MAX_CHILDREN, normalizeChildren } from "./children";

describe("아이 여러 명", () => {
  it("가장 어린 나이 + 한 명이라도 민감군", () => {
    expect(effectiveChild([{ age: "kid", sensitive: false }, { age: "infant", sensitive: false }])).toEqual({ age: "infant", sensitive: false });
    expect(effectiveChild([{ age: "kid", sensitive: true }, { age: "toddler", sensitive: false }])).toEqual({ age: "toddler", sensitive: true });
  });
  it("판정 기준 문구", () => {
    expect(basisLabel([{ age: "toddler", sensitive: false }])).toBe("3~6세 기준");
    expect(basisLabel([{ age: "kid", sensitive: true }, { age: "infant", sensitive: false }])).toBe("아이 2명 · 0~2세 기준 · 민감군");
  });
  it("예전 단일 아이 설정을 목록으로 옮긴다", () => {
    expect(normalizeChildren({ child: { age: "kid", sensitive: true } })).toEqual({
      children: [{ age: "kid", sensitive: true }],
      child: { age: "kid", sensitive: true },
    });
  });
  it("최대 인원·잘못된 나이·이름 같은 다른 값은 버림", () => {
    const many = Array.from({ length: 6 }, () => ({ age: "kid" as const, sensitive: false }));
    expect(normalizeChildren({ children: many }).children).toHaveLength(MAX_CHILDREN);
    const r = normalizeChildren({ children: [{ age: "baby" as never, sensitive: false, name: "홍길동" } as never] });
    expect(r.children[0]).toEqual({ age: "toddler", sensitive: false });
  });
});
