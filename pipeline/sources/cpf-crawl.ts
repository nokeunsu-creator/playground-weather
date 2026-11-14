/**
 * 행안부 어린이놀이시설 안전관리시스템(cpf.go.kr) 놀이시설 현황 목록 수집(부트스트랩용).
 * 공식 오픈API(생활안전지도) 키가 생기면 pipeline/sources/safemap.ts 를 우선 사용한다.
 *
 * - 12건/페이지, pageIndex 로 페이징. 페이지 HTML은 pipeline/.cache/cpf/ 에 캐시(재실행 시 건너뜀).
 * - 결과: pipeline/.cache/cpf/list.jsonl (1줄 = 1시설), water.json / excellent.json (시설번호 집합)
 * - 좌표는 없음 → pipeline/geocode.ts 에서 주소로 지오코딩.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "https://www.cpf.go.kr/cpf/ko/nori/0006/index.jsp";
const CACHE = path.resolve("pipeline/.cache/cpf");
const PER_PAGE = 12;
const CONCURRENCY = Number(process.env.CPF_CONCURRENCY ?? 3);
const DELAY_MS = Number(process.env.CPF_DELAY_MS ?? 250);
const UA = "PlaygroundWeather-pipeline/0.1 (public-data bootstrap; throttled)";

export interface CpfRow {
  id: string;
  name: string;
  site: string;
  addr: string;
  installed?: string;
  inspect?: string;
  edu?: string;
  insurance?: string;
  operating?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string, tries = 4): Promise<string> {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes("cpf_bild")) throw new Error("unexpected page");
      return html;
    } catch (e) {
      if (i === tries) throw e;
      await sleep(1000 * i * i);
    }
  }
  throw new Error("unreachable");
}

function clean(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `<dt>{label}</dt> … <dd …>내용</dd>` 에서 내용을 꺼낸다(정규식 대신 인덱스 탐색: 줄바꿈·탭이 많음). */
function dd(block: string, label: string): string | undefined {
  const i = block.indexOf(`<dt>${label}</dt>`);
  if (i < 0) return undefined;
  const ddOpen = block.indexOf("<dd", i);
  if (ddOpen < 0) return undefined;
  const start = block.indexOf(">", ddOpen);
  const end = block.indexOf("</dd>", start);
  if (start < 0 || end < 0) return undefined;
  return clean(block.slice(start + 1, end));
}

export function parseList(html: string): CpfRow[] {
  const rows: CpfRow[] = [];
  const blocks = html.split(/<li>\s*<div>\s*<div class="tag01">/).slice(1);
  for (const b of blocks) {
    const id = b.match(/시설번호\s*:\s*(\d+)/)?.[1];
    if (!id) continue;
    const site = clean(b.match(/<span class="house[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const name = clean(b.match(/<div class="adress"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
    const addr = dd(b, "주소") ?? "";
    rows.push({
      id,
      name,
      site,
      addr,
      installed: dd(b, "설치일자"),
      inspect: dd(b, "안전검사"),
      edu: dd(b, "안전교육"),
      insurance: dd(b, "보험가입"),
      operating: dd(b, "운영여부"),
    });
  }
  return rows;
}

export function parseTotal(html: string): number {
  const m = html.match(/<p class="cb_total">\s*총\s*<b><span>([\d,]+)<\/span>/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

async function crawlSet(tag: string, extraQuery: string): Promise<CpfRow[]> {
  const dir = path.join(CACHE, tag);
  fs.mkdirSync(dir, { recursive: true });
  const first = await fetchHtml(`${BASE}?pageIndex=1${extraQuery}`);
  fs.writeFileSync(path.join(dir, "page-1.html"), first);
  const total = parseTotal(first);
  const pages = Math.ceil(total / PER_PAGE);
  console.log(`[${tag}] total=${total} pages=${pages}`);
  const result = new Map<string, CpfRow>();
  for (const r of parseList(first)) result.set(r.id, r);

  let next = 2;
  let done = 1;
  const t0 = Date.now();
  async function worker() {
    while (next <= pages) {
      const p = next++;
      const file = path.join(dir, `page-${p}.html`);
      let html: string;
      if (fs.existsSync(file)) {
        html = fs.readFileSync(file, "utf8");
      } else {
        html = await fetchHtml(`${BASE}?pageIndex=${p}${extraQuery}`);
        fs.writeFileSync(file, html);
        await sleep(DELAY_MS);
      }
      for (const r of parseList(html)) result.set(r.id, r);
      done++;
      if (done % 100 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`[${tag}] ${done}/${pages} pages, ${result.size} rows, ${el.toFixed(0)}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[${tag}] finished: ${result.size} rows`);
  return [...result.values()];
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const mode = process.argv[2] ?? "all";
  if (mode === "all" || mode === "list") {
    const rows = await crawlSet("list", "");
    fs.writeFileSync(path.join(CACHE, "list.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  if (mode === "all" || mode === "flags") {
    const water = await crawlSet("water", "&wowaStylRideCd=X001");
    fs.writeFileSync(path.join(CACHE, "water.json"), JSON.stringify(water.map((r) => r.id)));
    const excellent = await crawlSet("excellent", "&exfcValidYn=Y");
    fs.writeFileSync(path.join(CACHE, "excellent.json"), JSON.stringify(excellent.map((r) => r.id)));
  }
}

const isMain = process.argv[1] && /cpf-crawl\.ts$/.test(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
