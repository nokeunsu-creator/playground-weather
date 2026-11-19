import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { DataIndex, Place, PlaceKind, WxSnapshot } from "../lib/types";
import type { Settings } from "../lib/store";
import type { Loc } from "../lib/location";
import { loadPlaces, nearestSggs } from "../lib/data";
import { haversineKm } from "../lib/geo";
import { isPublicSite, KIND_ICON, KIND_LABEL, placeIcon, Sheet } from "../components/common";
import { FLOORS, matchesRides, RIDE_GROUPS, rideKeys } from "../lib/rides";
import { Icon, iconSvg } from "../components/Icon";

export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  placeId?: string;
}

interface Props {
  index: DataIndex;
  loc?: Loc;
  settings: Settings;
  wx?: WxSnapshot;
  focus?: MapFocus;
  onOpenDetail: (p: Place, km?: number) => void;
  onRelocate: () => void;
}

interface Filters {
  kinds: Record<PlaceKind, boolean>;
  publicOnly: boolean;
  indoor: boolean;
  water: boolean;
  diaper: boolean;
  /** 모두 갖춘 놀이터만(RIDE_GROUPS key) */
  rides: string[];
  /** FLOORS key */
  floor?: string;
}

const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY as string | undefined;

function tileLayer(): L.TileLayer {
  if (VWORLD_KEY) {
    return L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`, {
      maxZoom: 19,
      attribution: "© 국토교통부 브이월드",
    });
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap (개발용 타일, 출시 시 브이월드 키 필요)",
  });
}

function markerIcon(p: Place): L.DivIcon {
  const cls = p.kind === "playground" && p.indoor ? "indoor" : p.kind;
  return L.divIcon({
    className: "",
    html: `<div class="pw-marker ${cls}">${iconSvg(placeIcon(p), 15)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

export function MapScreen({ index, loc, focus, onOpenDetail, onRelocate }: Props) {
  const mapRef = useRef<L.Map | undefined>(undefined);
  const clusterRef = useRef<L.MarkerClusterGroup | undefined>(undefined);
  const meRef = useRef<L.Marker | undefined>(undefined);
  const loaded = useRef(new Map<string, Place[]>());
  const [places, setPlaces] = useState<Place[]>([]);
  const [filters, setFilters] = useState<Filters>({ kinds: { playground: true, park: true, toilet: true, nursing: true, venue: true }, publicOnly: true, indoor: false, water: false, diaper: false, rides: [] });
  const [loading, setLoading] = useState(false);
  const [rideSheet, setRideSheet] = useState(false);
  const hasNursing = useMemo(() => index.sgg.some((s) => (s.counts.nursing ?? 0) > 0), [index]);
  const hasVenue = useMemo(() => index.sgg.some((s) => (s.counts.venue ?? 0) > 0), [index]);
  const kinds = (["playground", "park", "toilet", "venue", "nursing"] as PlaceKind[]).filter(
    (k) => (k !== "nursing" || hasNursing) && (k !== "venue" || hasVenue),
  );
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadAround = useCallback(
    async (lat: number, lng: number) => {
      const sggs = nearestSggs(index, lat, lng, 4);
      const missing = sggs.filter((s) => !loaded.current.has(s.code));
      if (missing.length) {
        setLoading(true);
        await Promise.all(
          missing.map(async (s) => {
            try {
              const f = await loadPlaces(s.code);
              loaded.current.set(s.code, f.places);
            } catch {
              loaded.current.set(s.code, []);
            }
          }),
        );
        setLoading(false);
      }
      setPlaces(sggs.flatMap((s) => loaded.current.get(s.code) ?? []));
    },
    [index],
  );

  // 지도 생성
  useEffect(() => {
    const start = focus ?? (loc ? { lat: loc.lat, lng: loc.lng, zoom: 15 } : { lat: 37.5665, lng: 126.978, zoom: 13 });
    const map = L.map("leaflet-map", { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], start.zoom ?? 15);
    tileLayer().addTo(map);
    const cluster = L.markerClusterGroup({ maxClusterRadius: 48, showCoverageOnHover: false, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: false });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    let timer: ReturnType<typeof setTimeout> | undefined;
    map.on("moveend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        void loadAround(c.lat, c.lng);
      }, 250);
    });
    void loadAround(start.lat, start.lng);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = undefined;
      clusterRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 내 위치 마커
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loc) return;
    if (!meRef.current) {
      meRef.current = L.marker([loc.lat, loc.lng], { icon: L.divIcon({ className: "", html: '<div class="pw-me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
    } else meRef.current.setLatLng([loc.lat, loc.lng]);
  }, [loc]);

  // 포커스 이동
  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.setView([focus.lat, focus.lng], focus.zoom ?? 17);
  }, [focus]);

  /** 기구 조건을 빼고 나머지 필터를 통과한 놀이터(기구 시트의 건수용) */
  const basePlaygrounds = useMemo(
    () =>
      places.filter(
        (p) =>
          p.kind === "playground" &&
          !(filters.publicOnly && !p.indoor && !isPublicSite(p.site ?? "")) &&
          !(filters.indoor && !p.indoor) &&
          !(filters.water && !p.water),
      ),
    [places, filters.publicOnly, filters.indoor, filters.water],
  );
  const rideActive = filters.rides.length > 0 || !!filters.floor;

  const visible = useMemo(() => {
    const f = filters;
    return places.filter((p) => {
      if (!f.kinds[p.kind]) return false;
      if (p.kind === "playground") {
        if (f.publicOnly && !p.indoor && !isPublicSite(p.site ?? "")) return false;
        if (f.indoor && !p.indoor) return false;
        if (f.water && !p.water) return false;
        if (!matchesRides(p, f.rides, f.floor)) return false;
      } else if (p.kind === "venue" && f.indoor && !(f.water || f.rides.length || f.floor)) {
        // "실내" 필터는 도서관·박물관도 함께 보여 준다
      } else if (f.indoor || f.water || f.rides.length || f.floor) return false;
      if (f.diaper && !((p.kind === "toilet" && p.diaper) || p.kind === "nursing")) return false;
      return true;
    });
  }, [places, filters]);

  // 마커 갱신
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const markers = visible.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), title: p.name });
      m.on("click", () => onOpenDetail(p, loc ? haversineKm(loc.lat, loc.lng, p.lat, p.lng) : undefined));
      return m;
    });
    cluster.addLayers(markers);
  }, [visible, onOpenDetail, loc]);

  const counts = useMemo(() => {
    const c: Record<PlaceKind, number> = { playground: 0, park: 0, toilet: 0, nursing: 0, venue: 0 };
    for (const p of visible) c[p.kind]++;
    return c;
  }, [visible]);

  const toggleKind = (k: PlaceKind) => setFilters((f) => ({ ...f, kinds: { ...f.kinds, [k]: !f.kinds[k] } }));

  return (
    <div className="screen map">
      <div className="map-wrap">
        <div id="leaflet-map" />
        <div className="map-top">
          {kinds.map((k) => (
            <button key={k} className={`chip ${filters.kinds[k] ? "on" : ""}`} onClick={() => toggleKind(k)}>
              <Icon name={KIND_ICON[k]} size={15} /> {KIND_LABEL[k]}
            </button>
          ))}
          <button className={`chip ${rideActive ? "on" : ""}`} onClick={() => setRideSheet(true)}>
            <Icon name="filter" size={15} /> 기구{rideActive ? ` ${filters.rides.length + (filters.floor ? 1 : 0)}` : ""}
          </button>
          <button className={`chip ${filters.publicOnly ? "on" : ""}`} onClick={() => setFilters((f) => ({ ...f, publicOnly: !f.publicOnly }))}>
            공공만
          </button>
          <button className={`chip ${filters.indoor ? "on" : ""}`} onClick={() => setFilters((f) => ({ ...f, indoor: !f.indoor }))}>
            실내
          </button>
          <button className={`chip ${filters.water ? "on" : ""}`} onClick={() => setFilters((f) => ({ ...f, water: !f.water }))}>
            물놀이
          </button>
          <button className={`chip ${filters.diaper ? "on" : ""}`} onClick={() => setFilters((f) => ({ ...f, diaper: !f.diaper }))}>
            기저귀·수유실
          </button>
        </div>
        <button
          className="map-fab"
          aria-label="내 위치"
          onClick={() => {
            onRelocate();
            if (loc && mapRef.current) mapRef.current.setView([loc.lat, loc.lng], 15);
          }}
        >
          <Icon name="location" size={22} />
        </button>
        <div className="map-hint">
          {loading
            ? "불러오는 중…"
            : `놀이터 ${counts.playground} · 공원 ${counts.park} · 화장실 ${counts.toilet}${counts.venue ? ` · 도서관·박물관 ${counts.venue}` : ""}${counts.nursing ? ` · 수유실 ${counts.nursing}` : ""}`}
        </div>
      </div>
      {rideSheet && (
        <RideSheet
          playgrounds={basePlaygrounds}
          rides={filters.rides}
          floor={filters.floor}
          matched={counts.playground}
          onChange={(rides, floor) => setFilters((f) => ({ ...f, rides, floor }))}
          onClose={() => setRideSheet(false)}
        />
      )}
    </div>
  );
}

