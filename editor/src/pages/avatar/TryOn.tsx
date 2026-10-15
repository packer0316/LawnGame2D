import type { AvatarPreviewHandle } from '@lawn/engine';
import type { AvatarItem, AvatarTag, ClassId } from '@lawn/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, CLASS_LABEL } from '../../avatar/defaults';
import { useDocsShallow } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { Field, Section, Select } from '../../ui/controls';
import { EngineView } from '../../ui/EngineView';
import { AvatarCanvas } from './AvatarCanvas';
import { itemPath, useAvatarPage } from './avatarStore';
import { useParts, useRenderer } from './useAvatarData';
import type { useBase } from './useAvatarData';

/** 試穿（STUDIO_SPEC §4.5）：選職業、武器、動作；逐幀播放；截圖。 */
export function TryOn({ base, frame }: { base: ReturnType<typeof useBase>['base']; frame: number }) {
  const ids = useAvatarPage((s) => s.ids);
  const zoom = useAvatarPage((s) => s.zoom);
  const tag = useAvatarPage((s) => s.tag);
  const weapons = useDocsShallow((s) =>
    ids.map((x) => s.docs[itemPath(x)]?.data as AvatarItem | undefined).filter((x): x is AvatarItem => !!x && x.category === 'weapon'),
  );
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [weaponId, setWeaponId] = useState('');
  const [engineView, setEngineView] = useState(false);
  const [handle, setHandle] = useState<AvatarPreviewHandle | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const content = useStudio((s) => s.content);

  const pool = weapons.filter((w) => w.classId === classId);
  // 換職業時自動選該職業第一把武器
  useEffect(() => {
    if (!pool.some((w) => w.id === weaponId)) setWeaponId(pool[0]?.id ?? '');
  }, [pool, weaponId]);

  const partIds = useMemo(() => (weaponId ? [weaponId] : []), [weaponId]);
  const { parts } = useParts(partIds);
  const renderer = useRenderer(base, parts);
  const weapon = weaponId || undefined;
  useEffect(() => handle?.update({ weapon, classId, tag: tag as AvatarTag, zoom }), [handle, weapon, classId, tag, zoom]);

  const screenshot = () => {
    const canvas = host.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `tryon-${classId}-${weaponId || 'none'}-${tag}.png`;
    a.click();
  };

  return (
    <>
      <section className="canvas" ref={host}>
        {engineView && content ? (
          <EngineView<AvatarPreviewHandle>
            deps={[content]}
            onHandle={setHandle}
            mount={(engine, parent) => engine.createAvatarPreview(parent, { content, ...(weapon ? { weapon } : {}), classId, tag: tag as AvatarTag, zoom })}
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
          <div className="group">
            <button className="small" onClick={screenshot}>
              截圖
            </button>
          </div>
        </div>
      </section>
      <aside className="props">
        <div className="panel-title">試穿</div>
        <Section title="職業與武器">
          <Field label="職業">
            <Select value={classId} options={CLASSES.map((c) => ({ value: c, label: `${CLASS_LABEL[c]}（${weapons.filter((w) => w.classId === c).length} 把）` }))} onChange={setClassId} />
          </Field>
          <Field label="武器">
            <Select
              value={weaponId}
              options={[{ value: '', label: '（空手）' }, ...pool.map((w) => ({ value: w.id, label: w.name === w.id ? w.id : `${w.name}（${w.id}）` }))]}
              onChange={setWeaponId}
            />
          </Field>
        </Section>
        <div className="section hint">
          角色四職業共用、外觀固定（STUDIO_SPEC §4）。「工具繪製」用與遊戲相同的擺放計算；「遊戲預覽」用遊戲引擎播放。
        </div>
      </aside>
    </>
  );
}
