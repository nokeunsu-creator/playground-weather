import { useState } from "react";
import type { AgeGroup, ChildProfile, DataIndex } from "../lib/types";
import { Seg, Switch } from "../components/common";
import { RegionPicker } from "../components/RegionPicker";

export function Onboarding({ index, onDone }: { index?: DataIndex; onDone: (child: ChildProfile, homeSgg?: string) => void }) {
  const [age, setAge] = useState<AgeGroup>("toddler");
  const [sensitive, setSensitive] = useState(false);
  const [home, setHome] = useState<string>();
  const [pick, setPick] = useState(false);
  const homeInfo = index?.sgg.find((s) => s.code === home);
  return (
    <div className="screen onboard">
      <h1>
        🛝 놀이터 날씨
      </h1>
      <p>오늘 아이랑 나가도 될까? 날씨·미세먼지·자외선을 아이 기준으로 판정하고, 근처 놀이터·공원·화장실을 찾아줘요.</p>
      <div className="card">
        <div className="field">
          <label>
            아이 나이
            <small>나이가 어릴수록 보수적으로 판정해요</small>
          </label>
          <Seg
            value={age}
            onChange={setAge}
            options={[
              { v: "infant", label: "0~2세" },
              { v: "toddler", label: "3~6세" },
              { v: "kid", label: "7세+" },
            ]}
          />
        </div>
        <div className="field">
          <label>
            비염·천식 등 민감군
            <small>미세먼지·꽃가루 기준을 더 엄격하게</small>
          </label>
          <Switch on={sensitive} onChange={setSensitive} />
        </div>
        <div className="field">
          <label>
            우리 동네 (선택)
            <small>위치 권한이 없을 때 사용해요</small>
          </label>
          <button className="btn sm ghost" onClick={() => setPick(true)} disabled={!index}>
            {homeInfo ? `${homeInfo.sido} ${homeInfo.name}` : index ? "선택" : "불러오는 중…"}
          </button>
        </div>
      </div>
      <button className="btn primary block" onClick={() => onDone({ age, sensitive }, home)}>
        시작하기
      </button>
      <p className="notice" style={{ marginTop: 16 }}>
        위치는 날씨 지역과 주변 장소 검색에만 쓰이고 기기 밖으로 전송되지 않아요.
      </p>
      {pick && index && <RegionPicker index={index} value={home} onPick={setHome} onClose={() => setPick(false)} />}
    </div>
  );
}
