/**
 * 놀이기구 분류. 행안부 기구정보(rideStylCdNm) 값을 부모가 찾는 이름으로 묶는다.
 * 실제 값 예: 조합놀이대, 흔들놀이기구, 그네, 오르는기구, 건너는기구, 미끄럼틀, 폐쇄형놀이기구, 정글짐,
 * 회전놀이기구, 공중놀이기구, 스페이스네트, 물이용놀이기구(조합놀이대형), 충격흡수용표면재(모래) …
 */
import type { Place } from "./types";

export interface RideGroup {
  key: string;
  label: string;
  re: RegExp;
}

/** 미끄럼틀은 대부분 조합놀이대에 붙어 있어 조합놀이대도 미끄럼틀로 본다 */
export const RIDE_GROUPS: RideGroup[] = [
  { key: "slide", label: "미끄럼틀", re: /미끄럼|^조합놀이대/ },
  { key: "swing", label: "그네", re: /그네/ },
  { key: "spring", label: "흔들놀이", re: /흔들/ },
  { key: "seesaw", label: "시소", re: /시소/ },
  { key: "spin", label: "회전놀이", re: /회전/ },
  { key: "climb", label: "오르기·정글짐", re: /오르는|정글짐|스페이스네트|암벽|클라이밍/ },
  { key: "cross", label: "건너기", re: /건너는|출렁/ },
  { key: "aerial", label: "공중놀이·짚라인", re: /공중|짚라인|집라인/ },
  { key: "tunnel", label: "터널·폐쇄형", re: /폐쇄형|터널/ },
  { key: "water", label: "물놀이기구", re: /물이용|물놀이/ },
];

export const FLOORS: RideGroup[] = [
  { key: "sand", label: "모래 바닥", re: /모래/ },
  { key: "rubber", label: "고무·탄성 바닥", re: /고무|포설|탄성/ },
];

const FLOOR_RE = /표면재|바닥재|매트|포설/;

export function isFloor(name: string): boolean {
  return FLOOR_RE.test(name);
}

/** 기구 목록(바닥재 제외) */
export function rideList(p: Place): string[] {
  return (p.rides ?? []).filter((r) => !isFloor(r));
}

/** 바닥 종류 라벨(모래, 고무·탄성 바닥 …) */
export function floorList(p: Place): string[] {
  const floors = (p.rides ?? []).filter(isFloor);
  return FLOORS.filter((f) => floors.some((r) => f.re.test(r))).map((f) => f.label.replace(" 바닥", ""));
}

export function rideKeys(p: Place): Set<string> {
  const out = new Set<string>();
  for (const r of p.rides ?? []) {
    if (isFloor(r)) {
      for (const f of FLOORS) if (f.re.test(r)) out.add(f.key);
      continue;
    }
    for (const g of RIDE_GROUPS) if (g.re.test(r)) out.add(g.key);
  }
  return out;
}

/** 고른 기구를 모두 갖췄고(AND) 바닥 조건이 맞는가 */
export function matchesRides(p: Place, keys: string[], floor?: string): boolean {
  if (!keys.length && !floor) return true;
  if (p.kind !== "playground") return false;
  const have = rideKeys(p);
  if (floor && !have.has(floor)) return false;
  return keys.every((k) => have.has(k));
}
