/**
 * 게시 전 확인: 새로 만든 index.json 의 종류별 장소 수가 지난 게시본보다 크게 줄었으면 실패(exit 1).
 * API 일시 오류로 한 층(놀이터·기구·기저귀·도서관·박물관·수유실 …)이 통째로 빠진 데이터가
 * 1주일 동안 게시되는 것을 막는다. 실패하면 지난 게시본이 그대로 남는다.
 *
 * 사용: node node_modules/tsx/dist/cli.mjs pipeline/check-drop.ts <지난 index.json> <새 index.json> [최대감소율=0.2]
 * 정말 줄어든 것이면 워크플로를 force 로 다시 실행한다.
 */
import fs from "node:fs";

type Counts = Record<string, number>;

export function sumCounts(index: { sgg: { counts?: Record<string, number | undefined> }[] }): Counts {
  const out: Counts = {};
  for (const s of index.sgg) for (const [k, v] of Object.entries(s.counts ?? {})) out[k] = (out[k] ?? 0) + (v ?? 0);
  return out;
}

/** 줄어든 종류 목록. 지난 값이 minBase 보다 작은 종류는 보지 않는다 */
export function drops(prev: Counts, next: Counts, maxDrop = 0.2, minBase = 50): { kind: string; prev: number; next: number }[] {
  return Object.entries(prev)
    .filter(([k, p]) => p >= minBase && (next[k] ?? 0) < p * (1 - maxDrop))
    .map(([kind, p]) => ({ kind, prev: p, next: next[kind] ?? 0 }));
}

const isMain = process.argv[1] && /check-drop\.ts$/.test(process.argv[1]);
if (isMain) {
  const [prevFile, nextFile, rate] = process.argv.slice(2);
  if (!prevFile || !nextFile) {
    console.error("사용: check-drop.ts <지난 index.json> <새 index.json> [최대감소율]");
    process.exit(2);
  }
  if (!fs.existsSync(prevFile)) {
    console.log("[check-drop] 지난 게시본 없음 → 확인 생략");
    process.exit(0);
  }
  const prev = sumCounts(JSON.parse(fs.readFileSync(prevFile, "utf8")));
  const next = sumCounts(JSON.parse(fs.readFileSync(nextFile, "utf8")));
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) console.log(`[check-drop] ${k}: ${prev[k] ?? 0} → ${next[k] ?? 0}`);
  const bad = drops(prev, next, rate ? Number(rate) : 0.2);
  if (bad.length) {
    for (const d of bad) console.error(`[check-drop] ${d.kind} 급감 ${d.prev} → ${d.next}: 게시하지 않음`);
    process.exit(1);
  }
  console.log("[check-drop] 이상 없음");
}
