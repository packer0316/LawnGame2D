import type { MonsterPreviewHandle } from '@lawn/engine';
import type { MonsterDef, MonsterMathFile } from '@lawn/shared';
import { contentPaths } from '@lawn/shared';
import { useEffect, useState } from 'react';
import { ACTIONS, canvasSize } from '../../monster/sheet';
import type { Action } from '../../monster/sheet';
import { validateMathFile, validateMonster } from '../../monster/validate';
import { docsStore, isDirty, useDoc, useDocs } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { registerValidator } from '../../state/validation';
import type { Issue } from '../../state/validation';
import { Checkbox, Empty } from '../../ui/controls';
import { EngineView } from '../../ui/EngineView';
import { registerPage } from '../registry';
import { MonsterProps } from './MonsterProps';
import { MATH_PATH, loadSheet, monsterPath, registerMonster, scanMonsters, useMonsterPage } from './monsterStore';
import { SpriteView } from './SpriteView';

registerValidator('monsters', async ({ fs }) => {
  await scanMonsters(fs);
  const { ids, unregistered } = useMonsterPage.getState();
  const docs = docsStore.getState().docs;
  const math = docs[MATH_PATH]?.data as MonsterMathFile | undefined;
  const issues: Issue[] = [];
  const registered = ids.filter((id) => docs[monsterPath(id)]);
  for (const id of registered) {
    const def = docs[monsterPath(id)]!.data as MonsterDef;
    const sheet = await loadSheet(fs, id, def.sheet).then((s) => s.sheet).catch(() => null);
    issues.push(...validateMonster(def, sheet, math));
  }
  for (const id of unregistered) {
    issues.push({ severity: 'warning', page: 'monster', target: id, message: `${id}：有匯出的 sheet，但還沒有登錄（遊戲不會使用）` });
  }
  issues.push(...validateMathFile(math, registered));
  return issues;
});

const ACTION_LABEL: Record<Action, string> = { move: '移動', idle: '待機', hit: '受擊', die: '死亡', appear: '登場' };

