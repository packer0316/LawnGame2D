import { useEffect, useRef, useState } from 'react';
import { createGame, httpContentSource, type GameCommand, type GameHandle, type HudState, type LoadingProgress } from '@lawn/engine';
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
  const [loading, setLoading] = useState<LoadingProgress | null>(null);

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
      onLoading: setLoading,
    });
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  const command = (cmd: GameCommand) => handleRef.current?.command(cmd);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={stageRef} style={{ position: 'absolute', inset: 0 }} />
      <Hud state={hud} loading={loading} command={command} action={(key) => {
        handleRef.current?.press(key);
        window.setTimeout(() => handleRef.current?.release(key), 80);
      }} />
    </div>
  );
}
