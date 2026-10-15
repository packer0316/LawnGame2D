import { AVATAR_TAG_NAMES, AVATAR_TAGS } from '@lawn/shared';
import type { AseSheet, AvatarItem } from '@lawn/shared';
import { useEffect, useMemo, useState } from 'react';
import { CLASSES, CLASS_LABEL } from '../../avatar/defaults';
import { validateBase, validateItem } from '../../avatar/validate';
import { isDirty, useDoc, useDocs } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { Checkbox, Empty, Section } from '../../ui/controls';
import { registerPage } from '../registry';
import './avatarChecks';
import { AvatarCanvas } from './AvatarCanvas';
import { itemPath, registerItem, scanAvatar, updateItem, useAvatarPage } from './avatarStore';
import { ItemForm } from './ItemForm';
import { TryOn } from './TryOn';
import { useBase, useParts, useRenderer } from './useAvatarData';

/** 角色造型頁（STUDIO_SPEC §4，v0.3）：角色四職業共用、外觀固定，只有武器可以更換。 */
function AvatarPage() {
  const fs = useStudio((s) => s.fs);
  const contentVersion = useStudio((s) => s.contentVersion);
  const st = useAvatarPage();
  const [error, setError] = useState<string | null>(null);
  const { base, error: baseError } = useBase();

  useEffect(() => {
    if (!fs) return;
    scanAvatar(fs)
      .then(() => useAvatarPage.setState((s) => ({ version: s.version + 1 })))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [fs, contentVersion]);
  const focus = useStudio((s) => s.focus);
  useEffect(() => {
    if (focus?.page === 'avatar') useAvatarPage.setState({ selected: focus.target });
  }, [focus]);

  // 播放：依角色幀的時間
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

  const rowsKey = useDocs((s) =>
    st.ids
      .map((id) => s.docs[itemPath(id)]?.data as AvatarItem | undefined)
      .filter((x): x is AvatarItem => !!x)
      .map((i) => [i.id, i.category, i.classId ?? '', i.name, isDirty(s.docs[itemPath(i.id)]) ? '1' : '0'].join('|'))
      .join('\n'),
  );
  const rows = rowsKey
    ? rowsKey.split('\n').map((r) => {
        const [id, category, classId, name, dirty] = r.split('|');
        return { id: id!, category: category!, classId: classId!, name: name!, dirty: dirty === '1' };
      })
    : [];
  const weapons = rows.filter((r) => r.category === 'weapon');
  const legacy = rows.filter((r) => r.category !== 'weapon');

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <div className={`tree-item ${st.selected === r.id ? 'selected' : ''}`} onClick={() => useAvatarPage.setState({ selected: r.id })}>
      <span className={r.dirty ? 'dirty' : ''}>{r.id}</span>
      {r.name !== r.id && <span className="hint">{r.name}</span>}
    </div>
  );

  return (
    <div className="page">
      <aside className="tree">
        <div className="panel-title">
          角色與武器
          <span className="spacer" />
          <button className="small" onClick={() => fs && void scanAvatar(fs).then(() => useAvatarPage.setState((s) => ({ version: s.version + 1 })))}>
            重新掃描
          </button>
        </div>
        {(['base', 'tryon'] as const).map((k) => (
          <div key={k} className={`tree-item ${st.selected === k ? 'selected' : ''}`} onClick={() => useAvatarPage.setState({ selected: k })}>
            {k === 'base' ? '角色（四職業共用）' : '試穿'}
          </div>
        ))}
        {CLASSES.map((c) => {
          const list = weapons.filter((w) => w.classId === c);
          return (
            <div key={c}>
              <div className="panel-title">
                {CLASS_LABEL[c]}武器 <span className="badge">{list.length}</span>
              </div>
              {list.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </div>
          );
        })}
        {weapons.some((w) => !w.classId) && (
          <>
            <div className="panel-title">未設定職業</div>
            {weapons.filter((w) => !w.classId).map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </>
        )}
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
        {legacy.length > 0 && (
          <>
            <div className="panel-title">不再使用（舊換裝部件）</div>
            <div className="section hint">v0.3 起角色不換裝。這些部件遊戲不會使用，重新產出測試美術後會消失。</div>
            {legacy.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </>
        )}
        {(error || baseError) && <div className="section hint" style={{ color: 'var(--error)' }}>{error ?? baseError}</div>}
      </aside>

      {st.selected === 'tryon' ? <TryOn base={base} frame={absFrame} /> : st.selected === 'base' ? <BaseView base={base} frame={absFrame} /> : <ItemView id={st.selected} base={base} frame={absFrame} />}

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
      </div>
    </div>
  );
}

function useViewToggles() {
  const [onion, setOnion] = useState(false);
  const [anchors, setAnchors] = useState(true);
  const toolbar = (
    <div className="canvas-toolbar">
      <div className="group">
        <Checkbox checked={onion} onChange={setOnion} label="洋蔥皮" />
        <Checkbox checked={anchors} onChange={setAnchors} label="錨點" />
      </div>
    </div>
  );
  return { onion, anchors, toolbar };
}

function BaseView({ base, frame }: { base: ReturnType<typeof useBase>['base']; frame: number }) {
  const renderer = useRenderer(base, useMemo(() => [], []));
  const zoom = useAvatarPage((s) => s.zoom);
  const { onion, anchors, toolbar } = useViewToggles();
  const issues = useMemo(() => validateBase(base?.sheet ?? null), [base]);
  return (
    <>
      <section className="canvas">
        {renderer ? <AvatarCanvas renderer={renderer} frame={frame} zoom={zoom} onionSkin={onion} showAnchors={anchors} /> : <Empty>找不到 content/avatar/base.sheet.json</Empty>}
        {toolbar}
      </section>
      <aside className="props">
        <div className="panel-title">角色</div>
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
            <th>武器姿勢</th>
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
                <td>{t === 'ladder' || t === 'rope' ? '收起' : AVATAR_TAGS[t].poses}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="kv" style={{ marginTop: 8 }}>
        <span>圖層</span>
        <span className="mono">{[...new Set(sheet.layers.filter(Boolean))].join('、')}</span>
        <span>錨點</span>
        <span className="mono">{['hand', 'torso', 'head'].map((s) => `${s}（${sheet.slices.get(s)?.length ?? 0} 個 key）`).join('、')}</span>
      </div>
    </Section>
  );
}

function ItemView({ id, base, frame }: { id: string; base: ReturnType<typeof useBase>['base']; frame: number }) {
  const item = useDoc<AvatarItem>(itemPath(id))?.data;
  const zoom = useAvatarPage((s) => s.zoom);
  const [dragMode, setDragMode] = useState(false);
  const { onion, anchors, toolbar } = useViewToggles();
  const partIds = useMemo(() => (item ? [item.id] : []), [item?.id]);
  const { parts, errors } = useParts(partIds);
  const renderer = useRenderer(base, parts);
  const part = parts.find((p) => p.item.id === id);
  const issues = useMemo(() => (item ? validateItem(item, part?.sheet ?? null, base?.sheet ?? null) : []), [item, part, base]);

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
                登錄這把武器
              </button>
              <div className="hint" style={{ marginTop: 8 }}>會依 sheet 畫了哪個職業的攻擊動作自動判斷職業。</div>
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
            dragSource={dragMode ? item.id : null}
            onDragOffset={dragMode ? (dx, dy) => updateItem(item.id, (i) => ({ ...i, offset: { x: (i.offset?.x ?? 0) + dx, y: (i.offset?.y ?? 0) + dy } }), '錨點對齊') : undefined}
          />
        ) : (
          <Empty>找不到 content/avatar/base.sheet.json</Empty>
        )}
        {toolbar}
        {item.category === 'weapon' && (
          <div className="canvas-toolbar" style={{ top: 44 }}>
            <div className="group">
              <Checkbox checked={dragMode} onChange={setDragMode} label="拖曳對齊武器" />
            </div>
          </div>
        )}
      </section>
      <aside className="props">
        <div className="panel-title">{item.category === 'weapon' ? '武器' : '舊部件'} {item.id}</div>
        {errors.length > 0 && <IssueList issues={errors.map((m) => ({ severity: 'error' as const, message: m }))} />}
        <IssueList issues={issues} prefix={`${item.id}：`} />
        {item.category === 'weapon' ? <ItemForm item={item} sheet={part?.sheet ?? null} base={base?.sheet ?? null} /> : null}
      </aside>
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
