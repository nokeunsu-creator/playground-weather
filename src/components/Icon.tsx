/** SF Symbols 느낌의 단색 선 아이콘(24×24, stroke). 이모지 대신 쓴다. */
export type IconName =
  | "house"
  | "map"
  | "star"
  | "starFill"
  | "gear"
  | "location"
  | "chevron"
  | "chevronDown"
  | "sun"
  | "moon"
  | "cloud"
  | "cloudSun"
  | "rain"
  | "snow"
  | "slide"
  | "tree"
  | "toilet"
  | "check"
  | "exclaim"
  | "xmark"
  | "thermo"
  | "clock"
  | "sparkle"
  | "shirt"
  | "bag"
  | "wind"
  | "drop"
  | "bell"
  | "child"
  | "share"
  | "pin"
  | "bottle"
  | "filter";

const P: Record<IconName, string> = {
  house: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15",
  star: "M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z",
  starFill: "M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5L2.5 9.9l6.6-.9z",
  gear:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  location: "M3 11l19-9-9 19-2-8z",
  chevron: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  cloud: "M17.5 19a4.5 4.5 0 0 0 .4-9 7 7 0 0 0-13.4 2A4 4 0 0 0 6 19z",
  cloudSun: "M6 6.5a3 3 0 1 1 5.6 1.5M6 2v1.5M2 6h1.5M17.5 21a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 7 21z",
  rain: "M17.5 16a4.5 4.5 0 0 0 .4-9 7 7 0 0 0-13.4 2A4 4 0 0 0 6 16M8 18v3M12 18v4M16 18v3",
  snow: "M17.5 16a4.5 4.5 0 0 0 .4-9 7 7 0 0 0-13.4 2A4 4 0 0 0 6 16M8 19v.01M12 21v.01M16 19v.01",
  slide: "M5 21V7M5 7h4M5 11h4M5 15h4M9 7l10 10M19 17h2M3 21h18",
  tree: "M12 2l5 8h-3l4 6h-5v6h-2v-6H6l4-6H7z",
  toilet: "M8.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM6 9.5h5l1 6.5h-1.5v5h-4v-5H5zM16 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13.5 9.5h5l2 7h-2v4.5h-5V16.5h-2z",
  check: "M5 12.5l4.5 4.5L19 7",
  exclaim: "M12 5v9M12 18v.5",
  xmark: "M6 6l12 12M18 6L6 18",
  thermo: "M12 3a2 2 0 0 0-2 2v9.3a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2zM12 10v5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  shirt: "M8 4l4 2 4-2 4 3-2 3-2-1v11H8V9l-2 1-2-3z",
  bag: "M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2",
  wind: "M4 8h11a3 3 0 1 0-3-3M4 14h14a3 3 0 1 1-3 3M4 11h7",
  drop: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  child: "M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM7 12l5-2 5 2M9 11v10M15 11v10M9 16h6",
  share: "M12 3v12M8 7l4-4 4 4M5 13v7h14v-7",
  pin: "M12 21s-6-5.3-6-11a6 6 0 1 1 12 0c0 5.7-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  bottle: "M11 2h2l1 3h-4zM9 5h6M9.5 5L8 8.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8.5L14.5 5M8 12h3M8 16h3",
  filter: "M4 6h16M7 12h10M10 18h4",
};

export const ICON_PATHS = P;

/** Leaflet 마커처럼 HTML 문자열이 필요한 곳용 */
export function iconSvg(name: IconName, size = 16, color = "#fff"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name]}"/></svg>`;
}

export function Icon({ name, size = 22, className, fill }: { name: IconName; size?: number; className?: string; fill?: boolean }) {
  const filled = fill || name === "starFill";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name]} />
    </svg>
  );
}
