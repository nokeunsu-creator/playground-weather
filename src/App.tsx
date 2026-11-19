import { useCallback, useEffect, useRef, useState } from "react";
import type { DataIndex, MudflatFile, MudflatSpot, Place, SggInfo, WxSnapshot } from "./lib/types";
import { loadIndex, loadMudflat, loadPlaces, loadWx, localIsoHour, nearestSgg } from "./lib/data";
import { getCurrentLocation, type Loc } from "./lib/location";
import { DEFAULT_SETTINGS, loadSettings, subscribe, toggleFav, updateSettings, type Settings } from "./lib/store";
import { initAds, maybeShowInterstitial } from "./lib/ads";
import { rescheduleEvening, rescheduleMorning } from "./lib/notify";
import { Home } from "./screens/Home";
import { MapScreen, type MapFocus } from "./screens/MapScreen";
import { PlaceSheet } from "./screens/PlaceSheet";
import { Favorites } from "./screens/Favorites";
import { SettingsScreen } from "./screens/Settings";
import { Onboarding } from "./screens/Onboarding";
import { MudflatScreen } from "./screens/Mudflat";
import { MudflatSheet } from "./components/MudflatSheet";
import { haversineKm } from "./lib/geo";
import { Icon, type IconName } from "./components/Icon";

