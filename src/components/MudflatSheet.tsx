import { useEffect, useMemo, useState } from "react";
import type { ChildProfile, MudflatFile, MudflatSpot, WxSnapshot } from "../lib/types";
import { fmtDistance } from "../lib/geo";
import { loadWx } from "../lib/data";
import { inputFromHour, judge, LEVEL_LABEL, type Level } from "../lib/judge";
import { dayLabel, spotDay, upcoming, weekRanges } from "../lib/tide";
import { nextDates, nowHm, SAFETY_MORE, SAFETY_TIPS } from "../screens/Mudflat";
import { mapLinks, openExternal, Sheet } from "./common";
import { Icon } from "./Icon";

interface Props {
  spot: MudflatSpot;
  data: MudflatFile;
  date: string;
  km?: number;
  child: ChildProfile;
  onClose: () => void;
}

const LEVEL_TEXT: Record<Level, string> = { good: "좋음", caution: "짧게", bad: "나쁨" };

/** 체험 시간 안 시간별 아이 판정 중 가장 나쁜 것 */
function windowJudge(wx: WxSnapshot | undefined, child: ChildProfile, date: string, start: string, end: string) {
  if (!wx) return undefined;
  const rows = wx.hours.filter((h) => h.t.startsWith(date) && h.t.slice(11, 16) >= start.slice(0, 2) + ":00" && h.t.slice(11, 16) < end);
  if (!rows.length) return undefined;
  const js = rows.map((h) => judge(inputFromHour(h, wx.now, wx.idx), child));
  const rank = { good: 0, caution: 1, bad: 2 } as const;
  const worst = js.reduce((a, b) => (rank[b.level] > rank[a.level] ? b : a));
  return { level: worst.level, reason: worst.reasons[0]?.text };
}

