import type { AvatarPreviewHandle } from '@lawn/engine';
import type { AvatarItem, AvatarLoadout, AvatarTag, ClassId, PaletteGroup } from '@lawn/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_LABEL } from '../../avatar/defaults';
import { useDocsShallow } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { Checkbox, Field, Section, Select } from '../../ui/controls';
import { EngineView } from '../../ui/EngineView';
import { AvatarCanvas } from './AvatarCanvas';
import { itemPath, useAvatarPage } from './avatarStore';
import { GROUP_LABEL } from './PalettePanel';
import { defaultLoadout, useParts, usePalettes, useRenderer } from './useAvatarData';
import type { useBase } from './useAvatarData';

const CLASS_LABEL: Record<ClassId, string> = { warrior: '劍士', mage: '法師', archer: '弓箭手', assassin: '刺客' };
/** 隨機搭配時這些分類有一半機率不穿。 */
const OPTIONAL = ['hat', 'faceAcc', 'eyeAcc', 'cape', 'gloves', 'overall'];

/** 試穿（STUDIO_SPEC §4.6）：任意組合部件、顏色、職業、動作；隨機搭配（QA）；截圖。 */
export function TryOn({ base, frame }: { base: ReturnType<typeof useBase>['base']; frame: number }) {
  const palettes = usePalettes();
  const ids = useAvatarPage((s) => s.ids);
  const zoom = useAvatarPage((s) => s.zoom);
  const tag = useAvatarPage((s) => s.tag);
  const items = useDocsShallow((s) => ids.map((x) => s.docs[itemPath(x)]?.data as AvatarItem | undefined).filter((x): x is AvatarItem => !!x));
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [colors, setColors] = useState<Record<PaletteGroup, string>>({ skin: '', hair: '', eye: '', dye: '' });
  const [engineView, setEngineView] = useState(false);
  const [lighting, setLighting] = useState(false);
  const [handle, setHandle] = useState<AvatarPreviewHandle | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const content = useStudio((s) => s.content);

  // 第一次進來：每個主要分類穿第一件
  useEffect(() => {
    if (Object.keys(chosen).length > 0 || items.length === 0) return;
    const pick: Record<string, string> = {};
    for (const c of ['face', 'hair', 'top', 'bottom', 'shoes', 'weapon']) {
      const i = items.find((x) => x.category === c && (c !== 'weapon' || !x.classId || x.classId === classId));
      if (i) pick[c] = i.id;
    }
    setChosen(pick);
  }, [items, chosen, classId]);

  const byGroup = (g: PaletteGroup) => palettes?.palettes.filter((p) => p.group === g) ?? [];
  const itemIds = useMemo(() => Object.values(chosen).filter(Boolean), [chosen]);
  const loadout = useMemo<AvatarLoadout>(() => {
    const l = defaultLoadout(palettes, itemIds);
    if (colors.skin) l.skin = colors.skin;
    if (colors.hair) l.hair = colors.hair;
    if (colors.eye) l.eye = colors.eye;
    const dye = colors.dye || byGroup('dye')[0]?.id;
    if (dye) l.dyes = Object.fromEntries(itemIds.map((id) => [id, dye]));
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palettes, itemIds, colors]);
  const { parts } = useParts(itemIds);
  const renderer = useRenderer(base, parts, palettes, loadout);
  useEffect(() => handle?.update({ loadout, classId, tag: tag as AvatarTag, lighting, zoom }), [handle, loadout, classId, tag, lighting, zoom]);

  const randomize = () => {
    const pick: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const pool = items.filter((x) => x.category === c && (c !== 'weapon' || !x.classId || x.classId === classId));
      if (pool.length === 0) continue;
      if (OPTIONAL.includes(c) && Math.random() < 0.5) continue;
      pick[c] = pool[Math.floor(Math.random() * pool.length)]!.id;
    }
    if (pick.overall) delete pick.bottom;
    setChosen(pick);
    const rand = (g: PaletteGroup) => byGroup(g)[Math.floor(Math.random() * byGroup(g).length)]?.id ?? '';
    setColors({ skin: rand('skin'), hair: rand('hair'), eye: rand('eye'), dye: rand('dye') });
  };

  const screenshot = () => {
    const canvas = host.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `tryon-${tag}-${Date.now()}.png`;
    a.click();
  };

  return (
    <>
      <section className="canvas" ref={host}>
        {engineView && content ? (
          <EngineView<AvatarPreviewHandle>
            deps={[content]}
            onHandle={setHandle}
            mount={(engine, parent) => engine.createAvatarPreview(parent, { content, loadout, classId, tag: tag as AvatarTag, lighting, zoom })}
          />
        ) : renderer ? (
          <AvatarCanvas renderer={renderer} frame={frame} zoom={zoom} />
        ) : null}
        <div className="canvas-toolbar">
          <div className="group">
            <button className={`small ${!engineView ? 'active' : ''}`} onClick={() => setEngineView(false)}>
              工具繪製
            </button>
            <button className={`small ${engineView ? 'active' : ''}`} onClick={() => setEngineView(true)}>
              遊戲預覽
            </button>
          </div>
          {engineView && (
            <div className="group">
              <Checkbox checked={lighting} onChange={setLighting} label="光照" />
            </div>
          )}
          <div className="group">
            <button className="small" onClick={randomize}>
              🎲 隨機搭配
            </button>
            <button className="small" onClick={screenshot}>
              截圖
            </button>
          </div>
        </div>
      </section>
      <aside className="props">
        <div className="panel-title">試穿</div>
        <Section title="職業">
          <Select value={classId} options={(Object.keys(CLASS_LABEL) as ClassId[]).map((c) => ({ value: c, label: CLASS_LABEL[c] }))} onChange={setClassId} />
        </Section>
        <Section title="部件">
          {CATEGORIES.map((c) => {
            const pool = items.filter((x) => x.category === c && (c !== 'weapon' || !x.classId || x.classId === classId));
            if (pool.length === 0) return null;
            return (
              <Field key={c} label={CATEGORY_LABEL[c]}>
                <Select
                  value={chosen[c] ?? ''}
                  options={[{ value: '', label: '（無）' }, ...pool.map((i) => ({ value: i.id, label: i.name === i.id ? i.id : `${i.name}（${i.id}）` }))]}
                  onChange={(v) => setChosen((s) => ({ ...s, [c]: v }))}
                />
              </Field>
            );
          })}
        </Section>
        <Section title="顏色">
          {(['skin', 'hair', 'eye', 'dye'] as const).map((g) => (
            <Field key={g} label={GROUP_LABEL[g]}>
              <Select
                value={colors[g] || (byGroup(g)[0]?.id ?? '')}
                options={byGroup(g).map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => setColors((s) => ({ ...s, [g]: v }))}
              />
            </Field>
          ))}
        </Section>
        {!engineView && <div className="section hint">「工具繪製」用與遊戲相同的擺放與換色計算；「遊戲預覽」用遊戲引擎播放（含光照與押注等級外觀）。</div>}
      </aside>
    </>
  );
}