type Tab = "home" | "map" | "mud" | "fav" | "settings";

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState<DataIndex>();
  const [loc, setLoc] = useState<Loc>();
  const [sgg, setSgg] = useState<SggInfo>();
  const [wx, setWx] = useState<WxSnapshot>();
  const [wxError, setWxError] = useState<string>();
  const [indexError, setIndexError] = useState<string>();
  const [tab, setTab] = useState<Tab>("home");
  const [focus, setFocus] = useState<MapFocus>();
  const [detail, setDetail] = useState<{ place: Place; km?: number }>();
  const [locating, setLocating] = useState(false);
  const [mudflat, setMudflat] = useState<MudflatFile>();
  const [mudDetail, setMudDetail] = useState<{ spot: MudflatSpot; date: string; km?: number }>();
  const notifKey = useRef("");

  const applyLocation = useCallback(
    async (idx: DataIndex, l: Loc) => {
      setLoc(l);
      const s = nearestSgg(idx, l.lat, l.lng);
      setSgg(s);
      setWxError(undefined);
      try {
        setWx(await loadWx(s.code));
      } catch (e) {
        setWx(undefined);
        setWxError(`날씨 데이터를 불러오지 못했어요 (${(e as Error).message})`);
      }
      void updateSettings({ last: { lat: l.lat, lng: l.lng, at: l.at } });
    },
    [],
  );

  const locate = useCallback(
    async (idx: DataIndex, s: Settings) => {
      setLocating(true);
      const gps = await getCurrentLocation();
      setLocating(false);
      if (gps) return applyLocation(idx, gps);
      const home = s.homeSgg && idx.sgg.find((x) => x.code === s.homeSgg);
      if (home) return applyLocation(idx, { lat: home.lat, lng: home.lng, source: "home", at: new Date().toISOString() });
      if (s.last) return applyLocation(idx, { lat: s.last.lat, lng: s.last.lng, source: "manual", at: s.last.at });
      const seoul = idx.sgg.find((x) => x.code === "11110") ?? idx.sgg[0];
      return applyLocation(idx, { lat: seoul.lat, lng: seoul.lng, source: "manual", at: new Date().toISOString() });
    },
    [applyLocation],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSettings();
      if (!alive) return;
      setSettings(s);
      setReady(true);
      try {
        const idx = await loadIndex();
        if (!alive) return;
        setIndex(idx);
      } catch (e) {
        setIndexError(`장소 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. (${(e as Error).message})`);
      }
      void initAds();
    })();
    const un = subscribe(setSettings);
    return () => {
      alive = false;
      un();
    };
  }, [locate]);

  // 갯벌·물때: 데이터가 있을 때만 탭을 보인다
  useEffect(() => {
    let alive = true;
    void loadMudflat().then((m) => alive && setMudflat(m));
    return () => {
      alive = false;
    };
  }, []);
  const openMud = useCallback((spot: MudflatSpot, date?: string, km?: number) => {
    const d = date ?? localIsoHour(new Date()).slice(0, 10);
    setMudDetail({ spot, date: d, km: km ?? undefined });
  }, []);

  // 첫 위치 확인: 장소 목록 로딩과 온보딩 완료 중 늦게 끝나는 쪽에서 한 번 실행한다.
  // (예전에는 목록이 오기 전에 "시작하기"를 누르면 위치 확인이 아예 안 돼 홈이 계속 로딩 상태였다)
  const located = useRef(false);
  useEffect(() => {
    if (!index || !settings.onboarded || located.current) return;
    located.current = true;
    void locate(index, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, settings.onboarded, locate]);

  // 아침 알림 재예약(설정·날씨가 바뀔 때)
  useEffect(() => {
    if (!sgg) return;
    const key = JSON.stringify([settings.notify, settings.evening, settings.child, sgg.code, wx?.fetchedAt]);
    if (key === notifKey.current) return;
    notifKey.current = key;
    void (async () => {
      // 권한 요청이 겹치지 않게 차례로 예약
      await rescheduleMorning({ ...settings.notify, snap: wx, child: settings.child, regionName: sgg.name });
      await rescheduleEvening({ ...settings.evening, snap: wx, child: settings.child, regionName: sgg.name });
    })();
  }, [settings.notify, settings.evening, settings.child, sgg, wx]);

  const openDetail = useCallback(
    async (place: Place, km?: number) => {
      const d = km ?? (loc ? haversineKm(loc.lat, loc.lng, place.lat, place.lng) : undefined);
      setDetail({ place, km: d });
      const s = await updateSettings((cur) => ({ detailViews: cur.detailViews + 1 }));
      void maybeShowInterstitial(s.detailViews);
    },
    [loc],
  );

  const showOnMap = useCallback((place: Place) => {
    setDetail(undefined);
    setFocus({ lat: place.lat, lng: place.lng, placeId: place.id, zoom: 17 });
    setTab("map");
  }, []);

  const changeRegion = useCallback(
    async (code: string) => {
      if (!index) return;
      const s = index.sgg.find((x) => x.code === code);
      if (!s) return;
      await applyLocation(index, { lat: s.lat, lng: s.lng, source: "manual", at: new Date().toISOString() });
    },
    [index, applyLocation],
  );

  const refresh = useCallback(async () => {
    if (!index) return;
    await locate(index, settings);
  }, [index, settings, locate]);

  const openFav = useCallback(
    async (id: string, sggCode: string) => {
      try {
        const f = await loadPlaces(sggCode);
        const p = f.places.find((x) => x.id === id);
        if (p) return openDetail(p);
      } catch {
        /* fall through */
      }
      const fav = settings.favorites.find((x) => x.id === id);
      if (fav) openDetail({ id: fav.id, kind: fav.kind, name: fav.name, lat: fav.lat, lng: fav.lng, addr: fav.addr, sgg: fav.sgg });
    },
    [openDetail, settings.favorites],
  );

  if (!ready) return null;
  if (!settings.onboarded) {
    return (
      <Onboarding
        index={index}
        onDone={async (child, homeSgg) => {
          const home = index?.sgg.find((x) => x.code === homeSgg);
          await updateSettings({ child, onboarded: true, homeSgg, homeName: home ? `${home.sido} ${home.name}` : undefined });
        }}
      />
    );
  }

  return (
    <div className="app">
      {tab === "home" && (
        <Home
          index={index}
          indexError={indexError}
          sgg={sgg}
          wx={wx}
          wxError={wxError}
          settings={settings}
          loc={loc}
          locating={locating}
          onOpenDetail={openDetail}
          onChangeRegion={changeRegion}
          onRefresh={refresh}
          onOpenMap={() => setTab("map")}
        />
      )}
      {tab === "map" && index && (
        <MapScreen
          index={index}
          loc={loc}
          settings={settings}
          wx={wx}
          focus={focus}
          mudflat={mudflat}
          onOpenDetail={openDetail}
          onOpenMudflat={(s, km) => openMud(s, undefined, km)}
          onRelocate={refresh}
        />
      )}
      {tab === "mud" && mudflat && <MudflatScreen data={mudflat} loc={loc} onOpen={(s, d, km) => openMud(s, d, km)} />}
      {tab === "fav" && <Favorites settings={settings} loc={loc} onOpen={openFav} />}
      {tab === "settings" && (
        <SettingsScreen settings={settings} index={index} wx={wx} sgg={sgg} onUseHere={refresh} onChangeRegion={changeRegion} />
      )}
      <nav className="tabbar">
        {(
          [
            ["home", "house", "오늘"],
            ["map", "map", "지도"],
            ["mud", "wave", "갯벌"],
            ["fav", "star", "즐겨찾기"],
            ["settings", "gear", "설정"],
          ] as [Tab, IconName, string][]
        )
          .filter(([t]) => t !== "mud" || mudflat)
          .map(([t, ico, label]) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            <Icon name={tab === t && ico === "star" ? "starFill" : ico} size={24} fill={tab === t && ico === "house"} />
            {label}
          </button>
        ))}
      </nav>
      {mudDetail && mudflat && (
        <MudflatSheet spot={mudDetail.spot} data={mudflat} date={mudDetail.date} km={mudDetail.km} child={settings.child} onClose={() => setMudDetail(undefined)} />
      )}
      {detail && (
        <PlaceSheet
          place={detail.place}
          km={detail.km}
          fav={settings.favorites.some((f) => f.id === detail.place.id)}
          onFav={() => void toggleFav(detail.place)}
          onMap={() => showOnMap(detail.place)}
          onClose={() => setDetail(undefined)}
        />
      )}
    </div>
  );
}
