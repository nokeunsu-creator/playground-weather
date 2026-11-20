/**
 * 해 뜨는·지는 시각과 "HH:MM" 변환. 판정(밤 감점)과 갯벌 체험 시간이 함께 쓴다.
 */

export const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** 분 → "HH:MM". 반올림을 먼저 해야 "06:60" 같은 값이 안 나온다. */
export const toHm = (m: number) => {
  const r = Math.round(m);
  return `${String(Math.floor(r / 60) % 24).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

export interface SunTimes {
  rise: string;
  set: string;
}

/**
 * 해 뜨는·지는 시각(한국 시각 "HH:MM"). Almanac for Computers 근사식, 오차 수 분.
 * 백야·극야는 없지만 계산이 안 되면 undefined.
 */
export function sunTimes(date: string, lat: number, lng: number): SunTimes | undefined {
  const [y, m, d] = date.split("-").map(Number);
  const rad = Math.PI / 180;
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const lngHour = lng / 15;
  const calc = (rising: boolean): number | undefined => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const L = (((M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634) % 360) + 360) % 360;
    let RA = ((Math.atan(0.91764 * Math.tan(L * rad)) / rad) % 360 + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return undefined;
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const ut = (((T - lngHour) % 24) + 24) % 24;
    return ((ut + 9) % 24) * 60;
  };
  const r = calc(true);
  const s = calc(false);
  if (r == null || s == null) return undefined;
  return { rise: toHm(r), set: toHm(s) };
}

/** 일몰 뒤 이만큼은 아직 밝다(시민박명 약 25~30분) */
export const TWILIGHT_MIN = 30;

/**
 * 어두운 시간인가. 시간 칸(분 없음)은 그 시간의 가운데(30분)로 본다.
 * 해 시각을 모르면 예전 기준(7시 전, 20시 이후)을 쓴다.
 */
export function isDark(hour: number, minute: number | undefined, sun?: SunTimes): boolean {
  if (!sun) return hour < 7 || hour >= 20;
  const m = hour * 60 + (minute ?? 30);
  return m < toMin(sun.rise) || m > toMin(sun.set) + TWILIGHT_MIN;
}
