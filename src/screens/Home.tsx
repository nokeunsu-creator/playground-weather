import { useEffect, useMemo, useState } from "react";
import type { DataIndex, Place, SggInfo, WxSnapshot } from "../lib/types";
import type { Settings } from "../lib/store";
import type { Loc } from "../lib/location";
import { bestWindow, inputFromHour, inputFromNow, judge, LEVEL_EMOJI, pm10Grade, pm25Grade, PM_LABEL, uvLabel } from "../lib/judge";
import { fmtAgo, localIsoHour, nearbyPlaces, type NearbyPlace } from "../lib/data";
import { isPublicSite, PlaceRow, skyIcon } from "../components/common";
import { RegionPicker } from "../components/RegionPicker";

interface Props {
  index?: DataIndex;
  indexError?: string;
  sgg?: SggInfo;
  wx?: WxSnapshot;
  wxError?: string;
  settings: Settings;
  loc?: Loc;
  locating: boolean;
  onOpenDetail: (p: Place, km?: number) => void;
  onChangeRegion: (code: string) => void;
  onRefresh: () => void;
  onOpenMap: () => void;
}

export function Home({ index, indexError, sgg, wx, wxError, settings, loc, locating, onOpenDetail, onChangeRegion, onRefresh, onOpenMap }: Props) {
  const [pick, setPick] = useState(false);
  const [nearby, setNearby] = useState<NearbyPlace[]>();
  const now = new Date();
  const nowKey = localIsoHour(now);
  const today = nowKey.slice(0, 10);

  const j = useMemo(() => {
    if (!wx) return undefined;
    const row = wx.hours.find((h) => h.t === nowKey);
    return judge(inputFromNow(wx.now, row, wx.idx, now), settings.child);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wx, settings.child, nowKey]);

  const best = useMemo(() => (wx ? bestWindow(wx, settings.child, today) : undefined), [wx, settings.child, today]);

  const hours = useMemo(() => {
    if (!wx) return [];
    return wx.hours.filter((h) => h.t >= nowKey).slice(0, 14).map((h) => ({ h, lv: judge(inputFromHour(h, wx.now, wx.idx), settings.child).level }));
  }, [wx, settings.child, nowKey]);

  useEffect(() => {
    if (!index || !loc) return;
    let alive = true;
    nearbyPlaces(index, loc.lat, loc.lng, 2.5)
      .then((r) => alive && setNearby(r))
      .catch(() => alive && setNearby([]));
    return () => {
      alive = false;
    };
  }, [index, loc]);

  const suggestions = useMemo(() => {
    if (!nearby) return [];
    const bad = j?.level === "bad";
    const pg = nearby.filter((n) => n.place.kind === "playground");
    const parks = nearby.filter((n) => n.place.kind === "park" && (n.place.facilities?.length ?? 0) > 0);
    if (bad) return pg.filter((n) => n.place.indoor).slice(0, 5);
    const outdoor = pg.filter((n) => !n.place.indoor && isPublicSite(n.place.site ?? ""));
    return [...outdoor, ...parks].sort((a, b) => a.km - b.km).slice(0, 5);
  }, [nearby, j?.level]);

  const g10 = pm10Grade(wx?.now.pm10);
  const g25 = pm25Grade(wx?.now.pm25);
  const uvNow = wx?.hours.find((h) => h.t === nowKey)?.uv ?? wx?.idx.uvMax;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>놀이터 날씨</h1>
        <button className="region" onClick={() => setPick(true)} disabled={!index}>
          {loc?.source === "gps" ? "📍" : loc?.source === "home" ? "🏠" : "📌"} {sgg ? `${sgg.sido} ${sgg.name}` : locating ? "위치 확인 중…" : "지역 선택"}
          <small>▾</small>
        </button>
      </div>

      {indexError && <div className="card">{indexError}</div>}
      {!wx && !wxError && !indexError && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}
      {wxError && (
        <div className="card">
          <div>{wxError}</div>
          <div className="btnrow">
            <button className="btn" onClick={onRefresh}>
              다시 시도
            </button>
          </div>
        </div>
      )}

      {wx && j && (
        <>
          <section className={`card judge ${j.level}`}>
            <div className="level">
              <span className="emoji">{LEVEL_EMOJI[j.level]}</span>
              <div>
                <div className="headline">{j.headline}</div>
                <div className="sub">
                  {settings.child.age === "infant" ? "0~2세" : settings.child.age === "toddler" ? "3~6세" : "7세 이상"} 기준
                  {settings.child.sensitive && " · 민감군"} {wx.mock && <span className="mock">모의 데이터</span>}
                </div>
              </div>
              <div className="score">
                <b>{j.score}</b>점
              </div>
            </div>
            <div className="meta">
              <span>🌡️ {Math.round(wx.now.temp)}℃ (체감 {Math.round(wx.now.feels)}℃)</span>
              {j.maxMinutes > 0 ? <span>⏱️ 야외 {j.maxMinutes >= 120 ? "자유롭게" : `${j.maxMinutes}분 이내`}</span> : <span>🏠 실내 놀이 추천</span>}
              {best && best.level !== "bad" && (
                <span>
                  ✨ 가장 좋은 시간 {best.start}~{best.end}
                </span>
              )}
            </div>
            {j.reasons.length > 0 && (
              <div className="chips">
                {j.reasons.map((r) => (
                  <span key={r.key} className={`chip ${r.level}`}>
                    {r.text}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>지금 공기와 햇빛</h2>
            <div className="tiles">
              <div className="tile">
                <div className="k">미세먼지</div>
                <div className="v">{wx.now.pm10 ?? "-"}</div>
                <div className={`g g${g10 ?? 0}`}>{g10 != null ? PM_LABEL[g10] : "정보없음"}</div>
              </div>
              <div className="tile">
                <div className="k">초미세먼지</div>
                <div className="v">{wx.now.pm25 ?? "-"}</div>
                <div className={`g g${g25 ?? 0}`}>{g25 != null ? PM_LABEL[g25] : "정보없음"}</div>
              </div>
              <div className="tile">
                <div className="k">자외선</div>
                <div className="v">{uvNow ?? "-"}</div>
                <div className={`g g${uvNow == null ? 0 : uvNow < 3 ? 1 : uvNow < 6 ? 2 : 3}`}>{uvNow != null ? uvLabel(uvNow) : "정보없음"}</div>
              </div>
              <div className="tile">
                <div className="k">{wx.idx.pollen != null ? "꽃가루" : wx.idx.cold != null ? "감기지수" : "습도"}</div>
                <div className="v">
                  {wx.idx.pollen != null
                    ? ["낮음", "보통", "높음", "매우높음"][wx.idx.pollen]
                    : wx.idx.cold != null
                      ? ["낮음", "보통", "높음", "매우높음"][wx.idx.cold]
                      : `${wx.now.reh}%`}
                </div>
                <div className="g">{wx.now.station ? `측정소 ${wx.now.station}` : ""}</div>
              </div>
            </div>
            <div className="sub" style={{ marginTop: 8 }}>
              날씨 {fmtAgo(wx.fetchedAt)} · 미세먼지 {wx.now.pmAt ? wx.now.pmAt.slice(5, 16).replace("T", " ") : "-"} 기준
            </div>
          </section>

          <section className="card">
            <h2>시간별</h2>
            <div className="hours">
              {hours.map(({ h, lv }) => (
                <div key={h.t} className="hour">
                  <div className="t">{h.t.slice(11, 13)}시</div>
                  <div className="ic">{skyIcon(h)}</div>
                  <div className="tmp">{Math.round(h.temp)}°</div>
                  <div className="pop">{h.pop > 0 ? `${h.pop}%` : " "}</div>
                  <div className={`dot ${lv}`} />
                </div>
              ))}
            </div>
            {wx.days[0] && (
              <div className="sub" style={{ marginTop: 6 }}>
                오늘 최저 {wx.days[0].tmn ?? "-"}° · 최고 {wx.days[0].tmx ?? "-"}°
              </div>
            )}
          </section>

          <section className="card">
            <h2>아이 옷차림 · 준비물</h2>
            <div className="chips">
              {j.outfit.map((o) => (
                <span key={o} className="chip">
                  👕 {o}
                </span>
              ))}
              {j.items.map((o) => (
                <span key={o} className="chip">
                  🎒 {o}
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      {index && loc && (
        <section className="card">
          <h2>{j?.level === "bad" ? "근처 실내 놀이터" : "근처 놀이터 · 공원"}</h2>
          {!nearby && <div className="sub">찾는 중…</div>}
          {nearby && suggestions.length === 0 && (
            <div className="sub">
              {j?.level === "bad"
                ? "2.5km 안에 등록된 실내 놀이시설이 없어요. 지도에서 범위를 넓혀 보세요."
                : "2.5km 안에 등록된 공공 놀이터·공원이 아직 없어요. 지도에서 더 둘러보세요."}
            </div>
          )}
          <div className="list">
            {suggestions.map((n) => (
              <PlaceRow key={n.place.id} place={n.place} km={n.km} onClick={() => onOpenDetail(n.place, n.km)} />
            ))}
          </div>
          <div className="btnrow">
            <button className="btn block" onClick={onOpenMap}>
              🗺️ 지도에서 모두 보기
            </button>
          </div>
        </section>
      )}

      <p className="notice">
        출처: 기상청·한국환경공단(에어코리아)·행정안전부 공공데이터(공공누리 1유형). 판정은 참고용이며 아이 상태와 현장 상황을 우선하세요.
        {index && ` 장소 데이터 ${index.builtAt.slice(0, 10)} 빌드.`}
      </p>

      {pick && index && <RegionPicker index={index} value={sgg?.code} onPick={onChangeRegion} onClose={() => setPick(false)} />}
    </div>
  );
}
