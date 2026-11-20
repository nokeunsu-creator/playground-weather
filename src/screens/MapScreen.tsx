import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { DataIndex, MudflatFile, MudflatSpot, Place, PlaceKind, WxSnapshot } from "../lib/types";
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
  mudflat?: MudflatFile;
  onOpenDetail: (p: Place, km?: number) => void;
  onOpenMudflat?: (s: MudflatSpot, km?: number) => void;
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
  /** 갯벌 체험 장소 */
  mudflat: boolean;
}

const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY as string | undefined;
/** 6단계면 휴대폰 화면에 남한 전체가 들어온다. */
const MIN_ZOOM = 6;

function tileLayer(): L.TileLayer {
  if (VWORLD_KEY) {
    // 브이월드 Base 타일은 6~19 단계만 있다(5 이하는 오류 XML 이 와서 빈 지도가 됨).
    return L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`, {
      minZoom: MIN_ZOOM,
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

const MUD_ICON = L.divIcon({ className: "", html: `<div class="pw-marker mudflat">${iconSvg("shell", 15)}</div>`, iconSize: [30, 30], iconAnchor: [15, 30] });

export function MapScreen({ index, loc, focus, mudflat, onOpenDetail, onOpenMudflat, onRelocate }: Props) {
  const mapRef = useRef<L.Map | undefined>(undefined);
  const clusterRef = useRef<L.MarkerClusterGroup | undefined>(undefined);
  const meRef = useRef<L.Marker | undefined>(undefined);
  const loaded = useRef(new Map<string, Place[]>());
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadedSggs, setLoadedSggs] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ kinds: { playground: true, park: true, toilet: true, nursing: true, venue: true }, publicOnly: true, indoor: false, water: false, diaper: false, rides: [], mudflat: true });
  const [loading, setLoading] = useState(false);
  const [rideSheet, setRideSheet] = useState(false);
  const hasNursing = useMemo(() => index.sgg.some((s) => (s.counts.nursing ?? 0) > 0), [index]);
  const hasVenue = useMemo(() => index.sgg.some((s) => (s.counts.venue ?? 0) > 0), [index]);
  const kinds = (["playground", "park", "toilet", "venue", "nursing"] as PlaceKind[]).filter(
    (k) => (k !== "nursing" || hasNursing) && (k !== "venue" || hasVenue),
  );
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // 지도를 움직이는 동안 요청이 겹치면 가장 나중 요청 결과만 쓴다(늦게 끝난 이전 지역이 덮어쓰지 않게)
  const reqSeq = useRef(0);
  const loadAround = useCallback(
    async (lat: number, lng: number) => {
      const seq = ++reqSeq.current;
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
      }
      if (seq !== reqSeq.current) return;
      setLoading(false);
      setPlaces(sggs.flatMap((s) => loaded.current.get(s.code) ?? []));
      setLoadedSggs(new Set(sggs.map((s) => s.code)));
    },
    [index],
  );

  // 지도 생성
  useEffect(() => {
    const start = focus ?? (loc ? { lat: loc.lat, lng: loc.lng, zoom: 15 } : { lat: 37.5665, lng: 126.978, zoom: 13 });
    const map = L.map("leaflet-map", { zoomControl: false, attributionControl: true, minZoom: MIN_ZOOM }).setView([start.lat, start.lng], start.zoom ?? 15);
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
          !(filters.publicOnly && !isPublicSite(p.site ?? "")) &&
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
        // 실내 놀이터도 어린이집·유치원·아파트 등 외부인이 못 쓰는 곳은 뺀다(키즈카페 같은 영업소는 통과)
        if (f.publicOnly && !isPublicSite(p.site ?? "")) return false;
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

  /** 지금 불러온 시군구 안의 갯벌 체험 장소(다른 필터가 켜져 있으면 숨김) */
  const mudVisible = useMemo(() => {
    const f = filters;
    if (!mudflat || !f.mudflat || f.indoor || f.water || f.diaper || f.rides.length || f.floor) return [];
    return mudflat.spots.filter((s) => s.sgg && loadedSggs.has(s.sgg));
  }, [mudflat, filters, loadedSggs]);

  // 마커 갱신. 클릭 콜백은 ref 로 읽어, 부모가 다시 그려져도 마커 수천 개를 다시 만들지 않는다
  const handlers = useRef({ onOpenDetail, onOpenMudflat });
  handlers.current = { onOpenDetail, onOpenMudflat };
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const km = (lat: number, lng: number) => (loc ? haversineKm(loc.lat, loc.lng, lat, lng) : undefined);
    const markers = visible.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), title: p.name });
      m.on("click", () => handlers.current.onOpenDetail(p, km(p.lat, p.lng)));
      return m;
    });
    for (const s of mudVisible) {
      const m = L.marker([s.lat, s.lng], { icon: MUD_ICON, title: s.name });
      m.on("click", () => handlers.current.onOpenMudflat?.(s, km(s.lat, s.lng)));
      markers.push(m);
    }
    cluster.addLayers(markers);
  }, [visible, mudVisible, loc]);

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
          {mudflat && (
            <button className={`chip ${filters.mudflat ? "on" : ""}`} onClick={() => setFilters((f) => ({ ...f, mudflat: !f.mudflat }))}>
              <Icon name="shell" size={15} /> 갯벌
            </button>
          )}
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
            : `놀이터 ${counts.playground} · 공원 ${counts.park} · 화장실 ${counts.toilet}${counts.venue ? ` · 도서관·박물관 ${counts.venue}` : ""}${counts.nursing ? ` · 수유실 ${counts.nursing}` : ""}${mudVisible.length ? ` · 갯벌 ${mudVisible.length}` : ""}`}
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
        <button className="btn primary wide" onClick={onClose}>
          놀이터 {matched}곳 보기
        </button>
      </div>
    </Sheet>
  );
}
