import type { Place } from "../lib/types";
import { fmtDistance } from "../lib/geo";
import { isPublicSite, KIND_LABEL, mapLinks, openExternal, placeIcon, rideList, Sheet } from "../components/common";
import { floorList } from "../lib/rides";
import { hoursRows, venueStatus } from "../lib/venue";
import { Icon } from "../components/Icon";

interface Props {
  place: Place;
  km?: number;
  fav: boolean;
  onFav: () => void;
  onMap: () => void;
  onClose: () => void;
}

export function PlaceSheet({ place: p, km, fav, onFav, onMap, onClose }: Props) {
  const links = mapLinks(p);
  const share = async () => {
    const text = `${p.name} (${KIND_LABEL[p.kind]})\n${p.addr}\n${links.kakao}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text });
      else {
        await navigator.clipboard.writeText(text);
        alert("주소를 복사했어요");
      }
    } catch {
      /* cancelled */
    }
  };
  const rows: [string, string][] = [["주소", p.addr || "–"]];
  if (p.kind === "playground") {
    rows.push(["설치장소", `${p.site ?? "–"}${p.indoor ? " · 실내" : ""}${p.water ? " · 물놀이형" : ""}`]);
    if (p.pub != null) rows.push(["구분", p.pub ? "공공" : "민간"]);
    const rides = rideList(p);
    if (rides.length) rows.push(["놀이기구", rides.join(", ")]);
    const floors = floorList(p);
    if (floors.length) rows.push(["바닥", floors.join(", ")]);
    rows.push(["설치일", p.installed ?? "–"]);
    if (p.inspectOk != null) rows.push(["안전검사", p.inspectOk ? "완료" : "확인 필요"]);
  } else if (p.kind === "park") {
    rows.push(["구분", p.parkType ?? "–"], ["시설", p.facilities?.join(", ") || "–"], ["면적", p.area ? `${Math.round(p.area).toLocaleString()}㎡` : "–"]);
  } else if (p.kind === "venue") {
    rows.push(["구분", p.venue ?? "–"]);
    const st = venueStatus(p);
    if (st.text) rows.push(["오늘", st.text]);
    rows.push(...hoursRows(p));
    if (p.closed) rows.push(["휴관", p.closed.replace(/\+/g, ", ")]);
    if (p.fee) rows.push(["관람료", p.fee]);
    if (p.facilities?.length) rows.push(["편의시설", p.facilities.join(", ")]);
  } else if (p.kind === "nursing") {
    rows.push(["위치", p.spot ?? "–"], ["이용대상", p.target ?? "–"]);
    if (p.father != null) rows.push(["아빠 이용", p.father ? "가능" : "어려움"]);
  } else {
    rows.push(["개방시간", p.open ?? "–"], ["기저귀교환대", p.diaper ?? "없음 / 정보없음"], ["어린이변기", p.facilities?.includes("어린이변기") ? "있음" : "없음 / 정보없음"]);
  }
  if (p.tel) rows.push(["전화", p.tel]);
  // 지도 '공공만' 필터·홈 추천과 같은 기준(종교시설·학원·직장 등 포함)
  const restricted = p.kind === "playground" && !!p.site && !isPublicSite(p.site);

  return (
    <Sheet onClose={onClose}>
      <div className="hd">
        <span className={`badge ${p.kind}`}>
          <Icon name={placeIcon(p)} size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{p.name}</h2>
          <div className="sub">
            {KIND_LABEL[p.kind]}
            {km != null && ` · ${fmtDistance(km)}`}
            {p.excellent && " · 행안부 우수시설"}
          </div>
        </div>
        <button className={`iconbtn ${fav ? "on" : ""}`} onClick={onFav} aria-label="즐겨찾기">
          <Icon name={fav ? "starFill" : "star"} size={20} />
        </button>
        <button className="iconbtn" onClick={share} aria-label="공유">
          <Icon name="share" size={20} />
        </button>
      </div>

      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{k === "전화" ? <a href={`tel:${v}`}>{v}</a> : v}</dd>
          </div>
        ))}
        {restricted && (
          <div>
            <dt>참고</dt>
            <dd>시설 이용자(입주민·원생) 전용일 수 있어요.</dd>
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
      <div className="btnrow" style={{ marginTop: 10 }}>
        <button className="btn ghost" onClick={onMap}>
          <Icon name="map" size={18} /> 지도에서 보기
        </button>
      </div>
    </Sheet>
  );
}
