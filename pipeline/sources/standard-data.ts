/**
 * 공공데이터포털 표준데이터(도시공원, 공중화장실, 도서관, 박물관·미술관) 다운로드.
 * 포털의 "다운로드" 버튼이 쓰는 내부 JSON 엔드포인트를 그대로 사용한다(로그인·키 불필요).
 *   GET /download/columList.json?pk={pk}&ext=CSV            → 컬럼 목록 + totalCount
 *   GET /download/standard.json?publicDataPk={pk}&colNmList=…&perPage=10000&page=N
 * 결과는 pipeline/.cache/std/{name}.json 에 캐시(하루 1회 갱신).
 */
import fs from "node:fs";
import path from "node:path";

export const STD_DATASETS = {
  parks: { pk: "15012890", label: "전국도시공원정보표준데이터" },
  toilets: { pk: "15012892", label: "전국공중화장실표준데이터" },
  libraries: { pk: "15013109", label: "전국도서관표준데이터" },
  museums: { pk: "15017323", label: "전국박물관미술관정보표준데이터" },
  villages: { pk: "15013113", label: "전국농어촌체험휴양마을표준데이터" },
} as const;

export type StdName = keyof typeof STD_DATASETS;

const CACHE = path.resolve("pipeline/.cache/std");
const UA = "PlaygroundWeather-pipeline/0.1";

interface ColumList {
  totalCount: number;
  fileName: string;
  tableVO: { colNmList: string[]; svcTableNm: string };
  columList: { columNm: string; columCode: string }[];
}

export interface StdResult {
  name: StdName;
  fetchedAt: string;
  totalCount: number;
  columns: { nm: string; code: string }[];
  rows: Record<string, string>[];
}

async function getJson<T>(url: string, referer: string, tries = 3): Promise<T> {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Referer: referer, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw new Error("unreachable");
}

export async function fetchStandard(name: StdName, opts: { maxAgeHours?: number } = {}): Promise<StdResult> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}.json`);
  const maxAge = (opts.maxAgeHours ?? 20) * 3600 * 1000;
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < maxAge) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StdResult;
  }
  const { pk, label } = STD_DATASETS[name];
  const referer = `https://www.data.go.kr/data/${pk}/standard.do`;
  const header = await getJson<ColumList>(`https://www.data.go.kr/download/columList.json?pk=${pk}&ext=CSV`, referer);
  const perPage = 10000;
  const pages = Math.ceil(header.totalCount / perPage);
  const q = new URLSearchParams({
    publicDataPk: pk,
    totalCount: String(header.totalCount),
    svcTableNm: header.tableVO.svcTableNm,
    perPage: String(perPage),
  });
  for (const c of header.tableVO.colNmList) q.append("colNmList", c);
  const rows: Record<string, string>[] = [];
  for (let p = 1; p <= pages; p++) {
    q.set("page", String(p));
    const part = await getJson<Record<string, string>[]>(`https://www.data.go.kr/download/standard.json?${q}`, referer);
    rows.push(...part);
    console.log(`[std:${name}] page ${p}/${pages} +${part.length} (${rows.length}/${header.totalCount})`);
  }
  const result: StdResult = {
    name,
    fetchedAt: new Date().toISOString(),
    totalCount: header.totalCount,
    columns: header.columList.map((c) => ({ nm: c.columNm, code: c.columCode })),
    rows,
  };
  fs.writeFileSync(file, JSON.stringify(result));
  console.log(`[std:${name}] ${label}: ${rows.length} rows cached`);
  return result;
}

const isMain = process.argv[1] && /standard-data\.ts$/.test(process.argv[1]);
if (isMain) {
  (async () => {
    for (const n of Object.keys(STD_DATASETS) as StdName[]) await fetchStandard(n, { maxAgeHours: 0 });
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
