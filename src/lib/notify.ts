/**
 * 아침 알림·저녁 알림(기기 로컬 알림, 서버 없음).
 * 앱을 열 때마다 "다음 알림 시각"에 맞는 예보로 본문을 만들어 다시 예약한다.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { dayPlan, inputFromHour, judge, LEVEL_EMOJI, pm10Grade, pm25Grade, PM_LABEL } from "./judge";
import type { ChildProfile, WxSnapshot } from "./types";
import { localIsoHour } from "./data";

const ID = 1001;
const EVENING_ID = 1002;

export function nextFireDate(hour: number, minute: number, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime() + 60_000) d.setDate(d.getDate() + 1);
  return d;
}

export function buildMorningText(snap: WxSnapshot, child: ChildProfile, fireAt: Date, regionName: string): { title: string; body: string } {
  const target = new Date(fireAt.getTime() + 60 * 60 * 1000);
  const key = localIsoHour(target);
  const row = snap.hours.find((h) => h.t === key) ?? snap.hours.find((h) => h.t.startsWith(key.slice(0, 10)));
  const title = `${regionName} 오늘 아이 외출 날씨`;
  if (!row) return { title, body: "앱을 열어 오늘 판정을 확인하세요" };
  const j = judge(inputFromHour(row, snap.now, snap.idx), child);
  const g = Math.max(pm10Grade(snap.now.pm10) ?? 0, pm25Grade(snap.now.pm25) ?? 0);
  const pm = snap.now.pm10 != null || snap.now.pm25 != null ? ` · 미세먼지 ${PM_LABEL[g]}` : "";
  const body = `${LEVEL_EMOJI[j.level]} ${j.headline} · ${Math.round(row.temp)}℃${pm} · ${j.outfit[0] ?? ""}`;
  return { title, body };
}

/** 저녁 알림: 다음 날 07~19시 중 가장 좋은 2시간과 기온·옷차림 */
export function buildEveningText(snap: WxSnapshot, child: ChildProfile, fireAt: Date, regionName: string): { title: string; body: string } {
  const tomorrow = localIsoHour(new Date(fireAt.getTime() + 24 * 3600 * 1000)).slice(0, 10);
  const title = `${regionName} 내일 아이 외출 계획`;
  const plan = dayPlan(snap, child, tomorrow);
  const best = plan.best;
  if (!best) return { title, body: "앱을 열어 내일 날씨를 확인하세요" };
  const temps = snap.hours.filter((h) => h.t.startsWith(tomorrow)).map((h) => h.temp);
  const range = temps.length ? ` · ${Math.round(Math.min(...temps))}°~${Math.round(Math.max(...temps))}°` : "";
  const hrs = `${Number(best.start.slice(0, 2))}~${Number(best.end.slice(0, 2))}시`;
  const row = snap.hours.find((h) => h.t === `${tomorrow}T${best.start}`);
  const outfit = row ? judge(inputFromHour(row, snap.now, snap.idx), child).outfit[0] : undefined;
  if (best.level === "bad") {
    return { title, body: `${LEVEL_EMOJI.bad} 내일은 실내 놀이 추천${best.reason ? ` · ${best.reason}` : ""}${range} · 근처 도서관·박물관을 찾아보세요` };
  }
  const lead = best.level === "good" ? `내일은 ${hrs}가 가장 좋아요` : `내일은 ${hrs}가 그나마 나아요${best.reason ? ` (${best.reason})` : ""}`;
  return { title, body: `${LEVEL_EMOJI[best.level]} ${lead}${range}${outfit ? ` · ${outfit}` : ""}` };
}

async function scheduleOne(id: number, enabled: boolean, at: Date, text: { title: string; body: string }): Promise<"scheduled" | "cancelled" | "denied" | "unsupported"> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    /* ignore */
  }
  if (!enabled) return "cancelled";
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return "denied";
    await LocalNotifications.schedule({
      notifications: [{ id, title: text.title, body: text.body, schedule: { at, allowWhileIdle: true }, smallIcon: "ic_stat_notify" }],
    });
    return "scheduled";
  } catch (e) {
    console.warn("notification schedule failed", e);
    return "unsupported";
  }
}

export async function rescheduleEvening(opts: {
  enabled: boolean;
  hour: number;
  minute: number;
  snap?: WxSnapshot;
  child: ChildProfile;
  regionName: string;
}): Promise<"scheduled" | "cancelled" | "denied" | "unsupported"> {
  const at = nextFireDate(opts.hour, opts.minute);
  const text = opts.snap
    ? buildEveningText(opts.snap, opts.child, at, opts.regionName)
    : { title: `${opts.regionName} 내일 아이 외출 계획`, body: "앱을 열어 내일 날씨를 확인하세요" };
  return scheduleOne(EVENING_ID, opts.enabled, at, text);
}

export async function rescheduleMorning(opts: {
  enabled: boolean;
  hour: number;
  minute: number;
  snap?: WxSnapshot;
  child: ChildProfile;
  regionName: string;
}): Promise<"scheduled" | "cancelled" | "denied" | "unsupported"> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID }] });
  } catch {
    /* ignore */
  }
  if (!opts.enabled) return "cancelled";
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return "denied";
    const at = nextFireDate(opts.hour, opts.minute);
    const text = opts.snap
      ? buildMorningText(opts.snap, opts.child, at, opts.regionName)
      : { title: `${opts.regionName} 오늘 아이 외출 날씨`, body: "앱을 열어 오늘 판정을 확인하세요" };
    await LocalNotifications.schedule({
      notifications: [{ id: ID, title: text.title, body: text.body, schedule: { at, allowWhileIdle: true }, smallIcon: "ic_stat_notify" }],
    });
    return "scheduled";
  } catch (e) {
    console.warn("notification schedule failed", e);
    return "unsupported";
  }
}
