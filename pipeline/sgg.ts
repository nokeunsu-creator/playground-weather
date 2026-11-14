/**
 * 시도·시군구 코드 표(pipeline/data/sgg-codes.json)와 주소→시군구 매칭.
 * 코드 원본: 행안부 법정동코드(code.go.kr). 갱신: python pipeline/tools/bjd_to_json.py
 */
import fs from "node:fs";
import path from "node:path";

export interface SidoCode {
  code: string;
  name: string;
  short: string;
  /** 에어코리아 sidoName */
  air: string;
  /** 생활기상지수 areaNo */
  areaNo: string;
}
export interface SggCode {
  /** 5자리 */
  code: string;
  /** 시도 2자리 */
  sido: string;
  /** "종로구", "수원시 영통구" */
  name: string;
  /** "서울특별시 종로구" */
  full: string;
}

interface CodeTable {
  updated: string;
  sido: SidoCode[];
  sgg: SggCode[];
}

const table: CodeTable = JSON.parse(
  fs.readFileSync(path.resolve("pipeline/data/sgg-codes.json"), "utf8"),
) as CodeTable;

export const SIDO: SidoCode[] = table.sido;
export const SGG: SggCode[] = table.sgg;
export const SIDO_BY_CODE = new Map(SIDO.map((s) => [s.code, s]));
export const SGG_BY_CODE = new Map(SGG.map((s) => [s.code, s]));

/** 옛 시도명 → 현재 명칭 */
// 주의: JS 정규식의 \b 는 한글 뒤에서 동작하지 않으므로 (?=\s|$) 를 쓴다
const SIDO_ALIAS: [RegExp, string][] = [
  [/^강원도(?=\s|$)/, "강원특별자치도"],
  [/^전라북도(?=\s|$)/, "전북특별자치도"],
  // 2026년 광주광역시 + 전라남도 → 전남광주통합특별시(코드 12). 옛 주소 표기를 새 이름으로
  [/^광주광역시(?=\s|$)/, "전남광주통합특별시"],
  [/^전라남도(?=\s|$)/, "전남광주통합특별시"],
  [/^전남\s/, "전남광주통합특별시 "],
  [/^광주시\s(동구|서구|남구|북구|광산구)(?=\s|$)/, "전남광주통합특별시 $1"],
  [/^전북\s/, "전북특별자치도 "],
  [/^강원\s/, "강원특별자치도 "],
  [/^서울시\s/, "서울특별시 "],
  [/^서울\s/, "서울특별시 "],
  [/^부산시\s/, "부산광역시 "],
  [/^부산\s/, "부산광역시 "],
  [/^대구\s/, "대구광역시 "],
  [/^인천\s/, "인천광역시 "],
  [/^광주\s(동구|서구|남구|북구|광산구)(?=\s|$)/, "전남광주통합특별시 $1"],
  [/^대전\s/, "대전광역시 "],
  [/^울산\s/, "울산광역시 "],
  [/^경기\s/, "경기도 "],
  [/^충북\s/, "충청북도 "],
  [/^충남\s/, "충청남도 "],
  [/^전남\s/, "전라남도 "],
  [/^경북\s/, "경상북도 "],
  [/^경남\s/, "경상남도 "],
  [/^제주도\s/, "제주특별자치도 "],
  [/^제주\s/, "제주특별자치도 "],
  [/^세종시\s/, "세종특별자치시 "],
  [/^세종\s/, "세종특별자치시 "],
];

/** 우편번호 제거, 괄호 꼬리 제거, 옛 시도명 치환, 공백 정리 */
export function normalizeAddr(raw: string): string {
  let a = (raw ?? "").replace(/\s+/g, " ").trim();
  a = a.replace(/^\(?\d{5}\)?\s*/, "");
  a = a.replace(/^\(?\d{3}-\d{3}\)?\s*/, "");
  for (const [re, to] of SIDO_ALIAS) {
    if (re.test(a)) {
      a = a.replace(re, to).replace(/\s{2,}/g, " ");
      break;
    }
  }
  return a.trim();
}

/** 괄호 안 참고항목까지 제거한 지오코딩용 주소 */
export function addrForGeocode(raw: string): string {
  return normalizeAddr(raw)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 시도별로 full 이름 긴 순서 정렬(최장 일치)
const BY_SIDO = new Map<string, SggCode[]>();
for (const s of SGG) {
  const list = BY_SIDO.get(s.sido) ?? [];
  list.push(s);
  BY_SIDO.set(s.sido, list);
}
for (const list of BY_SIDO.values()) list.sort((a, b) => b.full.length - a.full.length);
const SIDO_BY_NAME = new Map(SIDO.map((s) => [s.name, s]));

/** 주소 문자열에서 시군구(최장 일치)를 찾는다. 세종은 36110. */
export function matchSgg(rawAddr: string): SggCode | undefined {
  const a = normalizeAddr(rawAddr);
  const sidoName = a.split(" ")[0];
  const sido = SIDO_BY_NAME.get(sidoName);
  if (!sido) return undefined;
  const list = BY_SIDO.get(sido.code) ?? [];
  for (const s of list) {
    if (a === s.full || a.startsWith(s.full + " ")) return s;
  }
  // 세종처럼 시군구가 곧 시도인 경우
  return list.find((s) => s.full === sido.name);
}

/** 5자리 코드로 시도 정보 */
export function sidoOfSgg(code5: string): SidoCode | undefined {
  return SIDO_BY_CODE.get(code5.slice(0, 2));
}

/** 주소의 시도 코드만(시군구가 바뀌어 매칭 실패한 옛 주소용) */
export function matchSido(rawAddr: string): SidoCode | undefined {
  return SIDO_BY_NAME.get(normalizeAddr(rawAddr).split(" ")[0]);
}
