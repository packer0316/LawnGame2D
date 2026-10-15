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
 * ?room=2 起始房間、?class=mage 職業、?mobs=3 生怪倍率、?lights=0 關閉光照、?debug=1 顯示碰撞、?content=dev|real
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
