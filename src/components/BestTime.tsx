import type { DayPlan, Level } from "../lib/judge";
import { PLAY_END, PLAY_START } from "../lib/judge";
import { Icon } from "./Icon";

const LABEL: Record<Level, string> = { good: "좋음", caution: "짧게", bad: "실내" };
const SLOTS = Array.from({ length: PLAY_END - PLAY_START + 1 }, (_, i) => PLAY_START + i);

function inBest(plan: DayPlan, hour: number): boolean {
  if (!plan.best) return false;
  const s = Number(plan.best.start.slice(0, 2));
  const e = Number(plan.best.end.slice(0, 2));
  return hour >= s && hour < e;
}

/** 오늘·내일 놀이 시간대(07~19시) 판정 띠와 추천 문장 */
export function summary(today: DayPlan, tomorrow: DayPlan): { text: string; level: Level } {
  const tb = today.best;
  const mb = tomorrow.best;
  const range = (b: NonNullable<DayPlan["best"]>) => `${Number(b.start.slice(0, 2))}~${Number(b.end.slice(0, 2))}시`;
  if (tb && tb.level !== "bad") {
    return {
      text: tb.level === "good" ? `오늘은 ${range(tb)}가 가장 좋아요` : `오늘은 ${range(tb)}가 그나마 나아요. 짧게 다녀오세요`,
      level: tb.level,
    };
  }
  const lead = today.cells.length ? "오늘 남은 시간은 실내가 좋아요." : "오늘 놀이터 시간은 지났어요.";
  if (mb && mb.level !== "bad") return { text: `${lead} 내일 ${range(mb)}를 노려 보세요`, level: mb.level };
  return { text: `${lead} 내일도 실내 놀이를 추천해요`, level: "bad" };
}

export function BestTime({ today, tomorrow }: { today: DayPlan; tomorrow: DayPlan }) {
  if (!today.cells.length && !tomorrow.cells.length) return null;
  const s = summary(today, tomorrow);
  const why = (s.level !== "good" && (today.best?.level !== "bad" ? today.best?.reason : tomorrow.best?.reason)) || undefined;
  return (
    <section className="card">
      <h2>언제 나갈까요</h2>
      <div className={`best-line ${s.level}`}>
        <Icon name="sparkle" size={18} />
        <span>
          {s.text}
          {why && <small>{why}</small>}
        </span>
      </div>
      {[
        { name: "오늘", plan: today },
        { name: "내일", plan: tomorrow },
      ]
        .filter(({ plan }) => plan.cells.length > 0)
        .map(({ name, plan }) => {
        const byHour = new Map(plan.cells.map((c) => [c.hour, c]));
        return (
          <div key={name} className="tl">
            <span className="tl-day">{name}</span>
            <div className="tl-bar" role="img" aria-label={`${name} 시간대별 외출 판정`}>
              {SLOTS.map((h) => {
                const c = byHour.get(h);
                return (
                  <i
                    key={h}
                    className={`tl-c ${c ? c.level : "na"} ${c && inBest(plan, h) ? "best" : ""}`}
                    title={c ? `${h}시 ${LABEL[c.level]} ${c.score}점${c.top ? ` · ${c.top}` : ""}` : `${h}시`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="tl">
        <span className="tl-day" />
        <div className="tl-axis">
          {SLOTS.filter((h) => h % 3 === 1).map((h) => (
            <span key={h} style={{ left: `${((h - PLAY_START) / SLOTS.length) * 100}%` }}>
              {h}시
            </span>
          ))}
        </div>
      </div>
      <div className="tl-legend">
        <span>
          <i className="tl-c good" /> 좋음
        </span>
        <span>
          <i className="tl-c caution" /> 짧게
        </span>
        <span>
          <i className="tl-c bad" /> 실내
        </span>
        <span>
          <i className="tl-c good best" /> 추천
        </span>
      </div>
    </section>
  );
}
