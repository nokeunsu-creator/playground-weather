/**
 * 오늘 판정 카드 이미지(1080×1350 PNG)를 그리고 휴대폰 공유창으로 보낸다.
 * 카카오톡 전용 SDK는 앱 키가 필요해 쓰지 않고, 시스템 공유창에서 카카오톡을 고르게 한다.
 * 기기 테마와 상관없이 항상 밝은 카드로 그린다(받는 사람 화면에서도 같게).
 */
import type { Level } from "./judge";
import { ICON_PATHS, type IconName } from "../components/Icon";

export const CARD_W = 1080;
export const CARD_H = 1350;

/** 출시 후 공유 문구에 붙는 스토어 주소 */
export const STORE_URL = "https://play.google.com/store/apps/details?id=app.playweather.kr";

export interface CardTile {
  label: string;
  value: string;
  sub?: string;
  /** 0 좋음 1 보통 2 나쁨 3 매우나쁨, 없으면 회색 */
  grade?: number;
}

export interface CardData {
  region: string;
  /** "11월 20일 목요일 오후 3시" */
  when: string;
  level: Level;
  headline: string;
  score: number;
  tiles: CardTile[];
  /** "오늘은 15~17시가 가장 좋아요" */
  best?: string;
  outfit: string[];
  /** "3~6세 기준 · 민감군" */
  basis: string;
}

const FONT = '-apple-system, "Apple SD Gothic Neo", "Pretendard Variable", Pretendard, "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
const LEVEL_COLOR: Record<Level, [string, string]> = {
  good: ["#34c759", "#24a148"],
  caution: ["#ff9500", "#e07b00"],
  bad: ["#ff3b30", "#d62d23"],
};
const LEVEL_ICON: Record<Level, IconName> = { good: "check", caution: "exclaim", bad: "xmark" };
const GRADE_COLOR = ["#1f8f3f", "#c77700", "#d62d23", "#a1121a"];
const TEXT = "#1c1c1e";
const MUTED = "#8e8e93";

/**
 * 폭에 맞춰 줄을 나눈다. 띄어쓰기 단위로 나누고, 한 단어가 너무 길면 글자 단위로 자른다.
 * maxLines 를 넘으면 마지막 줄 끝을 "…" 로 줄인다.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 3): string[] {
  const lines: string[] = [];
  let cur = "";
  const push = (s: string) => {
    if (s) lines.push(s);
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next) <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) push(cur);
    cur = "";
    if (measure(word) <= maxWidth) {
      cur = word;
      continue;
    }
    // 단어 하나가 한 줄보다 길면 글자 단위로
    let part = "";
    for (const ch of word) {
      if (measure(part + ch) > maxWidth) {
        push(part);
        part = ch;
      } else part += ch;
    }
    cur = part;
  }
  push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** 공유창에 같이 넣는 글 */
export function cardText(d: CardData): string {
  const lines = [`[놀이터 날씨] ${d.region} · ${d.when}`, `${d.headline} (${d.score}점)`];
  if (d.best) lines.push(d.best);
  lines.push("아이 외출 판정은 '놀이터 날씨' 앱에서 확인하세요", STORE_URL);
  return lines.join("\n");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function icon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string, width = 2.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(ICON_PATHS[name]));
  ctx.restore();
}

