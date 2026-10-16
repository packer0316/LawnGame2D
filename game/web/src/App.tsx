import { useEffect, useRef, useState } from 'react';
import { createGame, httpContentSource, type GameCommand, type GameHandle, type HudState } from '@lawn/engine';
import type { ClassId } from '@lawn/shared';
import { Hud } from './Hud';

/** 遊戲資料：相對網頁的 content/（開發伺服器掛在 /content，正式建置複製到網頁旁邊，部署在子路徑也讀得到）。 */
const CONTENT_BASE = 'content/';

/**
 * 網址參數（開發與量測用）：
 * ?room=2 起始房間、?class=mage 職業、?mobs=3 生怪倍率、?lights=0 關閉光照、?debug=1 顯示碰撞、
 * ?mode=dev|real 遊戲模式
 */
export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!stageRef.current) return;
    handleRef.current = createGame(stageRef.current, {
      themedMonsters: true,
      content: httpContentSource(CONTENT_BASE),
      ...(params.get('room') ? { roomId: Number(params.get('room')) } : {}),
      ...(params.get('class') ? { classId: params.get('class') as ClassId } : {}),
      lighting: params.get('lights') !== '0',
      spawnScale: Number(params.get('mobs') ?? 1),
      showColliders: params.get('debug') === '1',
      onHud: setHud,
    });
    return () => {
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
