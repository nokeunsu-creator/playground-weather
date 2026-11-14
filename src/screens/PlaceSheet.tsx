import type { Place } from "../lib/types";
import { fmtDistance } from "../lib/geo";
import { KIND_EMOJI, KIND_LABEL, mapLinks, openExternal, Sheet } from "../components/common";

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
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className={`badge ${p.kind}`} style={{ width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff" }}>
          {KIND_EMOJI[p.kind]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{p.name}</h2>
          <div className="sub">
            {KIND_LABEL[p.kind]}
            {km != null && ` · ${fmtDistance(km)}`}
            {p.excellent && " · 🏅 행안부 우수시설"}
          </div>
        </div>
        <button className="btn sm ghost" onClick={onFav} aria-label="즐겨찾기">
          {fav ? "⭐" : "☆"}
        </button>
      </div>

      <dl className="kv">
        <dt>주소</dt>
        <dd>{p.addr || "-"}</dd>
        {p.kind === "playground" && (
          <>
            <dt>설치장소</dt>
            <dd>
              {p.site ?? "-"}
              {p.indoor && " (실내)"}
              {p.water && " · 물놀이형"}
            </dd>
            <dt>설치일</dt>
            <dd>{p.installed ?? "-"}</dd>
            <dt>안전검사</dt>
            <dd>{p.inspectOk == null ? "-" : p.inspectOk ? "완료" : "확인 필요"}</dd>
            {p.rides?.length ? (
              <>
                <dt>놀이기구</dt>
                <dd>{p.rides.join(", ")}</dd>
              </>
            ) : null}
            {p.site && /아파트|주택|단지|빌라/.test(p.site) && (
              <>
                <dt>참고</dt>
                <dd>주거단지 안 놀이터는 입주민용일 수 있어요.</dd>
              </>
            )}
          </>
        )}
        {p.kind === "park" && (
          <>
            <dt>구분</dt>
            <dd>{p.parkType ?? "-"}</dd>
            <dt>시설</dt>
            <dd>{p.facilities?.join(", ") || "-"}</dd>
            <dt>면적</dt>
            <dd>{p.area ? `${Math.round(p.area).toLocaleString()}㎡` : "-"}</dd>
          </>
        )}
        {p.kind === "toilet" && (
          <>
            <dt>개방시간</dt>
            <dd>{p.open ?? "-"}</dd>
            <dt>기저귀교환대</dt>
            <dd>{p.diaper ?? "없음/정보없음"}</dd>
            <dt>어린이변기</dt>
            <dd>{p.facilities?.includes("어린이변기") ? "있음" : "없음/정보없음"}</dd>
          </>
        )}
        {p.tel && (
          <>
            <dt>전화</dt>
            <dd>
              <a href={`tel:${p.tel}`}>{p.tel}</a>
            </dd>
          </>
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
      <div className="btnrow">
        <button className="btn ghost" onClick={onMap}>
          🗺️ 지도에서 보기
        </button>
        <button className="btn ghost" onClick={share}>
          공유
        </button>
      </div>
    </Sheet>
  );
}