function MonsterPage() {
  const fs = useStudio((s) => s.fs);
  const contentVersion = useStudio((s) => s.contentVersion);
  const st = useMonsterPage();
  const def = useDoc<MonsterDef>(st.selected ? monsterPath(st.selected) : null)?.data;
  const dirtyKey = useDocs((s) => st.ids.filter((id) => isDirty(s.docs[monsterPath(id)])).join(','));
  const mathTier = useDoc<MonsterMathFile>(MATH_PATH)?.data;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fs) scanMonsters(fs).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [fs, contentVersion]);

  // 驗證面板點擊跳轉
  const focus = useStudio((s) => s.focus);
  useEffect(() => {
    if (focus?.page === 'monster') useMonsterPage.setState({ selected: focus.target });
  }, [focus]);

  // 讀 sheet
  const sheetPath = def?.sheet ?? (st.selected ? contentPaths.monsterSheet(st.selected) : null);
  useEffect(() => {
    if (fs && st.selected && sheetPath) loadSheet(fs, st.selected, sheetPath).catch(() => undefined);
  }, [fs, st.selected, sheetPath, contentVersion]);
  const loaded = st.selected ? st.sheets[st.selected] : undefined;
  const sheet = loaded && 'sheet' in loaded ? loaded.sheet : null;
  const image = loaded && 'sheet' in loaded ? loaded.image : null;

  // 換怪物時依畫布高度自動選縮放（一般怪 ×6、Boss ×1–2）
  useEffect(() => {
    if (!sheet) return;
    const h = canvasSize(sheet).h || 48;
    useMonsterPage.setState({ zoom: Math.max(1, Math.min(8, Math.floor(400 / h))) });
  }, [st.selected, sheet]);

  // 播放
  const tag = sheet && def ? sheet.tags.get(def.tags[st.action] ?? '') : undefined;
  const length = tag ? tag.to - tag.from + 1 : 0;
  useEffect(() => {
    if (!st.playing || !tag || !sheet) return;
    const loop = st.action === 'move' || st.action === 'idle';
    const frameIndex = tag.from + Math.min(st.frame, length - 1);
    const ms = def?.frameDurations?.[String(frameIndex)] ?? sheet.frame(null, frameIndex)?.durationMs ?? 100;
    const timer = setTimeout(() => {
      const next = st.frame + 1;
      if (next < length) useMonsterPage.setState({ frame: next });
      else if (loop) useMonsterPage.setState({ frame: 0 });
      else useMonsterPage.setState({ playing: false });
    }, ms);
    return () => clearTimeout(timer);
  }, [st.playing, st.frame, st.action, tag, sheet, length, def?.frameDurations]);

  const tierOf = (id: string) => mathTier?.monsters.find((m) => m.id === id)?.tier;
  const dirty = new Set(dirtyKey.split(','));

  return (
    <div className="page">
      <aside className="tree">
        <div className="panel-title">
          怪物 <span className="badge">{st.ids.length}</span>
          <span className="spacer" />
          <button className="small" onClick={() => fs && void scanMonsters(fs)}>重新掃描</button>
        </div>
        {st.ids.length === 0 && (
          <div className="section hint">
            content/monsters/ 沒有怪物。請把 Aseprite 檔放在 art/monsters/mob_0001.aseprite，再執行 npm run art 匯出。
          </div>
        )}
        {st.ids.map((id) => {
          const unreg = st.unregistered.includes(id);
          return (
            <div
              key={id}
              className={`tree-item ${st.selected === id ? 'selected' : ''}`}
              onClick={() => useMonsterPage.setState({ selected: id, frame: 0, playing: true })}
            >
              <span className={dirty.has(id) ? 'dirty' : ''}>{id}</span>
              <MonsterName id={id} />
              <span className="meta">{unreg ? '未登錄' : tierLabel(tierOf(id))}</span>
            </div>
          );
        })}
        {error && <div className="section hint" style={{ color: 'var(--error)' }}>{error}</div>}
      </aside>

      <section className="canvas">
        {!st.selected ? (
          <Empty>請選擇怪物</Empty>
        ) : !def ? (
          <Empty>
            <div>
              {st.selected} 已匯出但還沒有登錄。
              <br />
              <br />
              <button className="primary" onClick={() => registerMonster(st.selected!).catch((e: unknown) => setError(String(e)))}>
                登錄這隻怪物
              </button>
              <div className="hint" style={{ marginTop: 8 }}>會依 sheet 自動對應動作、讀取判定框，並在數值檔新增一筆。</div>
            </div>
          </Empty>
        ) : loaded && 'error' in loaded ? (
          <Empty>{loaded.error}</Empty>
        ) : !sheet ? (
          <Empty>讀取中…</Empty>
        ) : st.view === 'sprite' ? (
          tag ? (
            <SpriteView def={def} sheet={sheet} image={image} frameIndex={tag.from + Math.min(st.frame, length - 1)} zoom={st.zoom} showHitbox={st.showHitbox} />
          ) : (
            <Empty>動作「{ACTION_LABEL[st.action]}」沒有對應的 Tag</Empty>
          )
        ) : (
          <MonsterPreview def={def} />
        )}
        <div className="canvas-toolbar">
          <div className="group">
            <button className={`small ${st.view === 'sprite' ? 'active' : ''}`} onClick={() => useMonsterPage.setState({ view: 'sprite' })}>
              逐幀檢視
            </button>
            <button className={`small ${st.view === 'preview' ? 'active' : ''}`} onClick={() => useMonsterPage.setState({ view: 'preview' })}>
              遊戲預覽
            </button>
          </div>
          <div className="group">
            <Checkbox checked={st.showHitbox} onChange={(showHitbox) => useMonsterPage.setState({ showHitbox })} label="判定框" />
            <Checkbox checked={st.lighting} onChange={(lighting) => useMonsterPage.setState({ lighting })} label="暗場景" />
          </div>
        </div>
      </section>

      <aside className="props">{def ? <MonsterProps def={def} sheet={sheet} /> : null}</aside>

      <div className="bottom">
        <span className="hint">動作</span>
        <select
          value={st.action}
          onChange={(e) => useMonsterPage.setState({ action: e.target.value as Action, frame: 0, playing: true })}
        >
          {[...ACTIONS, 'appear' as const].map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
              {def?.tags[a] ? `（${def.tags[a]}）` : ''}
            </option>
          ))}
        </select>
        <button className="small" onClick={() => useMonsterPage.setState((s) => ({ playing: !s.playing, frame: !s.playing && s.frame >= length - 1 ? 0 : s.frame }))}>
          {st.playing ? '■' : '▶'}
        </button>
        <span className="hint">幀</span>
        <button className="small" disabled={length === 0} onClick={() => useMonsterPage.setState((s) => ({ playing: false, frame: (s.frame - 1 + length) % length }))}>
          ◀
        </button>
        <span className="mono">
          {length ? Math.min(st.frame, length - 1) + 1 : 0}/{length}
        </span>
        <button className="small" disabled={length === 0} onClick={() => useMonsterPage.setState((s) => ({ playing: false, frame: (s.frame + 1) % length }))}>
          ▶
        </button>
        <span className="hint">縮放</span>
        <select value={st.zoom} onChange={(e) => useMonsterPage.setState({ zoom: Number(e.target.value) })}>
          {[1, 2, 3, 4, 6, 8].map((z) => (
            <option key={z} value={z}>
              ×{z}
            </option>
          ))}
        </select>
        {st.action === 'die' && def && <span className="hint">噴金幣在第 {def.fx.coinFrame + 1} 幀</span>}
      </div>
    </div>
  );
}

