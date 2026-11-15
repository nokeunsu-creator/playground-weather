import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { DataIndex, Place, PlaceKind, WxSnapshot } from "../lib/types";
import type { Settings } from "../lib/store";
import type { Loc } from "../lib/location";
import { loadPlaces, nearestSggs } from "../lib/data";
import { haversineKm } from "../lib/geo";
import { isPublicSite, KIND_ICON } from "../components/common";
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
    html: `<div class="pw-marker ${cls}">${iconSvg(p.kind === "playground" && p.water ? "drop" : KIND_ICON[p.kind], 15)}</div>`,
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
  const [filters, setFilters] = useState<Filters>({ kinds: { playground: true, park: true, toilet: true }, publicOnly: true, indoor: false, water: false, diaper: false });
  const [loading, setLoading] = useState(false);
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

  const visible = useMemo(() => {
    const f = filters;
    return places.filter((p) => {
      if (!f.kinds[p.kind]) return false;
      if (p.kind === "playground") {
        if (f.publicOnly && !p.indoor && !isPublicSite(p.site ?? "")) return false;
        if (f.indoor && !p.indoor) return false;
        if (f.water && !p.water) return false;
      } else if (f.indoor || f.water) return false;
      if (f.diaper && !(p.kind === "toilet" && p.diaper)) return false;
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
    const c: Record<PlaceKind, number> = { playground: 0, park: 0, toilet: 0 };
    for (const p of visible) c[p.kind]++;
    return c;
  }, [visible]);

  const toggleKind = (k: PlaceKind) => setFilters((f) => ({ ...f, kinds: { ...f.kinds, [k]: !f.kinds[k] } }));

  return (
    <div className="screen map">
      <div className="map-wrap">
        <div id="leaflet-map" />
        <div className="map-top">
          {(["playground", "park", "toilet"] as PlaceKind[]).map((k) => (
            <button key={k} className={`chip ${filters.kinds[k] ? "on" : ""}`} onClick={() => toggleKind(k)}>
              <Icon name={KIND_ICON[k]} size={15} /> {k === "playground" ? "놀이터" : k === "park" ? "공원" : "화장실"}
            </button>
          ))}
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
            기저귀교환대
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
          {loading ? "불러오는 중…" : `놀이터 ${counts.playground} · 공원 ${counts.park} · 화장실 ${counts.toilet}`}
        </div>
      </div>
    </div>
  );
}
