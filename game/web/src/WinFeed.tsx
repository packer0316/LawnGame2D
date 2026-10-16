import type { HudFeedEntry } from '@lawn/engine';

const LABEL: Record<HudFeedEntry['kind'], string | null> = {
  coin: null,
  big: 'BIG WIN',
  mega: 'MEGA WIN',
  super: 'SUPER WIN',
  weapon: '裝備',
  scroll: '卷軸',
  warn: '提醒',
};

/**
 * 畫面左側的得獎紀錄：獎金、裝備、卷軸一行一行出來，最新的在最下面、舊的往上推，每行 4 秒後淡出。
 * 大獎（big／mega／super）用特殊色。行的存活時間由遊戲端控制（HudState.feed 只放還在顯示的）。
 */
export function WinFeed({ entries }: { entries: HudFeedEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="win-feed" aria-live="polite">
      {entries.map((entry) => (
        <div key={entry.id} className={`win-feed-line ${entry.kind}`}>
          {LABEL[entry.kind] && <span className="label">{LABEL[entry.kind]}</span>}
          <span className="text">{entry.text}</span>
          {entry.amount !== undefined && <span className="amount">+{entry.amount.toLocaleString()}</span>}
        </div>
      ))}
    </div>
  );
}
