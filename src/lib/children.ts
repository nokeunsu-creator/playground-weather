/**
 * 아이 여러 명. 판정은 가장 엄격한 기준 하나로 한다:
 * 나이는 가장 어린 아이, 한 명이라도 민감군이면 민감군.
 */
import { AGE_LABEL } from "./judge";
import type { AgeGroup, ChildProfile } from "./types";

export const MAX_CHILDREN = 4;
/** 엄격한 순서 */
const STRICT: AgeGroup[] = ["infant", "toddler", "kid"];
const DEFAULT_CHILD: ChildProfile = { age: "toddler", sensitive: false };

export function effectiveChild(list: ChildProfile[]): ChildProfile {
  if (!list.length) return { ...DEFAULT_CHILD };
  const age = STRICT.find((a) => list.some((c) => c.age === a)) ?? "toddler";
  return { age, sensitive: list.some((c) => c.sensitive) };
}

/** "3~6세 기준 · 민감군", 여러 명이면 "아이 2명 · 0~2세 기준" */
export function basisLabel(list: ChildProfile[]): string {
  const e = effectiveChild(list);
  const base = `${AGE_LABEL[e.age]} 기준${e.sensitive ? " · 민감군" : ""}`;
  return list.length > 1 ? `아이 ${list.length}명 · ${base}` : base;
}

/** 저장된 설정을 아이 목록 기준으로 맞춘다(예전 단일 child 설정도 이전) */
export function normalizeChildren(s: { child?: ChildProfile; children?: ChildProfile[] }): { child: ChildProfile; children: ChildProfile[] } {
  const src = s.children?.length ? s.children : [s.child ?? DEFAULT_CHILD];
  const children = src.slice(0, MAX_CHILDREN).map((c) => {
    const age: AgeGroup = STRICT.includes(c.age) ? c.age : "toddler";
    const name = (c.name ?? "").trim().slice(0, 8);
    return name ? { age, sensitive: !!c.sensitive, name } : { age, sensitive: !!c.sensitive };
  });
  return { children, child: effectiveChild(children) };
}
