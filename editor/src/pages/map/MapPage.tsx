import type { MapPreviewHandle } from '@lawn/engine';
import type { MapDef } from '@lawn/shared';
import { useEffect, useRef, useState } from 'react';
import { navEditsPath } from '../../map/navEdits';
import type { NavEdits } from '../../map/navEdits';
import { validateMaps } from '../../map/validate';
import { ensureDoc } from '../../state/project';
import { docsStore, isDirty, useDoc, useDocs } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { registerValidator } from '../../state/validation';
import type { Issue } from '../../state/validation';
import { Checkbox, Empty } from '../../ui/controls';
import { EngineView } from '../../ui/EngineView';
import { registerPage } from '../registry';
import { MapCanvas, clearMapImageCache } from './MapCanvas';
import { MapProps } from './MapProps';
import { computeNav, importLdtk, loadExistingMaps, mapIdsInDocs, mapPath, refreshCandidates, useMapPage, watchLdtk } from './mapStore';
import type { MapLayers } from './mapStore';
import { Playtest } from './Playtest';
import { ThemeEditor } from './ThemeEditor';

registerValidator('maps', async ({ fs }) => {
  await loadExistingMaps(fs);
  const docs = docsStore.getState().docs;
  const maps = mapIdsInDocs(docs).map((id) => docs[mapPath(id)]!.data as MapDef);
  const convert: Issue[] = useMapPage.getState().convertIssues.map((i) => ({
    severity: i.severity,
    page: 'map',
    message: `LDtk ${i.level}：${i.message}`,
  }));
  // 導航圖是否與目前的物理、手動修改一致（遊戲端改了物理常數之後要重新產生）
  const navIssues: Issue[] = [];
  for (const map of maps) {
    const edits = (await ensureDoc<NavEdits>(navEditsPath(map.id)).catch(() => undefined))?.data;
    const applied = computeNav(map, edits);
    for (const u of applied.unresolved) {
      navIssues.push({ severity: 'warning', page: 'map', target: map.id, path: navEditsPath(map.id), message: `${map.id}：手動${u.kind === 'add' ? '新增' : '刪除'}的導航連線找不到對應的足場（地圖可能改過了）` });
    }
    const key = (g: MapDef['nav']) => g.edges.map((e) => `${e.from}>${e.to}>${e.type}>${e.x ?? ''}`).sort().join('|');
    if (key(applied.nav) !== key(map.nav)) {
      navIssues.push({ severity: 'warning', page: 'map', target: map.id, path: mapPath(map.id), message: `${map.id}：導航圖不是最新的（遊戲物理或地圖有改動），請在地圖頁按「重新產生」或重新匯入 LDtk` });
    }
  }
  return [...convert, ...validateMaps(maps), ...navIssues];
});

const LAYER_LABELS: [keyof MapLayers, string][] = [
  ['tiles', '圖塊'],
  ['footholds', '足場'],
  ['walls', '牆／天花板'],
  ['climbables', '繩梯'],
  ['entities', '實體'],
  ['zones', '生怪區'],
  ['lights', '光源'],
  ['nav', '導航圖'],
  ['grid', '格線'],
];

