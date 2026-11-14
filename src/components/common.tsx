import type { ReactNode } from "react";
import type { Place, PlaceKind, WxHour } from "../lib/types";
import { fmtDistance } from "../lib/geo";

export const KIND_LABEL: Record<PlaceKind, string> = { playground: "놀이터", park: "공원", toilet: "화장실" };
export const KIND_EMOJI: Record<PlaceKind, string> = { playground: "🛝", park: "🌳", toilet: "🚻" };

const PUBLIC_SITES = ["도시공원", "어린이공원", "공원", "놀이터", "하천", "자연휴양림", "관광지", "유원지", "공공", "지역아동센터", "광장", "체육"];
/** 누구나 갈 수 있는 설치장소(아파트·학교·유치원 등 제한 시설 제외) */
export function isPublicSite(site: string): boolean {
  return PUBLIC_SITES.some((k) => site.includes(k));
}

export function placeDesc(p: Place): string {
  const parts: string[] = [];
  if (p.kind === "playground") {
    if (p.site) parts.push(p.site);
    if (p.indoor) parts.push("실내");
    if (p.water) parts.push("물놀이");
    if (p.excellent) parts.push("우수시설");
    if (p.installed) parts.push(`${p.installed.slice(0, 4)}년 설치`);
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
      <span className={`badge ${place.kind}`}>{KIND_EMOJI[place.kind]}</span>
      <span className="body">
        <span className="name">{place.name}</span>
        <span className="desc">{placeDesc(place)}</span>
      </span>
      {km != null && <span className="km">{fmtDistance(km)}</span>}
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

export function skyIcon(h: Pick<WxHour, "pty" | "sky" | "t">): string {
  if (h.pty === 3) return "🌨️";
  if (h.pty === 2) return "🌧️";
  if (h.pty === 1 || h.pty === 4) return "🌧️";
  const hour = Number(h.t.slice(11, 13));
  const night = hour < 6 || hour >= 19;
  if (h.sky >= 4) return "☁️";
  if (h.sky === 3) return night ? "☁️" : "⛅";
  return night ? "🌙" : "☀️";
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
