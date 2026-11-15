import type { Settings } from "../lib/store";
import type { Loc } from "../lib/location";
import { fmtDistance, haversineKm } from "../lib/geo";
import { KIND_ICON } from "../components/common";
import { Icon } from "../components/Icon";

export function Favorites({ settings, loc, onOpen }: { settings: Settings; loc?: Loc; onOpen: (id: string, sgg: string) => void }) {
  const favs = [...settings.favorites].reverse();
  return (
    <div className="screen">
      <div className="topbar">
        <h1>즐겨찾기</h1>
      </div>
      {favs.length === 0 && (
        <div className="empty">
          <Icon name="star" size={40} />
          <div>아직 없어요. 장소 상세에서 별표를 눌러 저장하세요.</div>
        </div>
      )}
      {favs.length > 0 && (
        <div className="list">
          {favs.map((f) => (
            <button key={f.id} className="row" onClick={() => onOpen(f.id, f.sgg)}>
              <span className={`badge ${f.kind}`}>
                <Icon name={KIND_ICON[f.kind]} size={20} />
              </span>
              <span className="body">
                <span className="name">{f.name}</span>
                <span className="desc">{f.addr}</span>
              </span>
              {loc && <span className="km">{fmtDistance(haversineKm(loc.lat, loc.lng, f.lat, f.lng))}</span>}
              <span className="chev">
                <Icon name="chevron" size={18} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
