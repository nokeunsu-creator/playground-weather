import type { ReactNode } from "react";
import type { Place, PlaceKind, WxHour } from "../lib/types";
import { fmtDistance } from "../lib/geo";
import { Icon, type IconName } from "./Icon";

import { floorList, rideList } from "../lib/rides";
import { venueStatus } from "../lib/venue";

export { rideList };
export const KIND_LABEL: Record<PlaceKind, string> = { playground: "놀이터", park: "공원", toilet: "화장실", nursing: "수유실", venue: "도서관·박물관" };
export const KIND_ICON: Record<PlaceKind, IconName> = { playground: "slide", park: "tree", toilet: "toilet", nursing: "bottle", venue: "book" };
/** 장소 하나에 맞는 아이콘(박물관·미술관은 기둥 아이콘, 물놀이 놀이터는 물방울) */
export function placeIcon(p: Place): IconName {
  if (p.kind === "venue" && /박물관|미술관/.test(p.venue ?? "")) return "museum";
  if (p.kind === "playground" && p.water) return "drop";
  return KIND_ICON[p.kind];
}

/**
 * 외부인이 못 들어가는 설치장소. 행안부 분류 기준 85,416곳 중 주택단지 46,277·유치원 7,186·학교 6,945·어린이집 6,864 등.
 * 나머지(도시공원 12,513, 놀이제공영업소 1,906, 식품접객업소 1,350, 야영장, 자연휴양림, 박물관, 육아종합지원센터 …)는 공개로 본다.
 */
const RESTRICTED_SITES = ["주택단지", "주상복합", "아파트", "빌라", "유치원", "어린이집", "학교", "학원", "종교시설", "아동복지시설", "기숙사", "사택", "교육기관", "직장"];
/** 누구나 갈 수 있는 설치장소인가 */
export function isPublicSite(site: string): boolean {
  if (!site) return true;
  return !RESTRICTED_SITES.some((k) => site.includes(k));
}

export function placeDesc(p: Place): string {
  const parts: string[] = [];
  if (p.kind === "playground") {
    if (p.site) parts.push(p.site);
    if (p.indoor) parts.push("실내");
    if (p.water) parts.push("물놀이");
    if (p.excellent) parts.push("우수시설");
    const rides = rideList(p);
    if (rides.length) parts.push(rides.slice(0, 3).join("·"));
    const floors = floorList(p);
    if (floors.includes("모래")) parts.push("모래");
  } else if (p.kind === "venue") {
    if (p.venue) parts.push(p.venue);
    const st = venueStatus(p);
    if (st.text) parts.push(st.text);
    if (p.fee) parts.push(p.fee);
  } else if (p.kind === "nursing") {
    if (p.spot) parts.push(p.spot);
    if (p.target) parts.push(p.target);
    if (p.father) parts.push("아빠 이용 가능");
  } else if (p.kind === "park") {
    if (p.parkType) parts.push(p.parkType);
    if (p.facilities?.length) parts.push(p.facilities.slice(0, 3).join("·"));
  } else {
    if (p.diaper) parts.push("기저귀교환대");
    if (p.facilities?.includes("어린이변기")) parts.push("어린이변기");
    if (p.open) parts.push(p.open);
  }
  return parts.join(" · ") || p.addr;
}

export function PlaceRow({ place, km, onClick }: { place: Place; km?: number; onClick?: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span className={`badge ${place.kind}`}>
        <Icon name={placeIcon(place)} size={20} />
      </span>
      <span className="body">
        <span className="name">{place.name}</span>
        <span className="desc">{placeDesc(place)}</span>
      </span>
      {km != null && <span className="km">{fmtDistance(km)}</span>}
      <span className="chev">
        <Icon name="chevron" size={18} />
      </span>
    </button>
  );
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog">
        <div className="grip" />
        {children}
      </div>
    </>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch ${on ? "on" : ""}`} aria-checked={on} role="switch" onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function skyIcon(h: Pick<WxHour, "pty" | "sky" | "t">): IconName {
  if (h.pty === 3 || h.pty === 2) return "snow";
  if (h.pty === 1 || h.pty === 4) return "rain";
  const hour = Number(h.t.slice(11, 13));
  const night = hour < 6 || hour >= 19;
  if (h.sky >= 4) return "cloud";
  if (h.sky === 3) return night ? "cloud" : "cloudSun";
  return night ? "moon" : "sun";
}

export function openExternal(url: string) {
  window.open(url, "_blank", "noopener");
}

export function mapLinks(p: Pick<Place, "name" | "lat" | "lng">) {
  const name = encodeURIComponent(p.name);
  return {
    kakao: `https://map.kakao.com/link/to/${name},${p.lat},${p.lng}`,
    naver: `https://map.naver.com/p/directions/-/${p.lng},${p.lat},${name}/-/walk`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`,
  };
}
