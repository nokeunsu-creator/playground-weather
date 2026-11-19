import { useEffect, useState } from "react";
import { cardText, defaultShareEnv, renderCard, shareImage, type CardData, type ShareResult } from "../lib/shareCard";
import { Sheet } from "./common";
import { Icon } from "./Icon";

/** 판정 카드 미리보기 + 공유창 열기 */
export function ShareSheet({ data, onClose }: { data: CardData; onClose: () => void }) {
  const [url, setUrl] = useState<string>();
  const [status, setStatus] = useState<ShareResult | "busy">();

  useEffect(() => {
    try {
      setUrl(renderCard(data).toDataURL("image/png"));
    } catch {
      setStatus("failed");
    }
  }, [data]);

  const send = async () => {
    if (!url) return;
    setStatus("busy");
    const r = await shareImage(url, cardText(data), defaultShareEnv());
    setStatus(r);
    if (r === "shared") onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <div className="hd">
        <div style={{ flex: 1 }}>
          <h2>오늘 판정 공유</h2>
          <div className="sub">공유창에서 카카오톡을 고르면 대화방에 이미지로 보내져요</div>
        </div>
      </div>
      {url ? <img className="share-preview" src={url} alt="오늘 판정 카드 미리보기" /> : <div className="skeleton" />}
      {status === "downloaded" && <p className="sub share-msg">이미지를 저장했어요. 카카오톡에서 사진으로 보내 주세요.</p>}
      {status === "failed" && <p className="sub share-msg">공유하지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>}
      <div className="btnrow">
        <button className="btn" onClick={onClose}>
          닫기
        </button>
        <button className="btn primary" disabled={!url || status === "busy"} onClick={() => void send()}>
          <Icon name="share" size={18} /> 보내기
        </button>
      </div>
    </Sheet>
  );
}
