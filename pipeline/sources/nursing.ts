/**
 * 수유실. 전국 단위 공개 데이터가 없어 좌표가 있는 지역 데이터만 모은다.
 *  - 부산광역시_수유실 보유 시설 현황(data.go.kr 15034033, 이용허락 제한 없음)
 *    https://apis.data.go.kr/6260000/BusanNursingroomInfoService/getNursingroomInfo
 *    필드: sido, sigungu, sj(기관명), address, place(위치), tel, target(대상), father(아빠이용), lat, lng, confirm_date
 * 제주·성남·경기 광주 파일데이터는 주소만 있어(지오코딩 결과 저장은 약관상 불가) 쓰지 않는다.
 * 키가 이 API에 활용신청되지 않았으면(SERVICE_KEY_IS_NOT_REGISTERED) 빈 목록을 돌려준다.
 */
const BASE = "https://apis.data.go.kr/6260000/BusanNursingroomInfoService/getNursingroomInfo";

export interface NursingRow {
  name: string;
  addr: string;
  spot?: string;
  tel?: string;
  target?: string;
  father?: boolean;
  lat: number;
  lng: number;
  date?: string;
}

interface BusanItem {
  sj?: string;
  address?: string;
  place?: string;
  tel?: string;
  target?: string;
  father?: string;
  lat?: string | number;
  lng?: string | number;
  confirm_date?: string;
}

/**
 * 보호자가 쓸 수 있는 수유실인가. 이용대상(target)이 직원 전용이면 지도에 올리지 않는다.
 * 실제 값(2026-11): 외부인 240, 외부인+직원 32, 직원+외부인 24, 외부/직원용 7, 직원용 4, 지원 1.
 */
export function isPublicNursing(target?: string | null): boolean {
  const t = (target ?? "").replace(/\s/g, "");
  return !(/직원/.test(t) && !/외부/.test(t));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class NotRegistered extends Error {}

type BusanPage = {
  getNursingroomInfo?: { header?: { code?: string }; item?: BusanItem[]; totalCount?: number };
  response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: BusanItem[] | BusanItem }; totalCount?: number | string } };
};

/** 한 페이지. 네트워크·시간 초과·게이트웨이 일시 오류·결과코드 오류는 3번까지 다시 시도 */
async function getPage(url: string): Promise<BusanPage> {
  for (let i = 1; i <= 3; i++) {
    try {
      const text = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).text();
      if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) throw new NotRegistered("활용신청 안 됨");
      if (text.includes("OpenAPI_ServiceResponse")) throw new Error(`gateway: ${text.match(/returnAuthMsg[^\w가-힣]*([^"<]+)/)?.[1]?.trim() ?? "API 오류"}`);
      const j = JSON.parse(text) as BusanPage;
      const code = j.response?.header?.resultCode ?? j.getNursingroomInfo?.header?.code;
      if (code && code !== "00" && code !== "0" && code !== "INFO-0") throw new Error(`resultCode ${code}`);
      return j;
    } catch (e) {
      if (e instanceof NotRegistered || i === 3) throw e;
      await sleep(2000 * i);
    }
  }
  throw new Error("unreachable");
}

/**
 * 활용신청이 안 됐으면 빈 목록(note 에 이유). 그 밖의 실패·일부 페이지만 받은 경우는 던진다
 * (예전에는 조용히 일부만 게시하거나 앞 페이지까지 버렸다). build-places 는 이 층만 건너뛰고,
 * 게시 직전 건수 비교(check-drop)가 급감을 막는다.
 */
export async function fetchBusanNursing(key = process.env.DATA_GO_KR_KEY): Promise<{ rows: NursingRow[]; note: string }> {
  if (!key) return { rows: [], note: "키 없음" };
  const rows: NursingRow[] = [];
  let staffOnly = 0;
  let received = 0;
  let total = Infinity;
  for (let page = 1; (page - 1) * 100 < total && page <= 50; page++) {
    const url = `${BASE}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=100&resultType=json`;
    let j: BusanPage;
    try {
      j = await getPage(url);
    } catch (e) {
      if (e instanceof NotRegistered) return { rows: [], note: "부산 수유실 API 사용 불가(등록되지 않은 서비스키)" };
      throw e;
    }
    const body = j.getNursingroomInfo ?? j.response?.body;
    const raw = (j.getNursingroomInfo?.item ?? j.response?.body?.items?.item ?? []) as BusanItem[] | BusanItem;
    const items = Array.isArray(raw) ? raw : [raw];
    total = Number(body?.totalCount ?? items.length);
    received += items.length;
    for (const it of items) {
      const lat = Number(it.lat);
      const lng = Number(it.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !it.sj) continue;
      if (!isPublicNursing(it.target)) {
        staffOnly++;
        continue;
      }
      rows.push({
        name: it.sj.trim(),
        addr: (it.address ?? "").trim(),
        spot: it.place?.trim() || undefined,
        tel: it.tel?.trim() || undefined,
        target: it.target?.trim() || undefined,
        father: it.father ? /가능|^y/i.test(it.father) : undefined,
        lat,
        lng,
        date: it.confirm_date,
      });
    }
    if (!items.length) break;
  }
  if (Number.isFinite(total) && received < total) throw new Error(`부산 수유실 ${received}/${total}건만 받음`);
  return { rows, note: `부산광역시 수유실 보유 시설 현황 ${rows.length}건(직원 전용 ${staffOnly}건 제외)` };
}

const isMain = process.argv[1] && /nursing\.ts$/.test(process.argv[1]);
if (isMain) {
  fetchBusanNursing().then((r) => console.log(r.note, r.rows.slice(0, 3)));
}
