import { useState } from "react";
import type { DataIndex, SggInfo, WxSnapshot } from "../lib/types";
import { updateSettings, type Settings } from "../lib/store";
import { Seg, Switch } from "../components/common";
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

export function SettingsScreen({ settings: s, index, wx, sgg, onUseHere, onChangeRegion }: Props) {
  const [pick, setPick] = useState(false);
  const home = index?.sgg.find((x) => x.code === s.homeSgg);
  return (
    <div className="screen">
      <div className="topbar">
        <h1>설정</h1>
      </div>

      <section className="card">
        <h2>아이</h2>
        <div className="field">
          <label>나이</label>
          <Seg
            value={s.child.age}
            onChange={(age) => void updateSettings({ child: { ...s.child, age } })}
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
          <Switch on={s.child.sensitive} onChange={(sensitive) => void updateSettings({ child: { ...s.child, sensitive } })} />
        </div>
      </section>

      <section className="card">
        <h2>아침 알림</h2>
        <div className="field">
          <label>
            매일 알림
            <small>그날 외출 판정과 옷차림을 알려줘요</small>
          </label>
          <Switch on={s.notify.enabled} onChange={(enabled) => void updateSettings({ notify: { ...s.notify, enabled } })} />
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
          <Switch on={s.evening.enabled} onChange={(enabled) => void updateSettings({ evening: { ...s.evening, enabled } })} />
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
        <p className="notice">
          놀이터 날씨 v0.1.0 · 서버 없이 공공데이터만 사용합니다.
          <br />
          데이터: 기상청 단기예보·생활기상지수, 한국환경공단 에어코리아, 행정안전부 어린이놀이시설·도시공원·공중화장실 표준데이터(공공누리 제1유형, 출처표시).
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
