import { useMemo, useState } from "react";
import type { DataIndex } from "../lib/types";
import { Sheet } from "./common";

export function RegionPicker({ index, value, onPick, onClose }: { index: DataIndex; value?: string; onPick: (code: string) => void; onClose: () => void }) {
  const sidos = useMemo(() => [...new Set(index.sgg.map((s) => s.sido))], [index]);
  const cur = index.sgg.find((s) => s.code === value);
  const [sido, setSido] = useState(cur?.sido ?? sidos[0]);
  const list = index.sgg.filter((s) => s.sido === sido);
  return (
    <Sheet onClose={onClose}>
      <h2>지역 선택</h2>
      <div className="chips">
        {sidos.map((s) => (
          <button key={s} className={`chip ${s === sido ? "on" : ""}`} onClick={() => setSido(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {list.map((s) => (
          <button
            key={s.code}
            className="row"
            onClick={() => {
              onPick(s.code);
              onClose();
            }}
          >
            <span className="body">
              <span className="name">
                {s.name} {s.code === value && "✓"}
              </span>
              <span className="desc">
                놀이터 {s.counts.playground} · 공원 {s.counts.park} · 화장실 {s.counts.toilet}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
