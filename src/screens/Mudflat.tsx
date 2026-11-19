import { useMemo, useState } from "react";
import type { MudflatFile, MudflatSpot } from "../lib/types";
import type { Loc } from "../lib/location";
import { localIsoHour } from "../lib/data";
import { fmtDistance, haversineKm } from "../lib/geo";
import { dayLabel, spotDay, upcoming, type SpotDay } from "../lib/tide";
import { Icon } from "../components/Icon";

interface Props {
  data: MudflatFile;
  loc?: Loc;
  onOpen: (spot: MudflatSpot, date: string, km?: number) => void;
}

export function nextDates(n: number, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => localIsoHour(new Date(from.getTime() + i * 86400000)).slice(0, 10));
}

/** 지금 "HH:MM" */
export const nowHm = (at = new Date()) => `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/** 목록 한 줄 설명. 오늘 이미 끝난 체험 시간은 "지났어요"로 */
export function spotLine(d: SpotDay, spot: MudflatSpot, today = d.date, now = "00:00"): string {
  const lows = d.events.filter((e) => e.type === "low").map((e) => e.t.slice(11, 16));
  const { windows, past } = upcoming(d, today, now);
  if (past) return "오늘 체험 시간은 지났어요";
  if (d.from === "closed") return `${d.fcst?.index ?? "체험불가"} · 국립해양조사원 예보`;
  if (d.from === "index") {
    const w = windows[0];
    return `${d.fcst?.index ?? "체험"} · ${w.start}~${w.end}`;
  }
  if (d.from === "tide") return `썰물 ${lows.join(", ")} · 추천 ${windows.map((w) => `${w.start}~${w.end}`).join(", ")}`;
  if (lows.length) return `썰물 ${lows.join(", ")} · 낮에는 물이 덜 빠져요`;
  return spot.programs?.join(" · ") || "물때 정보 준비 중";
}

export const SAFETY_TIPS = [
  "썰물이 시작된 뒤 들어가고, 저조 시각 1시간 뒤에는 나오세요. 밀물은 생각보다 빨리 들어와요.",
  "갯골(물길)은 물이 먼저 차오르니 건너지 마세요.",
  "아이는 늘 어른 손 닿는 곳에 두고 장화·장갑·모자를 챙기세요.",
];
export const SAFETY_MORE = [
  "안개가 끼거나 바람이 세면 들어가지 마세요. 방향을 잃기 쉬워요.",
  "마을어장은 어촌계가 관리해요. 체험장 안내에 따라 정해진 곳에서만 캐세요. 허가 없이 캐면 불법일 수 있어요.",
  "휴대폰은 방수팩에 넣고, 위급하면 바로 122(해양경찰)에 신고하세요.",
];

export function MudflatScreen({ data, loc, onOpen }: Props) {
  const dates = useMemo(() => nextDates(7), []);
  const today = dates[0];
  const [date, setDate] = useState(today);
  const [more, setMore] = useState(false);
  const hasTide = Object.keys(data.stations).length > 0;

  const rows = useMemo(() => {
    const list = data.spots.map((s) => ({ s, km: loc ? haversineKm(loc.lat, loc.lng, s.lat, s.lng) : undefined, d: spotDay(s, data.stations, date) }));
    if (loc) list.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
    return list.slice(0, 40);
  }, [data, loc, date]);

  return (
    <div className="screen">
      <div className="topbar">
        <h1>갯벌</h1>
      </div>

      <section className="card">
        <h2>조개 캐러 가기 전에</h2>
        <ul className="tips">
          {(more ? [...SAFETY_TIPS, ...SAFETY_MORE] : SAFETY_TIPS).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="judge-actions">
          <button className="btn sm ghost" onClick={() => setMore((v) => !v)}>
            {more ? "접기" : "안전 수칙 더 보기"}
          </button>
        </div>
      </section>

      {!hasTide && (
        <div className="card">
          <div className="sub">물때 정보를 준비하고 있어요. 지금은 갯벌 체험 마을과 체험 프로그램만 보여 드려요.</div>
        </div>
      )}

      <div className="day-chips" role="tablist" aria-label="날짜">
        {dates.map((d) => (
          <button key={d} role="tab" aria-selected={d === date} className={`chip ${d === date ? "on" : ""}`} onClick={() => setDate(d)}>
            {dayLabel(d, today)}
          </button>
        ))}
      </div>

      <section className="card">
        <h2>{loc ? "가까운 갯벌 체험" : "갯벌 체험"}</h2>
        <div className="list">
          {rows.map(({ s, km, d }) => (
            <button key={s.id} className="row" onClick={() => onOpen(s, date, km)}>
              <span className="badge mudflat">
                <Icon name="shell" size={20} />
              </span>
              <span className="body">
                <span className="name">
                  {d.level && <i className={`dot ${d.level} inline`} />}
                  {s.name}
                </span>
                <span className="desc">{spotLine(d, s, today, nowHm())}</span>
              </span>
              {km != null && <span className="km">{fmtDistance(km)}</span>}
              <span className="chev">
                <Icon name="chevron" size={18} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <p className="notice">
        국립해양조사원 조석예보·갯벌체험지수, 전국농어촌체험휴양마을 표준데이터(공공누리 1유형). 물때는 가까운 예보지점 기준이라 현장과 다를 수 있으니 체험장 안내를 꼭 확인하세요.
      </p>
    </div>
  );
}