export function drawCard(ctx: CanvasRenderingContext2D, d: CardData): void {
  const [c1, c2] = LEVEL_COLOR[d.level];
  const pad = 72;
  ctx.textBaseline = "alphabetic";

  // 바탕
  ctx.fillStyle = "#f2f2f7";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 머리 띠(판정 색)
  const headH = 500;
  const g = ctx.createLinearGradient(0, 0, CARD_W, headH);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, headH);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText("놀이터 날씨", pad, 112);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(d.when, CARD_W - pad, 112);
  ctx.textAlign = "left";

  ctx.fillStyle = "#fff";
  ctx.font = `700 64px ${FONT}`;
  const region = wrapLines(d.region, CARD_W - pad * 2 - 230, (s) => ctx.measureText(s).width, 1)[0] ?? "";
  ctx.fillText(region, pad, 216);

  // 점수 원
  const cx = CARD_W - pad - 95;
  const cy = 250;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c2;
  ctx.textAlign = "center";
  ctx.font = `800 82px ${FONT}`;
  ctx.fillText(String(d.score), cx, cy + 22);
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText("점", cx, cy + 62);
  ctx.textAlign = "left";

  // 판정 아이콘 + 문장
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(pad + 44, 330, 44, 0, Math.PI * 2);
  ctx.fill();
  icon(ctx, LEVEL_ICON[d.level], pad + 14, 300, 60, "#fff", 2.6);
  ctx.fillStyle = "#fff";
  ctx.font = `700 54px ${FONT}`;
  const headLines = wrapLines(d.headline, CARD_W - pad * 2 - 110 - 210, (s) => ctx.measureText(s).width, 2);
  headLines.forEach((l, i) => ctx.fillText(l, pad + 110, 350 + i * 66));
  ctx.font = `500 32px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(d.basis, pad, 448);

  // 흰 본문 카드
  const top = headH - 40;
  ctx.fillStyle = "#fff";
  roundRect(ctx, 40, top, CARD_W - 80, CARD_H - top - 40, 44);
  ctx.fill();

  // 타일 2×2
  const tw = (CARD_W - 80 - pad * 2 + 80 - 24) / 2;
  const th = 150;
  const gap = 20;
  const ty0 = top + 44;
  d.tiles.slice(0, 4).forEach((t, i) => {
    const x = pad + (i % 2) * (tw + 24);
    const y = ty0 + Math.floor(i / 2) * (th + gap);
    ctx.fillStyle = "#f2f2f7";
    roundRect(ctx, x, y, tw, th, 28);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(t.label, x + 30, y + 46);
    ctx.fillStyle = TEXT;
    ctx.font = `700 50px ${FONT}`;
    const v = wrapLines(t.value, tw - 60, (s) => ctx.measureText(s).width, 1)[0] ?? "";
    ctx.fillText(v, x + 30, y + 102);
    if (t.sub) {
      ctx.fillStyle = t.grade != null ? GRADE_COLOR[Math.min(3, Math.max(0, t.grade))] : MUTED;
      ctx.font = `600 30px ${FONT}`;
      ctx.fillText(t.sub, x + 30, y + 136);
    }
  });

  const fy = CARD_H - 150;
  let y = ty0 + 2 * th + gap + 64;
  // 가장 좋은 시간
  if (d.best) {
    icon(ctx, "sparkle", pad, y - 34, 42, c2, 2.4);
    ctx.fillStyle = TEXT;
    ctx.font = `700 40px ${FONT}`;
    const lines = wrapLines(d.best, CARD_W - pad * 2 - 60, (s) => ctx.measureText(s).width, 2);
    lines.forEach((l, i) => ctx.fillText(l, pad + 60, y + i * 52));
    y += lines.length * 52 + 26;
  }

  // 옷차림 칩
  if (d.outfit.length) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText("옷차림", pad, y);
    y += 22;
    ctx.font = `600 34px ${FONT}`;
    let x = pad;
    let rowY = y;
    for (const o of d.outfit.slice(0, 5)) {
      const w = ctx.measureText(o).width + 52;
      if (x + w > CARD_W - pad) {
        x = pad;
        rowY += 78;
      }
      // 바닥글 위까지만(최대 두 줄 정도)
      if (rowY + 64 > fy - 16) break;
      ctx.fillStyle = "#f2f2f7";
      roundRect(ctx, x, rowY, w, 64, 32);
      ctx.fill();
      ctx.fillStyle = TEXT;
      ctx.fillText(o, x + 26, rowY + 44);
      x += w + 14;
    }
  }

  // 바닥글
  ctx.strokeStyle = "#e5e5ea";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, fy);
  ctx.lineTo(CARD_W - pad, fy);
  ctx.stroke();
  icon(ctx, "slide", pad, fy + 30, 44, c2, 2.4);
  ctx.fillStyle = TEXT;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("아이 외출 판정은 '놀이터 날씨' 앱에서", pad + 62, fy + 64);
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText("기상청·한국환경공단 에어코리아 공공데이터 · 참고용 판정", pad + 62, fy + 104);
}

export function renderCard(d: CardData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 를 쓸 수 없어요");
  drawCard(ctx, d);
  return canvas;
}

export type ShareResult = "shared" | "downloaded" | "cancelled" | "failed";

/** 공유 경로(앱/웹)를 바꿔 끼울 수 있게 분리: 테스트에서 가짜를 넣는다 */
export interface ShareEnv {
  isNative: () => boolean;
  /** 앱: 캐시에 PNG 저장 후 file:// 주소 반환 */
  writeCache: (name: string, base64: string) => Promise<string>;
  nativeShare: (opts: { title: string; text: string; files: string[] }) => Promise<void>;
  /** 웹: 파일 공유 가능 여부 */
  canShareFile: (file: File) => boolean;
  webShare: (data: { files: File[]; title: string; text: string }) => Promise<void>;
  download: (blob: Blob, name: string) => void;
}

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string; name?: string })?.message ?? e);
  const name = (e as { name?: string })?.name;
  return name === "AbortError" || /cancel|취소|abort/i.test(msg);
}

export async function shareImage(dataUrl: string, text: string, env: ShareEnv): Promise<ShareResult> {
  const name = `playweather-${Date.now()}.png`;
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  try {
    if (env.isNative()) {
      const uri = await env.writeCache(name, base64);
      await env.nativeShare({ title: "놀이터 날씨", text, files: [uri] });
      return "shared";
    }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    const file = new File([blob], name, { type: "image/png" });
    if (env.canShareFile(file)) {
      await env.webShare({ files: [file], title: "놀이터 날씨", text });
      return "shared";
    }
    env.download(blob, name);
    return "downloaded";
  } catch (e) {
    if (isCancel(e)) return "cancelled";
    console.warn("share failed", e);
    return "failed";
  }
}

/** 실제 기기·브라우저용 공유 경로. 플러그인은 앱에서만 불러온다 */
export function defaultShareEnv(): ShareEnv {
  return {
    isNative: () => (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false,
    writeCache: async (name, base64) => {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      // 지난 카드 파일은 지우고 새로 쓴다
      await Filesystem.rmdir({ path: "share", directory: Directory.Cache, recursive: true }).catch(() => undefined);
      const r = await Filesystem.writeFile({ path: `share/${name}`, data: base64, directory: Directory.Cache, recursive: true });
      return r.uri;
    },
    nativeShare: async ({ title, text, files }) => {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, files, dialogTitle: "판정 카드 보내기" });
    },
    canShareFile: (file) => typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] }),
    webShare: (data) => navigator.share(data),
    download: (blob, name) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };
}
