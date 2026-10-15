import type { MapDef, NavEdgeType } from '@lawn/shared';
import { useEffect, useMemo } from 'react';
import { emptyNavEdits, navEditsPath, removeEdge } from '../../map/navEdits';
import type { NavEdits } from '../../map/navEdits';
import { validateMap } from '../../map/validate';
import { useDoc, useDocs } from '../../state/docs';
import { ensureDoc } from '../../state/project';
import { Section, Select } from '../../ui/controls';
import { mapIdsInDocs, updateNavEdits, useMapPage } from './mapStore';

export function MapProps({ map }: { map: MapDef }) {
  const selection = useMapPage((s) => s.selection);
  const convertIssues = useMapPage((s) => s.convertIssues);
  const mapIdsKey = useDocs((s) => mapIdsInDocs(s.docs).join(','));
  const issues = useMemo(() => validateMap(map, new Set(mapIdsKey.split(','))), [map, mapIdsKey]);
  const levelIssues = convertIssues.filter((i) => i.level === map.name);

  return (
    <>
      <div className="panel-title">地圖 {map.id}</div>
      <Section title="基本資料">
        <div className="kv">
          <span>名稱</span>
          <span>{map.name}</span>
          <span>主題</span>
          <span className="mono">{map.theme}</span>
          <span>BGM</span>
          <span className="mono">{map.bgm || '（未設定）'}</span>
          <span>大小</span>
          <span>
            {map.size.w}×{map.size.h} px（{map.size.w / map.tileSize}×{map.size.h / map.tileSize} 格）
          </span>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          地圖內容由 LDtk 產生，請在 LDtk 修改後重新匯入；欄位 roomId、theme、bgm 在 LDtk 的關卡欄位設定。
        </div>
      </Section>
      <Section title="足場與實體">
        <div className="kv">
          <span>地面</span>
          <span>
            {map.footholds.length} 條（單向 {map.footholds.filter((f) => f.oneWay).length}）
          </span>
          <span>牆／天花板</span>
          <span>
            {map.walls.length} ／ {map.ceilings.length}
          </span>
          <span>繩梯</span>
          <span>
            繩 {map.climbables.filter((c) => c.type === 'rope').length}、梯 {map.climbables.filter((c) => c.type === 'ladder').length}
          </span>
          <span>傳送點</span>
          <span>{map.portals.map((p) => p.type).join('、')}</span>
          <span>生怪區</span>
          <span>{map.spawnZones.length}</span>
          <span>光源</span>
          <span>{map.lights.length}</span>
          <span>怪潮湧入</span>
          <span>{map.waveEntries.length}</span>
          <span>Boss</span>
          <span>{map.boss ? `${map.boss.mobId}（每 ${map.boss.intervalSec} 秒）` : '—'}</span>
        </div>
      </Section>
      <NavSection map={map} />
      {selection && <SelectionInfo map={map} selection={selection} />}
      {(issues.length > 0 || levelIssues.length > 0) && (
        <Section title={`問題（${issues.length + levelIssues.length}）`}>
          {levelIssues.map((i, n) => (
            <div key={`c${n}`} className="hint" style={{ color: i.severity === 'error' ? 'var(--error)' : 'var(--warn)' }}>
              LDtk：{i.message}
            </div>
          ))}
          {issues.map((i, n) => (
            <div
              key={n}
              className="hint"
              style={{ color: i.severity === 'error' ? 'var(--error)' : 'var(--warn)', cursor: i.target ? 'pointer' : undefined }}
              onClick={() => i.target && i.target !== map.id && useMapPage.setState({ selection: i.target })}
            >
              {i.message.replace(`${map.id}：`, '')}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

const NAV_TYPE_LABEL: Record<NavEdgeType, string> = { run: '跑', jump: '跳', drop: '下跳', climb: '繩梯', roll: '翻滾', portal: '傳送點' };

function NavSection({ map }: { map: MapDef }) {
  const layers = useMapPage((s) => s.layers);
  const navTool = useMapPage((s) => s.navTool);
  const navAddType = useMapPage((s) => s.navAddType);
  const navDraft = useMapPage((s) => s.navDraft);
  const edits = useDoc<NavEdits>(navEditsPath(map.id))?.data;
  useEffect(() => {
    void ensureDoc(navEditsPath(map.id)).catch(() => undefined);
  }, [map.id]);
  const byType = map.nav.edges.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {});
  const manualCount = (edits?.add.length ?? 0) + (edits?.remove.length ?? 0);

  return (
    <Section
      title="導航圖"
      actions={
        <button className="small" title="依目前地圖與遊戲物理重新產生（保留手動修改）" onClick={() => void updateNavEdits(map.id, (e) => e, '重新產生導航圖')}>
          重新產生
        </button>
      }
    >
      <div className="kv">
        <span>節點</span>
        <span>{map.nav.nodes.length}</span>
        <span>連線</span>
        <span>
          {map.nav.edges.length}（{Object.entries(byType).map(([t, n]) => `${NAV_TYPE_LABEL[t as NavEdgeType] ?? t} ${n}`).join('、')}）
        </span>
        <span>手動修改</span>
        <span>
          新增 {edits?.add.length ?? 0}、刪除 {edits?.remove.length ?? 0}
          {manualCount > 0 && (
            <button className="small" style={{ marginLeft: 6 }} onClick={() => void updateNavEdits(map.id, () => emptyNavEdits(), '清除導航圖手動修改')}>
              全部還原
            </button>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!layers.nav ? (
          <button className="small" onClick={() => useMapPage.setState((s) => ({ layers: { ...s.layers, nav: true } }))}>
            顯示導航圖以編輯
          </button>
        ) : (
          <>
            <button className={`small ${navTool === 'select' ? 'active' : ''}`} onClick={() => useMapPage.setState({ navTool: 'select', navDraft: null })}>
              選取連線
            </button>
            <button className={`small ${navTool === 'add' ? 'active' : ''}`} onClick={() => useMapPage.setState({ navTool: 'add', navDraft: null })}>
              新增連線
            </button>
            {navTool === 'add' && (
              <Select
                value={navAddType}
                options={(Object.keys(NAV_TYPE_LABEL) as NavEdgeType[]).map((t) => ({ value: t, label: NAV_TYPE_LABEL[t] }))}
                onChange={(navAddType) => useMapPage.setState({ navAddType })}
              />
            )}
          </>
        )}
      </div>
      {layers.nav && navTool === 'add' && (
        <div className="hint" style={{ marginTop: 4 }}>
          {navDraft ? `起點 (${navDraft[0]}, ${navDraft[1]})，請點終點所在的足場。` : '先點起跳點所在的足場，再點目標足場。'}
        </div>
      )}
    </Section>
  );
}

function SelectionInfo({ map, selection }: { map: MapDef; selection: string }) {
  const [kind, ...rest] = selection.split(':');
  const id = rest.join(':');
  let rows: [string, string][] = [];
  let title = '選取';
  if (kind === 'portal') {
    const p = map.portals.find((x) => x.id === id);
    if (p) {
      title = '傳送點';
      rows = [['類型', p.type], ['位置', `(${p.x}, ${p.y})`], ...(p.toRoom ? ([['目標房', String(p.toRoom)]] as [string, string][]) : []), ['ID', p.id]];
    }
  } else if (kind === 'zone') {
    const z = map.spawnZones.find((x) => x.id === id);
    if (z) {
      title = '生怪區';
      rows = [
        ['範圍', `(${z.rect.x}, ${z.rect.y}) ${z.rect.w}×${z.rect.h}`],
        ['上限', String(z.maxCount)],
        ['補怪', `${z.respawnSec} 秒`],
        ['怪物', z.pool.map((p) => `${p.mobId}×${p.weight}`).join('、')],
        ['足場', z.footholdIds.join('、') || '（無）'],
      ];
    }
  } else if (kind === 'light') {
    const l = map.lights[Number(id)];
    if (l) {
      title = '光源';
      rows = [['位置', `(${l.x}, ${l.y})`], ['顏色', l.color], ['半徑', String(l.radius)], ['強度', String(l.intensity)], ['閃爍', String(l.flicker)]];
    }
  } else if (kind === 'climb') {
    const c = map.climbables.find((x) => x.id === Number(id));
    if (c) {
      title = c.type === 'rope' ? '繩索' : '梯子';
      rows = [['x', String(c.x)], ['範圍', `${c.yTop} – ${c.yBottom}`]];
    }
  } else if (kind === 'fh') {
    const f = map.footholds.find((x) => x.id === Number(id));
    if (f) {
      title = `地面 #${f.id}`;
      rows = [['單向', f.oneWay ? '是' : '否'], ['頂點', f.points.map((p) => `(${p[0]},${p[1]})`).join(' ')]];
    }
  } else if (kind === 'edge') {
    const [from, to, type] = id.split('>');
    const edge = map.nav.edges.find((e) => String(e.from) === from && String(e.to) === to && e.type === type);
    if (edge) {
      return (
        <Section title={`導航連線：${NAV_TYPE_LABEL[edge.type]}`} actions={<button className="small" onClick={() => useMapPage.setState({ selection: null })}>取消選取</button>}>
          <div className="kv">
            <span>從足場</span>
            <span className="mono">#{edge.from}</span>
            <span>到足場</span>
            <span className="mono">#{edge.to}</span>
            <span>起跳點 x</span>
            <span className="mono">{edge.x ?? '—'}</span>
            <span>方向</span>
            <span>{edge.dir === -1 ? '左' : edge.dir === 1 ? '右' : '原地'}</span>
          </div>
          <button
            className="small"
            style={{ marginTop: 6 }}
            onClick={() => {
              void updateNavEdits(map.id, (e) => removeEdge(map, e, edge), '刪除導航連線');
              useMapPage.setState({ selection: null });
            }}
          >
            刪除這條連線
          </button>
        </Section>
      );
    }
  } else if (kind === 'boss' && map.boss) {
    title = 'Boss';
    rows = [['怪物', map.boss.mobId], ['位置', `(${map.boss.x}, ${map.boss.y})`], ['間隔', `${map.boss.intervalSec} 秒`]];
  }
  if (rows.length === 0) return null;
  return (
    <Section title={title} actions={<button className="small" onClick={() => useMapPage.setState({ selection: null })}>取消選取</button>}>
      <div className="kv">
        {rows.map(([k, v]) => (
          <span key={k} style={{ display: 'contents' }}>
            <span>{k}</span>
            <span className="mono" style={{ wordBreak: 'break-all' }}>
              {v}
            </span>
          </span>
        ))}
      </div>
    </Section>
  );
}
