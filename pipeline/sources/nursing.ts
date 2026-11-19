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

export async function fetchBusanNursing(key = process.env.DATA_GO_KR_KEY): Promise<{ rows: NursingRow[]; note: string }> {
  if (!key) return { rows: [], note: "키 없음" };
  const rows: NursingRow[] = [];
  let staffOnly = 0;
  let total = Infinity;
  for (let page = 1; (page - 1) * 100 < total && page <= 50; page++) {
    const url = `${BASE}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=100&resultType=json`;
    const text = await (await fetch(url, { signal: AbortSignal.timeout(30000) })).text();
    if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED") || text.includes("OpenAPI_ServiceResponse")) {
      const reason = text.match(/returnAuthMsg[^\w가-힣]*([^"<]+)/)?.[1] ?? "API 오류";
      return { rows: [], note: `부산 수유실 API 사용 불가(${reason.trim()})` };
    }
    const j = JSON.parse(text) as {
      getNursingroomInfo?: { header?: { code?: string }; item?: BusanItem[]; totalCount?: number };
      response?: { body?: { items?: { item?: BusanItem[] | BusanItem }; totalCount?: number } };
    };
    const body = j.getNursingroomInfo ?? j.response?.body;
    const raw = (j.getNursingroomInfo?.item ?? j.response?.body?.items?.item ?? []) as BusanItem[] | BusanItem;
    const items = Array.isArray(raw) ? raw : [raw];
    total = Number(body?.totalCount ?? items.length);
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
  return { rows, note: `부산광역시 수유실 보유 시설 현황 ${rows.length}건(직원 전용 ${staffOnly}건 제외)` };
}

const isMain = process.argv[1] && /nursing\.ts$/.test(process.argv[1]);
if (isMain) {
  fetchBusanNursing().then((r) => console.log(r.note, r.rows.slice(0, 3)));
}