function MapPage() {
  const fs = useStudio((s) => s.fs);
  const state = useMapPage();
  const mapIds = useDocs((s) => mapIdsInDocs(s.docs).join(',')).split(',').filter(Boolean);
  const dirtyKey = useDocs((s) => mapIds.filter((id) => isDirty(s.docs[mapPath(id)])).join(','));
  const dirty = new Set(dirtyKey.split(','));
  const selected = useDoc<MapDef>(state.selected ? mapPath(state.selected) : null)?.data;
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fs) return;
    clearMapImageCache();
    void (async () => {
      try {
        await loadExistingMaps(fs);
        await refreshCandidates();
        if (!useMapPage.getState().selected) {
          const first = mapIdsInDocs(docsStore.getState().docs)[0];
          if (first) useMapPage.setState({ selected: first });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return watchLdtk();
  }, [fs]);

  // content/ 的圖更新（例如重新匯出 tileset）：清掉畫布的圖快取
  const contentVersion = useStudio((s) => s.contentVersion);
  useEffect(() => {
    if (contentVersion > 0) clearMapImageCache();
  }, [contentVersion]);

  // 驗證面板點擊跳轉
  const focus = useStudio((s) => s.focus);
  useEffect(() => {
    if (focus?.page !== 'map') return;
    const [id, ...rest] = focus.target.split(':');
    if (id && /^map_\d{4}$/.test(id)) useMapPage.setState({ selected: id, selection: rest.length ? rest.join(':') : null, mode: 'maps' });
    else useMapPage.setState({ selection: focus.target });
  }, [focus]);

  const runImport = () => {
    setError(null);
    importLdtk().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="page">
      <aside className="tree">
        <div className="panel-title">LDtk 來源</div>
        <div className="section">
          {state.candidates.length === 0 ? (
            <div className="hint">
              找不到 .ldtk 檔。請把 LDtk 專案放在 <span className="mono">art/maps/world.ldtk</span>。
            </div>
          ) : (
            <select style={{ width: '100%' }} value={state.ldtkPath ?? ''} onChange={(e) => useMapPage.setState({ ldtkPath: e.target.value, lastImport: null })}>
              {state.candidates.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <button className="primary" disabled={!state.ldtkPath} onClick={runImport}>
              匯入
            </button>
            <Checkbox checked={state.autoReimport} onChange={(v) => useMapPage.setState({ autoReimport: v })} label="存檔自動匯入" />
          </div>
          {state.lastImport && <div className="hint">上次匯入：{new Date(state.lastImport.at).toLocaleTimeString()}</div>}
          {error && <div className="hint" style={{ color: 'var(--error)' }}>{error}</div>}
        </div>
        <div className="panel-title">
          地圖 <span className="badge">{mapIds.length}</span>
        </div>
        {mapIds.map((id) => (
          <div
            key={id}
            className={`tree-item ${state.mode === 'maps' && state.selected === id ? 'selected' : ''}`}
            onClick={() => useMapPage.setState({ selected: id, selection: null, mode: 'maps' })}
          >
            <span className={dirty.has(id) ? 'dirty' : ''}>{id}</span>
            <MapMeta id={id} />
          </div>
        ))}
        <div className="panel-title">設定</div>
        <div className={`tree-item ${state.mode === 'themes' ? 'selected' : ''}`} onClick={() => useMapPage.setState({ mode: 'themes' })}>
          主題（背景組、環境光）
        </div>
      </aside>

      {state.mode === 'themes' ? (
        <ThemeEditor />
      ) : (
        <>
          <section className="canvas">
            {!selected ? (
              <Empty>
                {mapIds.length === 0 ? '還沒有地圖。選擇 LDtk 來源後按「匯入」。' : '請選擇地圖'}
              </Empty>
            ) : state.view === 'structure' ? (
              <MapCanvas map={selected} onCursor={setCursor} />
            ) : (
              <MapPreview map={selected} />
            )}
            <div className="canvas-toolbar">
              <div className="group">
                <button className={`small ${state.view === 'structure' ? 'active' : ''}`} onClick={() => useMapPage.setState({ view: 'structure' })}>
                  結構
                </button>
                <button className={`small ${state.view === 'preview' ? 'active' : ''}`} onClick={() => useMapPage.setState({ view: 'preview' })}>
                  光影預覽
                </button>
              </div>
              {state.view === 'structure' && (
                <div className="group">
                  {LAYER_LABELS.map(([key, text]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={state.layers[key]}
                        onChange={(e) => useMapPage.setState((s) => ({ layers: { ...s.layers, [key]: e.target.checked } }))}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              )}
              <span style={{ flex: 1 }} />
              <div className="group">
                <button className="small" disabled={!selected} onClick={() => setPlaying(true)}>
                  ▶ 試玩
                </button>
              </div>
            </div>
          </section>
          <aside className="props">{selected ? <MapProps map={selected} /> : null}</aside>
          <div className="bottom">
            <Legend />
            <span style={{ flex: 1 }} />
            <span className="mono hint">{cursor ? `(${cursor[0]}, ${cursor[1]}) 格 (${Math.floor(cursor[0] / 16)}, ${Math.floor(cursor[1] / 16)})` : ''}</span>
          </div>
        </>
      )}
      {playing && selected && <Playtest map={selected} onExit={() => setPlaying(false)} />}
    </div>
  );
}

function MapMeta({ id }: { id: string }) {
  const map = useDoc<MapDef>(mapPath(id))?.data;
  return <span className="meta">{map ? `${map.name} · ${map.theme.replace('theme_', 'T')}` : ''}</span>;
}

function Legend() {
  const items: [string, string][] = [
    ['#5ad16a', '地面'],
    ['#5ad1d1', '單向平台'],
    ['#ff6b7a', '牆'],
    ['#ff9f4a', '天花板'],
    ['#f2d64b', '繩梯'],
    ['#e65a5a', '生怪區'],
    ['#a58cff', '導航'],
  ];
  return (
    <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map(([c, t]) => (
        <span key={t} className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 3, background: c, display: 'inline-block' }} />
          {t}
        </span>
      ))}
    </span>
  );
}

function MapPreview({ map }: { map: MapDef }) {
  const content = useStudio((s) => s.content);
  const [lighting, setLighting] = useState(true);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [overlay, setOverlay] = useState(false);
  const [nav, setNav] = useState(false);
  const [handle, setHandle] = useState<MapPreviewHandle | null>(null);
  // 假鏡頭：從出生點開始，拖曳移動
  const spawn = map.portals.find((p) => p.type === 'spawn');
  const cam = useRef({ x: spawn?.x ?? map.size.w / 2, y: (spawn?.y ?? map.size.h / 2) - 60 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  useEffect(() => {
    cam.current = { x: spawn?.x ?? map.size.w / 2, y: (spawn?.y ?? map.size.h / 2) - 60 };
    handle?.setCamera(cam.current.x, cam.current.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, map.id]);
  useEffect(() => handle?.update({ map, lighting, quality }), [handle, map, lighting, quality]);
  useEffect(() => handle?.update({ showFootholds: overlay, showNav: nav }), [handle, overlay, nav]);
  if (!content) return null;
  return (
    <>
      <EngineView<MapPreviewHandle>
        deps={[map.id, content]}
        onHandle={setHandle}
        mount={(engine, parent) => engine.createMapPreview(parent, { content, map, lighting, quality, showFootholds: overlay, showNav: nav })}
      />
      <div
        className="canvas-host"
        style={{ cursor: 'grab', zIndex: 1 }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !handle) return;
          const scale = Math.max(1, (e.currentTarget.clientHeight || 540) / 540);
          cam.current = { x: d.cx - (e.clientX - d.x) / scale, y: d.cy - (e.clientY - d.y) / scale };
          handle.setCamera(cam.current.x, cam.current.y);
        }}
        onPointerUp={() => (drag.current = null)}
      />
      <div className="canvas-toolbar" style={{ top: 44 }}>
        <div className="group">
          <Checkbox checked={overlay} onChange={setOverlay} label="足場疊加" />
          <Checkbox checked={nav} onChange={setNav} label="導航圖" />
        </div>
        <div className="group">
          <Checkbox checked={lighting} onChange={setLighting} label="光照" />
          <label>
            畫質
            <select value={quality} onChange={(e) => setQuality(e.target.value as 'high' | 'low')}>
              <option value="high">高</option>
              <option value="low">低</option>
            </select>
          </label>
        </div>
      </div>
    </>
  );
}

registerPage({ id: 'map', title: '地圖', component: MapPage });
