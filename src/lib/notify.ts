/**
 * 아침 알림·저녁 알림(기기 로컬 알림, 서버 없음).
 * - 앞으로 7일치를 서로 다른 ID 로 한 번에 예약한다. 예전에는 1회 알림을 하나만 걸어서
 *   앱을 다시 실행하지 않으면 다음 날 알림이 오지 않았다. 예보가 그 시각을 덮는 날만 구체 문구,
 *   나머지 날은 "앱을 열어 확인하세요" 문구다. 앱을 열 때마다(새 날씨·복귀) 다시 예약해 문구를 갱신한다.
 * - 알림 권한은 설정 화면에서 스위치를 켤 때만 묻는다(requestNotifyPermission). 자동 재예약은 확인만 한다.
 * - 정확한 알람(Android 12+ '알람 및 리마인더') 권한이 없으면 isExactNotification:false 로 넘긴다.
 *   기본값(true)이면 플러그인이 schedule() 때마다 그 설정 화면을 연다. 대신 몇 분 늦게 울릴 수 있다.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { dayPlan, inputFromHour, judge, LEVEL_EMOJI, PLAY_END, PLAY_START, pm10Grade, pm25Grade, PM_LABEL, sunAt } from "./judge";
import type { ChildProfile, WxSnapshot } from "./types";
import { localIsoHour } from "./data";

export const NOTIFY_DAYS = 7;
/** 아침 1001~1007. 예전 아침(1001)·저녁(1002) 단일 ID 도 이 범위라 재예약 때 함께 지워진다 */
const MORNING_BASE = 1001;
/** 저녁 1101~1107 */
const EVENING_BASE = 1101;
/** 아침 측정 미세먼지를 이보다 먼 시각의 알림에는 넣지 않는다 */
const PM_FRESH_MS = 12 * 3600 * 1000;

type Pos = { lat: number; lng: number };
export type NotifyResult = "scheduled" | "cancelled" | "denied" | "unsupported";

export function nextFireDate(hour: number, minute: number, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime() + 60_000) d.setDate(d.getDate() + 1);
  return d;
}

/** 다음 알림부터 n일치 시각 */
export function fireDates(hour: number, minute: number, now = new Date(), days = NOTIFY_DAYS): Date[] {
  const first = nextFireDate(hour, minute, now);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
}

export function buildMorningText(snap: WxSnapshot, child: ChildProfile, fireAt: Date, regionName: string, pos?: Pos): { title: string; body: string } {
  const target = new Date(fireAt.getTime() + 60 * 60 * 1000);
  const key = localIsoHour(target);
  const row = snap.hours.find((h) => h.t === key);
  const title = `${regionName} 오늘 아이 외출 날씨`;
  if (!row) return { title, body: "앱을 열어 오늘 판정을 확인하세요" };
  const j = judge(inputFromHour(row, snap.now, snap.idx, sunAt(key.slice(0, 10), pos)), child);
  const pmAt = snap.now.pmAt ? Date.parse(snap.now.pmAt.replace(" ", "T")) : NaN;
  const pmFresh = Number.isFinite(pmAt) && fireAt.getTime() - pmAt <= PM_FRESH_MS;
  const g = Math.max(pm10Grade(snap.now.pm10) ?? 0, pm25Grade(snap.now.pm25) ?? 0);
  const pm = pmFresh && (snap.now.pm10 != null || snap.now.pm25 != null) ? ` · 미세먼지 ${PM_LABEL[g]}` : "";
  const body = `${LEVEL_EMOJI[j.level]} ${j.headline} · ${Math.round(row.temp)}℃${pm} · ${j.outfit[0] ?? ""}`;
  return { title, body };
}

