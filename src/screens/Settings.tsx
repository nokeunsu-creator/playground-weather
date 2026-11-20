import { useEffect, useState } from "react";
import type { DataIndex, SggInfo, WxSnapshot } from "../lib/types";
import { updateSettings, type Settings } from "../lib/store";
import { openExternal, Seg, Switch } from "../components/common";
import { notifyPermissionGranted, requestNotifyPermission } from "../lib/notify";
import { Icon } from "../components/Icon";
import { MAX_CHILDREN, ORDINAL } from "../lib/children";
import type { ChildProfile } from "../lib/types";
import { RegionPicker } from "../components/RegionPicker";
import { DATA_BASE } from "../lib/data";

interface Props {
  settings: Settings;
  index?: DataIndex;
  wx?: WxSnapshot;
  sgg?: SggInfo;
  onUseHere: () => void;
  onChangeRegion: (code: string) => void;
}

const HOURS = [6, 7, 8, 9];
const EVENING_HOURS = [18, 19, 20, 21, 22];
export const PRIVACY_URL = "https://nokeunsu-creator.github.io/playground-weather/privacy.html";
const PERM_HELP = "알림 권한이 꺼져 있어 알림이 오지 않아요. 휴대폰 설정 > 애플리케이션 > 놀이터 날씨 > 알림에서 허용해 주세요.";

