import { describe, expect, it } from "vitest";
import { backDepth, popBack, pushBack } from "./back";

describe("뒤로 가기 스택", () => {
  it("나중에 연 시트부터 닫고, 닫힌 시트는 스택에서 빠진다", () => {
    const closed: string[] = [];
    const offA = pushBack(() => closed.push("장소"));
    const offB = pushBack(() => closed.push("공유"));
    expect(backDepth()).toBe(2);
    expect(popBack()).toBe(true);
    expect(closed).toEqual(["공유"]);
    offB(); // 공유 시트가 사라짐
    expect(popBack()).toBe(true);
    expect(closed).toEqual(["공유", "장소"]);
    offA();
    expect(backDepth()).toBe(0);
    expect(popBack()).toBe(false); // 시트가 없으면 앱이 탭 이동·종료를 맡는다
  });
});