/** 저녁 알림: 다음 날 07~19시 중 가장 좋은 2시간과 기온·옷차림. 예보가 그날을 다 덮을 때만 구체 문구 */
export function buildEveningText(snap: WxSnapshot, child: ChildProfile, fireAt: Date, regionName: string, pos?: Pos): { title: string; body: string } {
  const tomorrow = localIsoHour(new Date(fireAt.getTime() + 24 * 3600 * 1000)).slice(0, 10);
  const title = `${regionName} 내일 아이 외출 계획`;
  const generic = { title, body: "앱을 열어 내일 날씨를 확인하세요" };
  const plan = dayPlan(snap, child, tomorrow, undefined, pos);
  const best = plan.best;
  if (!best || plan.cells.length < PLAY_END - PLAY_START + 1) return generic;
  const temps = snap.hours.filter((h) => h.t.startsWith(tomorrow)).map((h) => h.temp);
  const range = temps.length >= 24 ? ` · ${Math.round(Math.min(...temps))}°~${Math.round(Math.max(...temps))}°` : "";
  const hrs = `${Number(best.start.slice(0, 2))}~${Number(best.end.slice(0, 2))}시`;
  const row = snap.hours.find((h) => h.t === `${tomorrow}T${best.start}`);
  const outfit = row ? judge(inputFromHour(row, snap.now, snap.idx, sunAt(tomorrow, pos)), child).outfit[0] : undefined;
  if (best.level === "bad") {
    return { title, body: `${LEVEL_EMOJI.bad} 내일은 실내 놀이 추천${best.reason ? ` · ${best.reason}` : ""}${range} · 근처 도서관·박물관을 찾아보세요` };
  }
  const lead = best.level === "good" ? `내일은 ${hrs}가 가장 좋아요` : `내일은 ${hrs}가 그나마 나아요${best.reason ? ` (${best.reason})` : ""}`;
  return { title, body: `${LEVEL_EMOJI[best.level]} ${lead}${range}${outfit ? ` · ${outfit}` : ""}` };
}

const idsFrom = (base: number) => Array.from({ length: NOTIFY_DAYS }, (_, i) => base + i);

async function cancelIds(ids: number[]) {
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    /* 웹 등 */
  }
}

async function exactAllowed(): Promise<boolean> {
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    return false;
  }
}

/** 알림 권한. 설정 화면에서 스위치를 켤 때만 부른다(자동 재예약 경로에서는 묻지 않는다). */
export async function requestNotifyPermission(): Promise<"granted" | "denied" | "unsupported"> {
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
    return p.display === "granted" ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** 알림 권한이 지금 허용돼 있는가(묻지 않음) */
export async function notifyPermissionGranted(): Promise<boolean | undefined> {
  try {
    return (await LocalNotifications.checkPermissions()).display === "granted";
  } catch {
    return undefined;
  }
}

async function scheduleSeries(base: number, enabled: boolean, dates: Date[], make: (at: Date) => { title: string; body: string }): Promise<NotifyResult> {
  await cancelIds(idsFrom(base));
  if (!enabled) return "cancelled";
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return "denied";
    const exact = await exactAllowed();
    await LocalNotifications.schedule({
      notifications: dates.map((at, i) => {
        const t = make(at);
        return { id: base + i, title: t.title, body: t.body, schedule: { at, allowWhileIdle: true }, smallIcon: "ic_stat_notify", isExactNotification: exact };
      }),
    });
    return "scheduled";
  } catch (e) {
    console.warn("notification schedule failed", e);
    return "unsupported";
  }
}

interface ScheduleOpts {
  enabled: boolean;
  hour: number;
  minute: number;
  snap?: WxSnapshot;
  child: ChildProfile;
  regionName: string;
  pos?: Pos;
}

export function rescheduleMorning(o: ScheduleOpts, now = new Date()): Promise<NotifyResult> {
  return scheduleSeries(MORNING_BASE, o.enabled, fireDates(o.hour, o.minute, now), (at) =>
    o.snap ? buildMorningText(o.snap, o.child, at, o.regionName, o.pos) : { title: `${o.regionName} 오늘 아이 외출 날씨`, body: "앱을 열어 오늘 판정을 확인하세요" },
  );
}

export function rescheduleEvening(o: ScheduleOpts, now = new Date()): Promise<NotifyResult> {
  return scheduleSeries(EVENING_BASE, o.enabled, fireDates(o.hour, o.minute, now), (at) =>
    o.snap ? buildEveningText(o.snap, o.child, at, o.regionName, o.pos) : { title: `${o.regionName} 내일 아이 외출 계획`, body: "앱을 열어 내일 날씨를 확인하세요" },
  );
}
