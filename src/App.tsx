import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import type { DataIndex, MudflatFile, MudflatSpot, Place, SggInfo, WxSnapshot } from "./lib/types";
import { loadIndex, loadMudflat, loadPlaces, loadWx, localIsoHour, nearestSgg } from "./lib/data";
import { getCurrentLocation, type Loc } from "./lib/location";
import { DEFAULT_SETTINGS, loadSettings, subscribe, toggleFav, updateSettings, type Settings } from "./lib/store";
import { initAds, maybeShowInterstitial } from "./lib/ads";
import { rescheduleEvening, rescheduleMorning } from "./lib/notify";
import { popBack } from "./lib/back";
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

/** 이만큼 지난 뒤 앱으로 돌아오면 날씨를 다시 받는다 */
const WX_REFRESH_MS = 20 * 60 * 1000;

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
  /** 화면 시각 갱신(포그라운드 1분마다)·앱 복귀 횟수 */
  const [, setTick] = useState(0);
  const [resumes, setResumes] = useState(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const sggRef = useRef<SggInfo | undefined>(undefined);
  const lastWxLoad = useRef(0);
  /** 이번 실행에서 GPS 로 잡은 지역(알림은 이 지역 → 우리 동네 → 지금 보는 지역 순) */
  const gpsSgg = useRef<string | undefined>(undefined);

  const applyLocation = useCallback(
    async (idx: DataIndex, l: Loc) => {
      setLoc(l);
      const s = nearestSgg(idx, l.lat, l.lng);
      setSgg(s);
      sggRef.current = s;
      if (l.source === "gps") gpsSgg.current = s.code;
      setWxError(undefined);
      lastWxLoad.current = Date.now();
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
    })();
    const un = subscribe(setSettings);
    return () => {
      alive = false;
      un();
    };
  }, [locate]);

  // 첫 실행에 장소 목록을 못 받았으면: '다시 시도' 버튼과 인터넷 연결 복구 때 다시 받는다
  const retryIndex = useCallback(async () => {
    setIndexError(undefined);
    try {
      setIndex(await loadIndex());
    } catch (e) {
      setIndexError(`장소 데이터를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. (${(e as Error).message})`);
    }
  }, []);
  useEffect(() => {
    if (!indexError) return;
    const on = () => void retryIndex();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [indexError, retryIndex]);

  // 안드로이드 뒤로 가기: 열린 시트 → 홈 탭 → 앱 종료
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener("backButton", () => {
      if (popBack()) return;
      if (tabRef.current !== "home") return setTab("home");
      void CapApp.exitApp();
    });
    return () => void h.then((x) => x.remove());
  }, []);

  // 앱으로 돌아오면 시각을 다시 계산하고, 오래됐으면 날씨를 다시 받는다. 화면이 켜져 있으면 1분마다 다시 그린다.
  useEffect(() => {
    const onActive = () => {
      setTick((t) => t + 1);
      setResumes((r) => r + 1);
      const s = sggRef.current;
      if (!s || Date.now() - lastWxLoad.current < WX_REFRESH_MS) return;
      lastWxLoad.current = Date.now();
      loadWx(s.code)
        .then((w) => sggRef.current?.code === s.code && setWx(w))
        .catch(() => undefined);
    };
    const onVis = () => document.visibilityState === "visible" && onActive();
    document.addEventListener("visibilitychange", onVis);
    let h: Promise<PluginListenerHandle> | undefined;
    if (Capacitor.isNativePlatform()) h = CapApp.addListener("resume", onActive);
    const timer = window.setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void h?.then((x) => x.remove());
      window.clearInterval(timer);
    };
  }, []);

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
    // 광고는 온보딩이 끝난 뒤에만(온보딩 '시작하기' 버튼 아래에 배너가 붙지 않게)
    void initAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, settings.onboarded, locate]);

  // 아침·저녁 알림 재예약(설정·날씨·복귀 때). 지역은 GPS 지역 → 우리 동네 → 지금 보는 지역 순이라
  // 다른 지역을 잠깐 둘러봐도 알림 지역이 바뀌지 않는다. 권한은 여기서 묻지 않는다(설정 스위치에서만).
  useEffect(() => {
    if (!sgg || !index) return;
    const code = gpsSgg.current ?? settings.homeSgg ?? sgg.code;
    const region = index.sgg.find((x) => x.code === code) ?? sgg;
    const key = JSON.stringify([settings.notify, settings.evening, settings.child, code, code === sgg.code ? wx?.fetchedAt : "", resumes]);
    if (key === notifKey.current) return;
    notifKey.current = key;
    void (async () => {
      const snap = code === sgg.code ? wx : await loadWx(code).catch(() => undefined);
      const base = { snap, child: settings.child, regionName: region.name, pos: { lat: region.lat, lng: region.lng } };
      await rescheduleMorning({ ...settings.notify, ...base });
      await rescheduleEvening({ ...settings.evening, ...base });
    })();
  }, [settings.notify, settings.evening, settings.child, settings.homeSgg, sgg, wx, index, resumes]);

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
    if (!index) return retryIndex();
    await locate(index, settings);
  }, [index, settings, locate, retryIndex]);

  // 지도에서 갯벌 마커를 눌렀을 때. 렌더마다 새 함수를 넘기면 지도가 마커 수천 개를 다시 만든다
  const openMudOnMap = useCallback((s: MudflatSpot, km?: number) => openMud(s, undefined, km), [openMud]);
  /** 탭바·'지도에서 모두 보기'로 지도를 열 때는 예전에 본 장소(focus)를 잊는다 */
  const goTab = useCallback((t: Tab) => {
    if (t === "map") setFocus(undefined);
    setTab(t);
  }, []);

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
          onOpenMap={() => goTab("map")}
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
          onOpenMudflat={openMudOnMap}
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
          <button key={t} className={tab === t ? "on" : ""} onClick={() => goTab(t)}>
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
