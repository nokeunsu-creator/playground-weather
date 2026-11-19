import { describe, expect, it, vi } from "vitest";
import { cardText, shareImage, STORE_URL, wrapLines, type CardData, type ShareEnv } from "./shareCard";

const w = (s: string) => s.length; // 글자 하나 = 폭 1

describe("wrapLines", () => {
  it("띄어쓰기 단위로 줄을 나눈다", () => {
    expect(wrapLines("오늘은 나가도 좋아요", 7, w)).toEqual(["오늘은 나가도", "좋아요"]);
  });
  it("긴 단어는 글자 단위로 자른다", () => {
    expect(wrapLines("초미세먼지매우나쁨", 4, w)).toEqual(["초미세먼", "지매우나", "쁨"]);
  });
  it("최대 줄 수를 넘으면 말줄임", () => {
    const r = wrapLines("가 나 다 라 마 바", 3, w, 2);
    expect(r).toHaveLength(2);
    expect(r[1].endsWith("…")).toBe(true);
    expect(r[1].length).toBeLessThanOrEqual(3);
  });
});

const data: CardData = {
  region: "서울 강남구",
  when: "11월 20일 목요일 오후 3시",
  level: "good",
  headline: "나가도 좋아요",
  score: 90,
  tiles: [],
  best: "오늘은 15~17시가 가장 좋아요",
  outfit: ["패딩"],
  basis: "3~6세 기준",
};

describe("cardText", () => {
  it("지역·판정·추천 시간·스토어 주소", () => {
    const t = cardText(data);
    expect(t).toContain("[놀이터 날씨] 서울 강남구");
    expect(t).toContain("나가도 좋아요 (90점)");
    expect(t).toContain("15~17시");
    expect(t.endsWith(STORE_URL)).toBe(true);
  });
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";
function env(over: Partial<ShareEnv> = {}): ShareEnv {
  return {
    isNative: () => false,
    writeCache: vi.fn(async () => "file:///data/user/0/app/cache/share/x.png"),
    nativeShare: vi.fn(async () => undefined),
    canShareFile: () => false,
    webShare: vi.fn(async () => undefined),
    download: vi.fn(),
    ...over,
  };
}

describe("shareImage", () => {
  it("앱: 캐시에 PNG를 쓰고 그 file:// 주소로 공유창", async () => {
    const e = env({ isNative: () => true });
    expect(await shareImage(PNG, "글", e)).toBe("shared");
    expect(e.writeCache).toHaveBeenCalledWith(expect.stringMatching(/^playweather-\d+\.png$/), "iVBORw0KGgo=");
    expect(e.nativeShare).toHaveBeenCalledWith({ title: "놀이터 날씨", text: "글", files: ["file:///data/user/0/app/cache/share/x.png"] });
  });
  it("웹: 파일 공유가 되면 Web Share", async () => {
    const e = env({ canShareFile: () => true });
    expect(await shareImage(PNG, "글", e)).toBe("shared");
    const arg = (e.webShare as ReturnType<typeof vi.fn>).mock.calls[0][0] as { files: File[] };
    expect(arg.files[0].type).toBe("image/png");
    expect(arg.files[0].size).toBeGreaterThan(0);
  });
  it("웹: 공유가 안 되면 이미지 내려받기", async () => {
    const e = env();
    expect(await shareImage(PNG, "글", e)).toBe("downloaded");
    expect(e.download).toHaveBeenCalled();
  });
  it("사용자가 공유창을 닫으면 cancelled", async () => {
    const e = env({ isNative: () => true, nativeShare: async () => Promise.reject(new Error("Share canceled")) });
    expect(await shareImage(PNG, "글", e)).toBe("cancelled");
    const w2 = env({ canShareFile: () => true, webShare: async () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })) });
    expect(await shareImage(PNG, "글", w2)).toBe("cancelled");
  });
  it("저장 실패는 failed", async () => {
    const e = env({ isNative: () => true, writeCache: async () => Promise.reject(new Error("disk full")) });
    expect(await shareImage(PNG, "글", e)).toBe("failed");
  });
});