function RideSheet({
  playgrounds,
  rides,
  floor,
  matched,
  onChange,
  onClose,
}: {
  playgrounds: Place[];
  rides: string[];
  floor?: string;
  matched: number;
  onChange: (rides: string[], floor?: string) => void;
  onClose: () => void;
}) {
  // 지금 불러온 지역에서 기구별 놀이터 수
  const count = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of playgrounds) for (const k of rideKeys(p)) c.set(k, (c.get(k) ?? 0) + 1);
    return c;
  }, [playgrounds]);
  const toggle = (k: string) => onChange(rides.includes(k) ? rides.filter((x) => x !== k) : [...rides, k], floor);
  return (
    <Sheet onClose={onClose}>
      <div className="hd">
        <div style={{ flex: 1 }}>
          <h2>놀이기구로 찾기</h2>
          <div className="sub">고른 기구를 모두 갖춘 놀이터만 보여요. 숫자는 지금 지도 주변 놀이터 수예요.</div>
        </div>
      </div>
      <div className="ride-sec">기구</div>
      <div className="chips">
        {RIDE_GROUPS.map((g) => {
          const n = count.get(g.key) ?? 0;
          return (
            <button key={g.key} className={`chip ${rides.includes(g.key) ? "on" : ""}`} disabled={!n && !rides.includes(g.key)} onClick={() => toggle(g.key)}>
              {g.label} <small>{n}</small>
            </button>
          );
        })}
      </div>
      <div className="ride-sec">바닥</div>
      <div className="chips">
        {FLOORS.map((g) => (
          <button key={g.key} className={`chip ${floor === g.key ? "on" : ""}`} onClick={() => onChange(rides, floor === g.key ? undefined : g.key)}>
            {g.label} <small>{count.get(g.key) ?? 0}</small>
          </button>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 12 }}>미끄럼틀은 대부분 조합놀이대에 붙어 있어 조합놀이대도 함께 찾아요. 기구 정보는 행정안전부 등록 자료 기준이에요.</p>
      <div className="btnrow">
        <button className="btn" onClick={() => onChange([], undefined)}>
          초기화
        </button>
        <button className="btn primary" onClick={onClose}>
          놀이터 {matched}곳 보기
        </button>
      </div>
    </Sheet>
  );
}
