import type { Settings } from "../lib/store";
import type { Loc } from "../lib/location";
import { fmtDistance, haversineKm } from "../lib/geo";
import { KIND_EMOJI } from "../components/common";

export function Favorites({ settings, loc, onOpen }: { settings: Settings; loc?: Loc; onOpen: (id: string, sgg: string) => void }) {
  const favs = [...settings.favorites].reverse();
  return (
    <div className="screen">
      <div className="topbar">
        <h1>즐겨찾기</h1>
      </div>
      {favs.length === 0 && <div className="empty">아직 없어요. 지도나 추천 목록에서 ☆ 를 눌러 저장하세요.</div>}
      <div className="list">
        {favs.map((f) => (
          <button key={f.id} className="row" onClick={() => onOpen(f.id, f.sgg)}>
            <span className={`badge ${f.kind}`}>{KIND_EMOJI[f.kind]}</span>
            <span className="body">
              <span className="name">{f.name}</span>
              <span className="desc">{f.addr}</span>
            </span>
            {loc && <span className="km">{fmtDistance(haversineKm(loc.lat, loc.lng, f.lat, f.lng))}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
