import { AVATAR_TAG_NAMES, AVATAR_TAGS } from '@lawn/shared';
import type { AseSheet, AvatarItem, Expression } from '@lawn/shared';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_LABEL } from '../../avatar/defaults';
import { validateBase, validateItem } from '../../avatar/validate';
import { isDirty, useDoc, useDocs, useDocsShallow } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { Checkbox, Empty, Section } from '../../ui/controls';
import { registerPage } from '../registry';
import './avatarChecks';
import { AvatarCanvas } from './AvatarCanvas';
import { itemPath, registerItem, scanAvatar, updateItem, useAvatarPage } from './avatarStore';
import { ItemForm } from './ItemForm';
import { PalettePanel } from './PalettePanel';
import { TryOn } from './TryOn';
import { defaultLoadout, useBase, useParts, usePalettes, useRenderer } from './useAvatarData';

function AvatarPage() {
  const fs = useStudio((s) => s.fs);
  const st = useAvatarPage();
  const [error, setError] = useState<string | null>(null);
  const { base, error: baseError } = useBase();
  const palettes = usePalettes();

  useEffect(() => {
    if (fs) scanAvatar(fs).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [fs]);
  const focus = useStudio((s) => s.focus);
  useEffect(() => {
    if (focus?.page === 'avatar') useAvatarPage.setState({ selected: focus.target });
  }, [focus]);

  // 播放：依身體幀的時間
  const tag = base?.sheet.tags.get(st.tag);
  const length = tag ? tag.to - tag.from + 1 : 0;
  useEffect(() => {
    if (!st.playing || !tag || !base) return;
    const f = tag.from + Math.min(st.frame, length - 1);
    const ms = base.sheet.frame('body', f)?.durationMs ?? 100;
    const timer = setTimeout(() => useAvatarPage.setState((s) => ({ frame: (s.frame + 1) % length })), ms);
    return () => clearTimeout(timer);
  }, [st.playing, st.frame, tag, base, length]);
  const absFrame = tag ? tag.from + Math.min(st.frame, Math.max(0, length - 1)) : 0;

  const items = useDocs((s) =>
    st.ids
      .map((id) => s.docs[itemPath(id)]?.data as AvatarItem | undefined)
      .filter((x): x is AvatarItem => !!x)
      .map((i) => `${i.id}|${i.category}|${i.name}|${isDirty(s.docs[itemPath(i.id)]) ? 1 : 0}`)
      .join(','),
  );
  const itemRows = items ? items.split(',').map((r) => { const [id, category, name, dirty] = r.split('|'); return { id: id!, category: category!, name: name!, dirty: dirty === '1' }; }) : [];
  const isItem = !['base', 'palettes', 'tryon'].includes(st.selected);

  return (
    <div className="page">
      <aside className="tree">
        <div className="panel-title">
          角色造型
          <span className="spacer" />
          <button className="small" onClick={() => fs && void scanAvatar(fs).then(() => useAvatarPage.setState((s) => ({ version: s.version + 1 })))}>
            重新掃描
          </button>
        </div>
        {(['base', 'palettes', 'tryon'] as const).map((k) => (
          <div key={k} className={`tree-item ${st.selected === k ? 'selected' : ''}`} onClick={() => useAvatarPage.setState({ selected: k })}>
            {k === 'base' ? '基礎身體' : k === 'palettes' ? '調色盤' : '試穿'}
          </div>
        ))}
        {CATEGORIES.map((c) => {
          const rows = itemRows.filter((r) => r.category === c);
          if (rows.length === 0) return null;
          return (
            <div key={c}>
              <div className="panel-title">{CATEGORY_LABEL[c]}</div>
              {rows.map((r) => (
                <div key={r.id} className={`tree-item ${st.selected === r.id ? 'selected' : ''}`} onClick={() => useAvatarPage.setState({ selected: r.id })}>
                  <span className={r.dirty ? 'dirty' : ''}>{r.id}</span>
                  {r.name !== r.id && <span className="hint">{r.name}</span>}
                </div>
              ))}
            </div>
          );
        })}
        {st.unregistered.length > 0 && (
          <>
            <div className="panel-title">未登錄</div>
            {st.unregistered.map((id) => (
              <div key={id} className={`tree-item ${st.selected === id ? 'selected' : ''}`} onClick={() => useAvatarPage.setState({ selected: id })}>
                {id}
                <span className="meta">未登錄</span>
              </div>
            ))}
          </>
        )}
        {(error || baseError) && <div className="section hint" style={{ color: 'var(--error)' }}>{error ?? baseError}</div>}
      </aside>

      {st.selected === 'palettes' ? (
        <>
          <section className="canvas" style={{ overflow: 'auto' }}>
            <PalettePanel file={palettes} />
          </section>
          <aside className="props">
            <PalettePreview base={base} />
          </aside>
        </>
      ) : st.selected === 'tryon' ? (
        <TryOn base={base} frame={absFrame} />
      ) : st.selected === 'base' ? (
        <BaseView base={base} frame={absFrame} />
      ) : (
        <ItemView id={st.selected} base={base} frame={absFrame} />
      )}

      <div className="bottom">
        <span className="hint">動作</span>
        <select value={st.tag} onChange={(e) => useAvatarPage.setState({ tag: e.target.value, frame: 0 })}>
          {AVATAR_TAG_NAMES.map((t) => (
            <option key={t} value={t}>
              {t}（{AVATAR_TAGS[t].frames} 幀）
            </option>
          ))}
        </select>
        <button className="small" onClick={() => useAvatarPage.setState((s) => ({ playing: !s.playing }))}>
          {st.playing ? '■' : '▶'}
        </button>
        <span className="hint">幀</span>
        <button className="small" disabled={!length} onClick={() => useAvatarPage.setState((s) => ({ playing: false, frame: (s.frame - 1 + length) % length }))}>
          ◀
        </button>
        <span className="mono">
          {length ? st.frame + 1 : 0}/{length}
        </span>
        <button className="small" disabled={!length} onClick={() => useAvatarPage.setState((s) => ({ playing: false, frame: (s.frame + 1) % length }))}>
          ▶
        </button>
        <span className="hint">縮放</span>
        <select value={st.zoom} onChange={(e) => useAvatarPage.setState({ zoom: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6, 8].map((z) => (
            <option key={z} value={z}>
              ×{z}
            </option>
          ))}
        </select>
        {isItem && <span className="hint">姿勢表與規格檢查在右側</span>}
      </div>
    </div>
  );
}

function useViewToggles() {
  const [onion, setOnion] = useState(false);
  const [anchors, setAnchors] = useState(true);
  const [expression, setExpression] = useState<Expression>('default');
  const toolbar = (
    <div className="canvas-toolbar">
      <div className="group">
        <Checkbox checked={onion} onChange={setOnion} label="洋蔥皮" />
        <Checkbox checked={anchors} onChange={setAnchors} label="錨點" />
        <label>
          表情
          <select value={expression} onChange={(e) => setExpression(e.target.value as Expression)}>
            <option value="default">預設</option>
            <option value="blink">眨眼</option>
            <option value="hit">受擊</option>
            <option value="smile">微笑</option>
          </select>
        </label>
      </div>
    </div>
  );
  return { onion, anchors, expression, toolbar };
}

function BaseView({ base, frame }: { base: ReturnType<typeof useBase>['base']; frame: number }) {
  const palettes = usePalettes();
  const loadout = useMemo(() => defaultLoadout(palettes), [palettes]);
  const renderer = useRenderer(base, useMemo(() => [], []), palettes, loadout);
  const zoom = useAvatarPage((s) => s.zoom);
  const { onion, anchors, expression, toolbar } = useViewToggles();
  const issues = useMemo(() => validateBase(base?.sheet ?? null), [base]);
  return (
    <>
      <section className="canvas">
        {renderer ? <AvatarCanvas renderer={renderer} frame={frame} zoom={zoom} onionSkin={onion} showAnchors={anchors} expression={expression} /> : <Empty>找不到 content/avatar/base.sheet.json</Empty>}
        {toolbar}
      </section>
      <aside className="props">
        <div className="panel-title">基礎身體</div>
        <IssueList issues={issues} />
        {base && <BaseInfo sheet={base.sheet} />}
      </aside>
    </>
  );
}

function BaseInfo({ sheet }: { sheet: AseSheet }) {
  return (
    <Section title="動作與錨點">
      <table className="grid">
        <thead>
          <tr>
            <th>Tag</th>
            <th>幀</th>
            <th>規格</th>
            <th>視角</th>
          </tr>
        </thead>
        <tbody>
          {AVATAR_TAG_NAMES.map((t) => {
            const tag = sheet.tags.get(t);
            const n = tag ? tag.to - tag.from + 1 : 0;
            const ok = n === AVATAR_TAGS[t].frames;
            return (
              <tr key={t} style={{ cursor: 'pointer' }} onClick={() => useAvatarPage.setState({ tag: t, frame: 0 })}>
                <td className="mono">{t}</td>
                <td style={{ color: ok ? undefined : 'var(--warn)' }}>{tag ? `${n}（${tag.from}–${tag.to}）` : '缺少'}</td>
                <td>{AVATAR_TAGS[t].frames}</td>
                <td>{AVATAR_TAGS[t].view === 'front' ? '正面' : '背面'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="kv" style={{ marginTop: 8 }}>
        <span>圖層</span>
        <span className="mono">{sheet.layers.filter(Boolean).join('、')}</span>
        <span>錨點</span>
        <span className="mono">{['head', 'torso', 'hand'].map((s) => `${s}（${sheet.slices.get(s)?.length ?? 0} 個 key）`).join('、')}</span>
      </div>
    </Section>
  );
}

function ItemView({ id, base, frame }: { id: string; base: ReturnType<typeof useBase>['base']; frame: number }) {
  const item = useDoc<AvatarItem>(itemPath(id))?.data;
  const palettes = usePalettes();
  const zoom = useAvatarPage((s) => s.zoom);
  const ids = useAvatarPage((s) => s.ids);
  const allItems = useDocsShallow((s) => ids.map((x) => s.docs[itemPath(x)]?.data as AvatarItem | undefined).filter((x): x is AvatarItem => !!x));
  const [context, setContext] = useState(true);
  const [dragMode, setDragMode] = useState(false);
  const { onion, anchors, expression, toolbar } = useViewToggles();

  // 搭配：預設臉與頭髮（讓部件有參考），同分類的換成目前部件
  const contextIds = useMemo(() => {
    if (!item) return [];
    const pick = (c: string) => allItems.find((i) => i.category === c && i.category !== item.category)?.id;
    return context ? [pick('face'), pick('hair'), item.id].filter((x): x is string => !!x) : [item.id];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.category, context, allItems.map((i) => i.id).join(',')]);
  const { parts, errors } = useParts(contextIds);
  const loadout = useMemo(() => {
    const l = defaultLoadout(palettes, contextIds);
    const dye = palettes?.palettes.find((p) => p.group === 'dye');
    if (item?.recolor === 'dye' && dye) l.dyes = { [item.id]: dye.id };
    return l;
  }, [palettes, contextIds, item?.recolor, item?.id]);
  const renderer = useRenderer(base, parts, palettes, loadout);
  const part = parts.find((p) => p.item.id === id);
  const issues = useMemo(() => (item ? validateItem(item, part?.sheet ?? null, base?.sheet ?? null) : []), [item, part, base]);
  const canDrag = item && (item.kind === 'anchor' || item.layers.some((l) => ['hair_back', 'head', 'face', 'face_acc', 'eye_acc', 'hair_front', 'hat'].includes(l)));

  if (!item) {
    return (
      <>
        <section className="canvas">
          <Empty>
            <div>
              {id} 已匯出但還沒有登錄。
              <br />
              <br />
              <button className="primary" onClick={() => void registerItem(id)}>
                登錄這個部件
              </button>
              <div className="hint" style={{ marginTop: 8 }}>會依 ID 與 sheet 的圖層自動判斷分類、圖層與換色群組。</div>
            </div>
          </Empty>
        </section>
        <aside className="props" />
      </>
    );
  }

  return (
    <>
      <section className="canvas">
        {renderer ? (
          <AvatarCanvas
            renderer={renderer}
            frame={frame}
            zoom={zoom}
            onionSkin={onion}
            showAnchors={anchors}
            expression={expression}
            highlight={dragMode ? item.id : null}
            onDragOffset={
              dragMode
                ? (dx, dy) => updateItem(item.id, (i) => ({ ...i, offset: { x: (i.offset?.x ?? 0) + dx, y: (i.offset?.y ?? 0) + dy } }), '錨點對齊')
                : undefined
            }
          />
        ) : (
          <Empty>找不到 content/avatar/base.sheet.json</Empty>
        )}
        {toolbar}
        <div className="canvas-toolbar" style={{ top: 44 }}>
          <div className="group">
            <Checkbox checked={context} onChange={setContext} label="搭配臉與頭髮" />
            {canDrag && <Checkbox checked={dragMode} onChange={setDragMode} label="拖曳對齊（錨點部件）" />}
          </div>
        </div>
      </section>
      <aside className="props">
        <div className="panel-title">部件 {item.id}</div>
        {errors.length > 0 && <IssueList issues={errors.map((m) => ({ severity: 'error' as const, page: 'avatar' as const, message: m }))} />}
        <IssueList issues={issues} prefix={`${item.id}：`} />
        <ItemForm item={item} sheet={part?.sheet ?? null} base={base?.sheet ?? null} />
      </aside>
    </>
  );
}

function PalettePreview({ base }: { base: ReturnType<typeof useBase>['base'] }) {
  const palettes = usePalettes();
  const ids = useAvatarPage((s) => s.ids);
  const allItems = useDocsShallow((s) => ids.map((x) => s.docs[itemPath(x)]?.data as AvatarItem | undefined).filter((x): x is AvatarItem => !!x));
  const contextIds = useMemo(
    () => ['face', 'hair', 'top', 'bottom', 'shoes'].map((c) => allItems.find((i) => i.category === c)?.id).filter((x): x is string => !!x),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allItems.map((i) => i.id).join(',')],
  );
  const { parts } = useParts(contextIds);
  const [pick, setPick] = useState({ skin: 0, hair: 0, eye: 0, dye: 0 });
  const byGroup = (g: 'skin' | 'hair' | 'eye' | 'dye') => palettes?.palettes.filter((p) => p.group === g) ?? [];
  const loadout = useMemo(() => {
    const l = defaultLoadout(palettes, contextIds);
    l.skin = byGroup('skin')[pick.skin]?.id ?? l.skin;
    l.hair = byGroup('hair')[pick.hair]?.id ?? l.hair;
    l.eye = byGroup('eye')[pick.eye]?.id ?? l.eye;
    const dye = byGroup('dye')[pick.dye]?.id;
    if (dye) l.dyes = Object.fromEntries(contextIds.map((id) => [id, dye]));
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palettes, contextIds, pick]);
  const renderer = useRenderer(base, parts, palettes, loadout);
  return (
    <>
      <div className="panel-title">即時預覽</div>
      <div style={{ position: 'relative', height: 300 }}>{renderer && <AvatarCanvas renderer={renderer} frame={base?.sheet.tags.get('stand')?.from ?? 0} zoom={4} />}</div>
      <Section title="套用顏色">
        {(['skin', 'hair', 'eye', 'dye'] as const).map((g) => (
          <div key={g} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0' }}>
            <span className="hint" style={{ width: 36 }}>{{ skin: '膚', hair: '髮', eye: '瞳', dye: '染' }[g]}</span>
            {byGroup(g).map((p, i) => (
              <button key={p.id} className={`small ${pick[g] === i ? 'active' : ''}`} title={p.name} onClick={() => setPick({ ...pick, [g]: i })} style={{ padding: 2 }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, background: p.colors[Math.floor(p.colors.length / 2)] }} />
              </button>
            ))}
          </div>
        ))}
      </Section>
    </>
  );
}

export function IssueList({ issues, prefix }: { issues: { severity: 'error' | 'warning'; message: string }[]; prefix?: string }) {
  if (issues.length === 0) return null;
  return (
    <Section title={`規格檢查（${issues.length}）`}>
      {issues.map((i, n) => (
        <div key={n} className="hint" style={{ color: i.severity === 'error' ? 'var(--error)' : 'var(--warn)' }}>
          {prefix ? i.message.replace(prefix, '') : i.message}
        </div>
      ))}
    </Section>
  );
}

registerPage({ id: 'avatar', title: '角色造型', component: AvatarPage });
