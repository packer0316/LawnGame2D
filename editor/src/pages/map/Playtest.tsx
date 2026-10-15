import type { MapDef } from '@lawn/shared';
import { useEffect } from 'react';
import { useStudio } from '../../state/studio';
import { EngineView } from '../../ui/EngineView';

/** 試玩：用 createGame() 啟動目前的地圖（真遊戲 + LocalServer），按 Esc 回到工具（STUDIO_SPEC §6.3）。 */
export function Playtest({ map, onExit }: { map: MapDef; onExit: () => void }) {
  const content = useStudio((s) => s.content);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  if (!content) return null;
  const roomId = Number(map.id.slice(4));
  return (
    <div className="overlay">
      <EngineView
        deps={[map, content]}
        mount={(engine, parent) => engine.createGame(parent, { content, roomId, mapOverride: map, hud: true, onExit })}
      />
      <div className="overlay-bar">
        <button onClick={onExit}>結束試玩（Esc）</button>
      </div>
    </div>
  );
}