function MonsterName({ id }: { id: string }) {
  const name = useDoc<MonsterDef>(monsterPath(id))?.data.name;
  return name && name !== id ? <span className="hint">{name}</span> : null;
}

function tierLabel(tier: string | undefined) {
  return tier ? ({ normal: '一般', elite: '菁英', special: '特殊', boss: 'Boss' } as Record<string, string>)[tier] : '';
}

/** 遊戲引擎預覽：四個動作輪播、模擬擊殺（頓幀、閃白 → 死亡 → 噴金幣）、巡邏、受光。 */
function MonsterPreview({ def }: { def: MonsterDef }) {
  const content = useStudio((s) => s.content);
  const showHitbox = useMonsterPage((s) => s.showHitbox);
  const lighting = useMonsterPage((s) => s.lighting);
  const [handle, setHandle] = useState<MonsterPreviewHandle | null>(null);
  const [patrol, setPatrol] = useState(false);
  const multiplier = useDoc<MonsterMathFile>(MATH_PATH)?.data.monsters.find((m) => m.id === def.mathId)?.multiplier;
  const shownMultiplier = typeof multiplier === 'number' ? multiplier : multiplier?.[1];
  useEffect(
    () => handle?.update({ monster: def, showHitbox, lighting, patrol, ...(shownMultiplier ? { multiplier: shownMultiplier } : {}) }),
    [handle, def, showHitbox, lighting, patrol, shownMultiplier],
  );
  if (!content) return null;
  return (
    <>
      <EngineView<MonsterPreviewHandle>
        deps={[def.id, content]}
        onHandle={setHandle}
        mount={(engine, parent) => engine.createMonsterPreview(parent, { content, monster: def, showHitbox, lighting, patrol })}
      />
      <div className="canvas-toolbar" style={{ top: 44 }}>
        <div className="group">
          <Checkbox checked={patrol} onChange={setPatrol} label="地板巡邏" />
        </div>
        <div className="group">
          {(['idle', 'move', 'hit', 'die', 'appear'] as const).map((a) => (
            <button key={a} className="small" disabled={!handle || !def.tags[a]} onClick={() => handle?.play(a)}>
              {ACTION_LABEL[a]}
            </button>
          ))}
          <button className="small primary" disabled={!handle} onClick={() => handle?.simulateKill()}>
            模擬擊殺
          </button>
        </div>
      </div>
    </>
  );
}

registerPage({ id: 'monster', title: '怪物', component: MonsterPage });
