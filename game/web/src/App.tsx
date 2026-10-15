import { useEffect, useRef, useState } from 'react';
import { createGame, httpContentSource, type GameCommand, type GameHandle, type HudState } from '@lawn/engine';
import type { ClassId } from '@lawn/shared';
import { Hud } from './Hud';

/** 有正式內容（content/manifest.json）就用正式內容，否則用遊戲端的測試內容。 */
async function pickContentBase(params: URLSearchParams): Promise<string> {
  const forced = params.get('content');
  if (forced === 'dev') return '/dev-content/';
  if (forced === 'real') return '/content/';
  // 靜態主機可能把不存在的路徑回傳成 index.html，不能只用 HTTP 200 判斷。
  const response = await fetch('/content/manifest.json').catch(() => null);
  const manifest = response?.ok ? await response.json().catch(() => null) : null;
  return manifest?.schemaVersion && Array.isArray(manifest.maps) ? '/content/' : '/dev-content/';
}

/**
 * 網址參數（開發與量測用）：
 * ?room=2 起始房間、?class=mage 職業、?mobs=3 生怪倍率、?lights=0 關閉光照、?debug=1 顯示碰撞、?content=dev|real、
 * ?mode=dev|real 遊戲模式、?drop=1 技能方塊掉落機率（測試用）
 */
export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let disposed = false;
    pickContentBase(params).then((base) => {
      if (disposed || !stageRef.current) return;
      handleRef.current = createGame(stageRef.current, {
        content: httpContentSource(base),
        ...(params.get('room') ? { roomId: Number(params.get('room')) } : {}),
        ...(params.get('class') ? { classId: params.get('class') as ClassId } : {}),
        lighting: params.get('lights') !== '0',
        spawnScale: Number(params.get('mobs') ?? 1),
        ...(params.get('drop') ? { dropChance: Number(params.get('drop')) } : {}),
        showColliders: params.get('debug') === '1',
        onHud: setHud,
      });
    });
    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  // 遊戲畫面畫在 HUD 底欄上方：量底欄的頂端位置，告訴遊戲保留多少高度
  useEffect(() => {
    // 技能列與底欄都算在 HUD 裡（像楓之谷的狀態列），量最上面那個的頂端
    const update = () => {
      const bar = document.querySelector('.hud-bottom-stack');
      const top = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      handleRef.current?.setViewInsets({ bottom: Math.max(0, window.innerHeight - top + 6) });
      // 金幣飛向持有金幣
      const balance = document.querySelector('.bet-balance')?.getBoundingClientRect();
      if (balance) handleRef.current?.setHudAnchors({ balance: { x: balance.left + balance.width / 2, y: balance.top + balance.height / 2 } });
    };
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    const bar = document.querySelector('.hud-bottom-stack');
    if (bar) observer.observe(bar);
    update();
    return () => observer.disconnect();
  }, [hud?.loading]);

  const command = (cmd: GameCommand) => handleRef.current?.command(cmd);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={stageRef} style={{ position: 'absolute', inset: 0 }} />
      <Hud state={hud} command={command} action={(key) => {
        handleRef.current?.press(key);
        window.setTimeout(() => handleRef.current?.release(key), 80);
      }} />
    </div>
  );
}