export function SettingsScreen({ settings: s, index, wx, sgg, onUseHere, onChangeRegion }: Props) {
  const [pick, setPick] = useState(false);
  const [permOff, setPermOff] = useState(false);
  const home = index?.sgg.find((x) => x.code === s.homeSgg);
  const anyOn = s.notify.enabled || s.evening.enabled;

  // 켜 둔 알림이 있는데 휴대폰 설정에서 권한을 끈 경우 알려 준다(묻지는 않는다)
  useEffect(() => {
    if (!anyOn) return setPermOff(false);
    let alive = true;
    void notifyPermissionGranted().then((g) => alive && setPermOff(g === false));
    return () => {
      alive = false;
    };
  }, [anyOn]);

  /** 켤 때만 권한을 묻고, 거부되면 켜지 않는다 */
  const setAlarm = async (which: "notify" | "evening", enabled: boolean) => {
    if (enabled && (await requestNotifyPermission()) === "denied") {
      setPermOff(true);
      return;
    }
    setPermOff(false);
    await updateSettings(which === "notify" ? { notify: { ...s.notify, enabled } } : { evening: { ...s.evening, enabled } });
  };
  return (
    <div className="screen">
      <div className="topbar">
        <h1>설정</h1>
      </div>

      <section className="card">
        <h2>아이</h2>
        {s.children.map((c, i) => {
          const setKid = (patch: Partial<ChildProfile>) =>
            void updateSettings((cur) => ({ children: cur.children.map((k, j) => (j === i ? { ...k, ...patch } : k)) }));
          return (
            <div className="kid" key={i}>
              <div className="kid-hd">
                <b className="kid-label">{s.children.length > 1 ? `${ORDINAL[i]} 아이` : "우리 아이"}</b>
                {s.children.length > 1 && (
                  <button
                    className="btn sm ghost"
                    onClick={() => void updateSettings((cur) => ({ children: cur.children.filter((_, j) => j !== i) }))}
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="field">
                <label>나이</label>
                <Seg
                  value={c.age}
                  onChange={(age) => setKid({ age })}
                  options={[
                    { v: "infant", label: "0~2세" },
                    { v: "toddler", label: "3~6세" },
                    { v: "kid", label: "7세+" },
                  ]}
                />
              </div>
              <div className="field">
                <label>
                  민감군
                  <small>비염·천식·아토피 등</small>
                </label>
                <Switch on={c.sensitive} onChange={(sensitive) => setKid({ sensitive })} />
              </div>
            </div>
          );
        })}
        {s.children.length < MAX_CHILDREN && (
          <div className="btnrow">
            <button
              className="btn block"
              onClick={() => void updateSettings((cur) => ({ children: [...cur.children, { age: "kid", sensitive: false }] }))}
            >
              <Icon name="child" size={18} /> 아이 추가
            </button>
          </div>
        )}
        {s.children.length > 1 && (
          <p className="sub" style={{ marginTop: 10 }}>
            여러 명이면 가장 어린 아이 나이로, 한 명이라도 민감군이면 민감군 기준으로 판정해요.
          </p>
        )}
      </section>

      <section className="card">
        <h2>아침 알림</h2>
        <div className="field">
          <label>
            매일 알림
            <small>그날 외출 판정과 옷차림을 알려줘요</small>
          </label>
          <Switch on={s.notify.enabled} onChange={(enabled) => void setAlarm("notify", enabled)} />
        </div>
        <div className="field">
          <label>시간</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sel" value={s.notify.hour} onChange={(e) => void updateSettings({ notify: { ...s.notify, hour: Number(e.target.value) } })}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}시
                </option>
              ))}
            </select>
            <select className="sel" value={s.notify.minute} onChange={(e) => void updateSettings({ notify: { ...s.notify, minute: Number(e.target.value) } })}>
              {[0, 30].map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>저녁 알림</h2>
        <div className="field">
          <label>
            내일 외출 계획
            <small>내일 나가기 좋은 시간과 옷차림을 전날 저녁에 알려줘요</small>
          </label>
          <Switch on={s.evening.enabled} onChange={(enabled) => void setAlarm("evening", enabled)} />
        </div>
        <div className="field">
          <label>시간</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="sel" value={s.evening.hour} onChange={(e) => void updateSettings({ evening: { ...s.evening, hour: Number(e.target.value) } })}>
              {EVENING_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}시
                </option>
              ))}
            </select>
            <select className="sel" value={s.evening.minute} onChange={(e) => void updateSettings({ evening: { ...s.evening, minute: Number(e.target.value) } })}>
              {[0, 30].map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
      {permOff && (
        <p className="notice warn" role="status">
          {PERM_HELP}
        </p>
      )}

      <section className="card">
        <h2>지역</h2>
        <div className="field">
          <label>
            현재 지역
            <small>{wx?.mock ? "모의 날씨 데이터" : wx ? `날씨 ${wx.fetchedAt.slice(11, 16)} UTC 수집` : ""}</small>
          </label>
          <span>{sgg ? `${sgg.sido} ${sgg.name}` : "-"}</span>
        </div>
        <div className="field">
          <label>
            우리 동네
            <small>위치 권한이 없거나 실내일 때 사용</small>
          </label>
          <button className="btn sm ghost" onClick={() => setPick(true)} disabled={!index}>
            {home ? `${home.sido} ${home.name}` : "선택"}
          </button>
        </div>
        <div className="btnrow">
          <button className="btn" onClick={onUseHere}>
            📍 현재 위치로 다시 찾기
          </button>
        </div>
      </section>

      <section className="card">
        <h2>정보</h2>
        <div className="btnrow" style={{ marginTop: 0, marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => openExternal(PRIVACY_URL)}>
            개인정보 처리방침
          </button>
        </div>
        <p className="notice">
          놀이터 날씨 v{(import.meta.env.VITE_APP_VERSION as string | undefined) ?? "개발"} · 서버 없이 공공데이터만 사용합니다.
          <br />
          데이터: 기상청 단기예보·생활기상지수, 한국환경공단 에어코리아, 행정안전부 어린이놀이시설·도시공원·공중화장실 표준데이터, 국립해양조사원 조석예보·갯벌체험지수, 부산광역시 수유실 정보, 도서관·박물관미술관·농어촌체험휴양마을 표준데이터(공공누리 제1유형, 출처표시). 배경 지도: 국토교통부 브이월드.
          <br />
          {index && `장소 데이터 빌드 ${index.builtAt.slice(0, 16).replace("T", " ")} UTC · 시군구 ${index.sgg.length}개`}
          <br />
          데이터 주소: {DATA_BASE}
          <br />
          판정 기준: 환경부 미세먼지 등급, 기상청 자외선 단계, 질병관리청 영유아 폭염·한파 권고를 보수적으로 적용한 참고 지표입니다.
        </p>
      </section>

      {pick && index && (
        <RegionPicker
          index={index}
          value={s.homeSgg}
          onPick={(code) => {
            const h = index.sgg.find((x) => x.code === code);
            void updateSettings({ homeSgg: code, homeName: h ? `${h.sido} ${h.name}` : undefined });
            onChangeRegion(code);
          }}
          onClose={() => setPick(false)}
        />
      )}
    </div>
  );
}