export function MudflatSheet({ spot, data, date: initial, km, child, onClose }: Props) {
  const dates = useMemo(() => nextDates(7), []);
  const today = dates[0];
  const [date, setDate] = useState(dates.includes(initial) ? initial : today);
  const [wx, setWx] = useState<WxSnapshot>();
  const st = spot.station ? data.stations[spot.station] : undefined;
  const ranges = useMemo(() => weekRanges(st, dates), [st, dates]);
  const day = useMemo(() => spotDay(spot, data.stations, date), [spot, data, date]);
  const links = mapLinks(spot);

  useEffect(() => {
    if (!spot.sgg) return;
    let alive = true;
    loadWx(spot.sgg)
      .then((w) => alive && setWx(w))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [spot.sgg]);

  const up = upcoming(day, today, nowHm());
  const kid = up.windows[0] ? windowJudge(wx, child, date, up.windows[0].start, up.windows[0].end) : undefined;
  const range = ranges[date];

  return (
    <Sheet onClose={onClose}>
      <div className="hd">
        <span className="badge mudflat">
          <Icon name="shell" size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{spot.name}</h2>
          <div className="sub">
            {spot.src === "khoa" ? "갯벌체험지수 장소" : "갯벌 체험 마을"}
            {km != null && ` · ${fmtDistance(km)}`}
          </div>
        </div>
      </div>

      <div className="week" role="tablist" aria-label="이번 주 물때">
        {dates.map((d) => {
          const sd = spotDay(spot, data.stations, d);
          const u = upcoming(sd, today, nowHm());
          const w = u.windows[0];
          return (
            <button key={d} role="tab" aria-selected={d === date} className={`wk ${d === date ? "on" : ""}`} onClick={() => setDate(d)}>
              <span className="wk-d">{dayLabel(d, today)}</span>
              <span className={`wk-l ${u.past ? "na" : (sd.level ?? (w ? "good" : "na"))}`}>
                {u.past ? "지남" : sd.from === "closed" ? "불가" : sd.level ? LEVEL_TEXT[sd.level] : w ? "가능" : "–"}
              </span>
              <span className="wk-t">{w ? w.start : ""}</span>
              {ranges[d]?.cls === "big" && <span className="wk-b">물 많이</span>}
            </button>
          );
        })}
      </div>

      <dl className="kv">
        <div>
          <dt>체험 시간</dt>
          <dd>
            {day.from === "closed" ? (
              <>
                체험 불가
                <small className="kv-note">국립해양조사원이 이날은 갯벌 체험이 어렵다고 예보했어요. 다른 날을 골라 보세요</small>
              </>
            ) : up.past ? (
              <>
                {day.windows.map((w) => `${w.start} ~ ${w.end}`).join(", ")}
                <small className="kv-note">오늘 체험 시간은 지났어요. 다른 날을 골라 보세요</small>
              </>
            ) : day.windows.length ? (
              <>
                {up.windows.map((w) => `${w.start} ~ ${w.end}`).join(", ")}
                <small className="kv-note">{day.from === "index" ? "국립해양조사원 체험 가능 시간" : "물때로 계산(저조 2시간 전 ~ 1시간 후, 해 있는 동안)"}</small>
              </>
            ) : day.events.length ? (
              "낮에는 물이 덜 빠져요"
            ) : (
              "물때 정보 준비 중"
            )}
          </dd>
        </div>
        {day.fcst && (
          <div>
            <dt>체험지수</dt>
            <dd>
              {day.fcst.index ?? "–"}
              {day.fcst.weather && ` · ${day.fcst.weather}`}
              {day.fcst.tmin != null && day.fcst.tmax != null && ` · ${Math.round(day.fcst.tmin)}°~${Math.round(day.fcst.tmax)}°`}
              {day.fcst.wmax != null && ` · 바람 최대 ${day.fcst.wmax}m/s`}
            </dd>
          </div>
        )}
        {kid && (
          <div>
            <dt>아이 날씨</dt>
            <dd>
              <span className={`chip ${kid.level}`}>{LEVEL_LABEL[kid.level]}</span>
              {kid.reason && <small className="kv-note">{kid.reason}</small>}
            </dd>
          </div>
        )}
        {day.events.length > 0 && (
          <div>
            <dt>물때</dt>
            <dd>
              <ul className="tide-list">
                {day.events.map((e) => (
                  <li key={e.t} className={e.type}>
                    <b>{e.type === "low" ? "썰물(저조)" : "밀물(고조)"}</b> {e.t.slice(11, 16)} <span>{e.h}cm</span>
                  </li>
                ))}
              </ul>
              {range && range.cls !== "mid" && (
                <small className="kv-note">{range.cls === "big" ? "이번 주 중 물이 가장 많이 빠지는 편이에요" : "물이 적게 빠지는 날(조금 무렵)이에요"}</small>
              )}
            </dd>
          </div>
        )}
        {day.sun && (
          <div>
            <dt>해</dt>
            <dd>
              뜸 {day.sun.rise} · 짐 {day.sun.set}
            </dd>
          </div>
        )}
        {st && (
          <div>
            <dt>물때 기준</dt>
            <dd>
              {st.name} 예보지점{spot.stationKm != null && `, ${spot.stationKm}km`}
              {spot.stationKm != null && spot.stationKm > 20 && <small className="kv-note">예보지점이 멀어 실제 물때와 차이가 날 수 있어요</small>}
            </dd>
          </div>
        )}
        {spot.programs?.length ? (
          <div>
            <dt>프로그램</dt>
            <dd>{spot.programs.join(", ")}</dd>
          </div>
        ) : null}
        {spot.addr && (
          <div>
            <dt>주소</dt>
            <dd>{spot.addr}</dd>
          </div>
        )}
        {spot.tel && (
          <div>
            <dt>문의</dt>
            <dd>
              <a href={`tel:${spot.tel}`}>{spot.tel}</a>
              <small className="kv-note">체험 운영 여부와 요금은 미리 전화로 확인하세요</small>
            </dd>
          </div>
        )}
      </dl>

      <div className="btnrow">
        <button className="btn primary" onClick={() => openExternal(links.kakao)}>
          카카오맵 길찾기
        </button>
        <button className="btn" onClick={() => openExternal(links.naver)}>
          네이버지도
        </button>
      </div>
      {spot.url && /^https?:\/\//.test(spot.url) && (
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={() => openExternal(spot.url!)}>
            <Icon name="link" size={18} /> 체험마을 홈페이지
          </button>
        </div>
      )}
      <ul className="tips small">
        {[SAFETY_TIPS[0], SAFETY_MORE[1]].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Sheet>
  );
}
