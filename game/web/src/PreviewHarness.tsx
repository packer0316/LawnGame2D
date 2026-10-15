import { useEffect, useRef } from 'react';
import { createMapPreview, createMonsterPreview, httpContentSource } from '@lawn/engine';
import { MapDefFile, MonsterDefFile, contentPaths } from '@lawn/shared';

/**
 * 預覽元件的測試頁（給編輯器用的元件在遊戲端先自我驗證）。
 * ?preview=monster&id=mob_0004&action=kill|hit|die|move&patrol=1
 * ?preview=map&id=map_0002&lights=0&nav=1&colliders=1&x=900&y=500
 */
export function PreviewHarness({ kind }: { kind: 'monster' | 'map' }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const content = httpContentSource(params.get('content') === 'real' ? '/content/' : '/dev-content/');
    let destroy: (() => void) | undefined;
    let disposed = false;

    (async () => {
      if (!ref.current) return;
      const race = params.get('race') === '1';
      if (kind === 'monster') {
        const monster = MonsterDefFile.migrate(await content.json(contentPaths.monster(params.get('id') ?? 'mob_0001')));
        if (disposed) return;
        const handle = createMonsterPreview(ref.current, { content, monster, patrol: params.get('patrol') === '1', multiplier: 12 });
        destroy = handle.destroy;
        if (race) {
          // 編輯器的時序：建立後立刻呼叫，另外建立一個馬上銷毀
          handle.simulateKill();
          handle.update({ showHitbox: true });
          const scratch = document.createElement('div');
          document.body.appendChild(scratch);
          const temp = createMonsterPreview(scratch, { content, monster });
          temp.play('die');
          setTimeout(() => temp.destroy(), 30);
        }
        const action = params.get('action');
        setTimeout(() => {
          if (action === 'kill') handle.simulateKill();
          else if (action === 'hit' || action === 'die' || action === 'move' || action === 'appear') handle.play(action);
        }, 800);
      } else {
        const map = MapDefFile.migrate(await content.json(contentPaths.map(params.get('id') ?? 'map_0001')));
        if (disposed) return;
        const handle = createMapPreview(ref.current, {
          content,
          map,
          lighting: params.get('lights') !== '0',
          showFootholds: params.get('colliders') === '1',
          showNav: params.get('nav') === '1',
        });
        destroy = handle.destroy;
        if (race) {
          handle.setCamera(Number(params.get('x') ?? 600), Number(params.get('y') ?? 300));
          handle.update({ showNav: true, lighting: false });
          const scratch = document.createElement('div');
          document.body.appendChild(scratch);
          const temp = createMapPreview(scratch, { content, map });
          temp.setCamera(100, 100);
          setTimeout(() => temp.destroy(), 30);
        } else if (params.get('x')) {
          setTimeout(() => handle.setCamera(Number(params.get('x')), Number(params.get('y') ?? 300)), 600);
        }
      }
    })().catch((error) => console.error(error));

    return () => {
      disposed = true;
      destroy?.();
    };
  }, [kind]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
