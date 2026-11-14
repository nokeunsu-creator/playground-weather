/**
 * 아침 알림(기기 로컬 알림, 서버 없음).
 * 앱을 열 때마다 "다음 알림 시각"에 맞는 예보로 본문을 만들어 다시 예약한다.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { inputFromHour, judge, LEVEL_EMOJI, pm10Grade, pm25Grade, PM_LABEL } from "./judge";
import type { ChildProfile, WxSnapshot } from "./types";
import { localIsoHour } from "./data";

const ID = 1001;

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
