/** 공유 타입: 앱(src)과 파이프라인(pipeline)이 함께 사용한다. */

export type PlaceKind = "playground" | "park" | "toilet" | "nursing" | "venue";

export interface Place {
  /** "pg:556961" | "pk:…" | "wc:…" | "ns:…" */
  id: string;
  kind: PlaceKind;
  name: string;
  lat: number;
  lng: number;
  /** 도로명 주소(없으면 지번) */
  addr: string;
  /** 시군구 코드 5자리(법정동코드 앞 5자리). 세종은 36110 */
  sgg: string;
  // ---- 놀이터 ----
  /** 설치장소 유형: 아파트, 도시공원, 어린이공원, 유치원, 학교, 목욕장업소 … */
  site?: string;
  indoor?: boolean;
  /** 물놀이형 */
  water?: boolean;
  /** 행안부 우수 놀이시설 */
  excellent?: boolean;
  /** 행안부 분류상 공공(true)/민간(false) 설치 */
  pub?: boolean;
  /** 설치일 YYYY-MM-DD */
  installed?: string;
  /** 최근 안전검사일 YYYY-MM-DD */
  inspected?: string;
  inspectOk?: boolean;
  /** 놀이기구 유형(그네, 미끄럼틀, 조합놀이대 …) */
  rides?: string[];
  // ---- 공원 ----
  /** 어린이공원 / 근린공원 / 소공원 … */
  parkType?: string;
  /** 유희·운동·편익 시설 */
  facilities?: string[];
  /** 면적 m² */
  area?: number;
  // ---- 화장실 ----
  /** 개방시간 */
  open?: string;
  /** 기저귀교환대 위치 요약(남/여/장애인) */
  diaper?: string;
  tel?: string;
  // ---- 수유실 ----
  /** 건물 안 위치(1층 어린이자료실 내 …) */
  spot?: string;
  /** 이용대상(외부인, 임산부 및 영유아 …) */
  target?: string;
  /** 아빠 이용 가능 */
  father?: boolean;
  // ---- 도서관·박물관(venue) ----
  /** 어린이도서관 | 공공도서관 | 작은도서관 | 박물관 | 미술관 */
  venue?: string;
  /** 운영시간 "HH:MM-HH:MM". wd 평일, sat 토요일, hol 일요일·공휴일 */
  hrs?: { wd?: string; sat?: string; hol?: string };
  /** 정기 휴관 요일(0=일 … 6=토) */
  closedDays?: number[];
  /** 휴관 안내 원문 */
  closed?: string;
  /** 어린이 관람료 요약(무료, 어린이 2,000원 …) */
  fee?: string;
}

export interface SggInfo {
  /** 5자리 코드 */
  code: string;
  /** 시도 짧은 이름: 서울, 경기 … */
  sido: string;
  /** 시군구 이름: 강남구, 수원시 영통구 … */
  name: string;
  lat: number;
  lng: number;
  /** 기상청 격자 */
  nx: number;
  ny: number;
  /** 에어코리아 sidoName(서울, 경기 …) */
  airSido: string;
  /** 생활기상지수 areaNo(10자리) */
  areaNo: string;
  /** 예전 index.json 에는 nursing 이 없을 수 있다 */
  counts: Partial<Record<PlaceKind, number>> & Record<"playground" | "park" | "toilet", number>;
}

export interface DataIndex {
  builtAt: string;
  /** 데이터 기준일/출처 */
  sources: Record<string, string>;
  sgg: SggInfo[];
}

/** 시군구별 장소 파일: data/places/{code}.json */
export interface PlacesFile {
  sgg: string;
  builtAt: string;
  places: Place[];
}

// ---------------- 날씨 ----------------

export interface WxHour {
  /** 로컬 시각 "YYYY-MM-DDTHH:00" */
  t: string;
  temp: number;
  /** 체감온도(앱에서 계산 가능하지만 파이프라인이 미리 넣음) */
  feels: number;
  /** 습도 % */
  reh: number;
  /** 풍속 m/s */
  wsd: number;
  /** 강수확률 % */
  pop: number;
  /** 강수형태 0없음 1비 2비/눈 3눈 4소나기 */
  pty: number;
  /** 하늘 1맑음 3구름많음 4흐림 */
  sky: number;
  /** 1시간 강수량 mm(실황/예보) */
  rain?: number;
  /** 자외선지수(3시간 단위 보간) */
  uv?: number;
}

export interface WxDay {
  date: string;
  tmn?: number;
  tmx?: number;
}

export interface WxNow {
  at: string;
  temp: number;
  feels: number;
  reh: number;
  wsd: number;
  pty: number;
  rain: number;
  pm10?: number;
  pm25?: number;
  /** 미세먼지 측정 시각 */
  pmAt?: string;
  /** 미세먼지 측정소 이름 */
  station?: string;
}

/** 지수들은 0~… 정수. 없으면 undefined(계절 외 등) */
export interface WxIndex {
  /** 오늘 최대 자외선지수 */
  uvMax?: number;
  /** 꽃가루 위험 0낮음 1보통 2높음 3매우높음 (참나무/소나무/잡초 중 최대) */
  pollen?: number;
  /** 감기가능지수 0낮음 1보통 2높음 3매우높음 (9~4월) */
  cold?: number;
  /** 천식·폐질환 가능지수 0~3 */
  asthma?: number;
  /** 대기정체지수 0~3 */
  stagnation?: number;
}

export interface WxSnapshot {
  sgg: string;
  fetchedAt: string;
  /** 예보 기준시각 */
  base: string;
  /** true면 가짜(개발용) 데이터 */
  mock?: boolean;
  now: WxNow;
  hours: WxHour[];
  days: WxDay[];
  idx: WxIndex;
}

export type AgeGroup = "infant" | "toddler" | "kid";

export interface ChildProfile {
  age: AgeGroup;
  /** 알레르기 비염/천식 등 민감군이면 true */
  sensitive: boolean;
}
