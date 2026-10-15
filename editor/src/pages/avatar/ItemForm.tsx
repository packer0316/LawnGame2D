import { AVATAR_LAYERS, AVATAR_TAGS, defaultPoseIndex, posesInTag, resolvePoseFrame, viewFrames } from '@lawn/shared';
import type { AseSheet, AvatarItem, AvatarLayer, ClassId } from '@lawn/shared';
import { CATEGORIES, CATEGORY_LABEL, isViewLayer, requiredTags } from '../../avatar/defaults';
import { Checkbox, Field, NumberInput, Section, Select, TextInput } from '../../ui/controls';
import { updateItem, useAvatarPage } from './avatarStore';

const CLASS_LABEL: Record<ClassId, string> = { warrior: '劍士', mage: '法師', archer: '弓箭手', assassin: '刺客' };
const PART_LAYERS = AVATAR_LAYERS.filter((l) => l !== 'body' && l !== 'arm_front');

export function ItemForm({ item, sheet, base }: { item: AvatarItem; sheet: AseSheet | null; base: AseSheet | null }) {
  const set = (fn: (i: AvatarItem) => AvatarItem, label: string) => updateItem(item.id, fn, label);
  const optional = <K extends keyof AvatarItem>(key: K, value: AvatarItem[K] | undefined) => (i: AvatarItem) => {
    const next = { ...i };
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    return next;
  };
  const sheetLayers = new Set(sheet?.layers.filter((l): l is string => !!l).map((l) => l.split('@')[0]) ?? []);
  const views = base ? viewFrames(base) : null;

  return (
    <>
      <Section title="部件登錄">
        <Field label="名稱">
          <TextInput value={item.name} onChange={(name) => set((i) => ({ ...i, name }), '名稱')} />
        </Field>
        <Field label="分類">
          <Select value={item.category} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} onChange={(category) => set((i) => ({ ...i, category }), '分類')} />
        </Field>
        <Field label="類型">
          <Select
            value={item.kind}
            options={[
              { value: 'pose', label: '姿勢部件（跟著身體換姿勢）' },
              { value: 'anchor', label: '錨點部件（正面／背面兩張）' },
            ]}
            onChange={(kind) => set((i) => ({ ...i, kind }), '類型')}
          />
        </Field>
        {item.category === 'weapon' && (
          <Field label="職業限制">
            <Select
              value={item.classId ?? ''}
              options={[{ value: '', label: '（不限）' }, ...(Object.keys(CLASS_LABEL) as ClassId[]).map((c) => ({ value: c, label: CLASS_LABEL[c] }))]}
              onChange={(v) => set(optional('classId', (v || undefined) as ClassId | undefined), '職業限制')}
            />
          </Field>
        )}
        <Field label="換色群組">
          <Select
            value={item.recolor ?? ''}
            options={[
              { value: '', label: '（不換色）' },
              { value: 'hair', label: '髮色' },
              { value: 'eye', label: '瞳色' },
              { value: 'dye', label: '染色' },
            ]}
            onChange={(v) => set(optional('recolor', (v || undefined) as AvatarItem['recolor']), '換色群組')}
          />
        </Field>
        {item.category === 'hat' && (
          <Field label="頭髮">
            <Select
              value={item.hairMode ?? 'full'}
              options={[
                { value: 'full', label: '完整顯示' },
                { value: 'underHat', label: '用戴帽版（@underHat）' },
                { value: 'hidden', label: '隱藏' },
              ]}
              onChange={(v) => set(optional('hairMode', v === 'full' ? undefined : v), '帽子遮蔽頭髮')}
            />
          </Field>
        )}
      </Section>

      <Section title="佔用圖層">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {PART_LAYERS.map((l) => (
            <Checkbox
              key={l}
              label={`${l}${sheetLayers.has(l) ? '' : '（sheet 無）'}`}
              checked={item.layers.includes(l)}
              onChange={(on) =>
                set(
                  (i) => ({ ...i, layers: on ? PART_LAYERS.filter((x) => x === l || i.layers.includes(x)) : i.layers.filter((x) => x !== l) }),
                  '佔用圖層',
                )
              }
            />
          ))}
        </div>
      </Section>

      <Section title="遮蔽其他圖層">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {PART_LAYERS.filter((l) => !item.layers.includes(l)).map((l) => (
            <Checkbox
              key={l}
              label={l}
              checked={item.hidesLayers?.includes(l) ?? false}
              onChange={(on) => {
                const next = on ? [...(item.hidesLayers ?? []), l] : (item.hidesLayers ?? []).filter((x) => x !== l);
                set(optional('hidesLayers', next as AvatarLayer[]), '遮蔽圖層');
              }}
            />
          ))}
        </div>
        {item.category === 'overall' && <div className="hint">套服一律隱藏 bottom。</div>}
      </Section>

      {(item.kind === 'anchor' || item.layers.some(isViewLayer)) && (
        <Section title="錨點對齊">
          <Field label="額外偏移 x, y" title="相對 head 錨點的微調；也可以在畫面上拖曳部件">
            <NumberInput value={item.offset?.x ?? 0} integer onChange={(x) => set(optional('offset', x || item.offset?.y ? { x, y: item.offset?.y ?? 0 } : undefined), '錨點偏移')} />
            <NumberInput value={item.offset?.y ?? 0} integer onChange={(y) => set(optional('offset', y || item.offset?.x ? { x: item.offset?.x ?? 0, y } : undefined), '錨點偏移')} />
          </Field>
          <Field label="正面視角幀" title={`預設 ${views?.front ?? '—'}（stand 第一幀）`}>
            <NumberInput value={item.views?.front ?? views?.front ?? 0} min={0} integer onChange={(front) => set((i) => withView(i, 'front', front === views?.front ? undefined : front), '視角幀')} />
          </Field>
          <Field label="背面視角幀" title={`預設 ${views?.back ?? '—'}（ladder 第一幀）`}>
            <NumberInput value={item.views?.back ?? views?.back ?? 0} min={0} integer onChange={(back) => set((i) => withView(i, 'back', back === views?.back ? undefined : back), '視角幀')} />
          </Field>
          <div className="hint">在畫面上拖曳部件即可調整偏移（畫面會切到「拖曳對齊」模式）。</div>
        </Section>
      )}

      {item.kind === 'pose' && sheet && base && <PoseTable item={item} sheet={sheet} base={base} />}
    </>
  );
}

function withPoseMap(i: AvatarItem, poseMap: Record<string, number[]>): AvatarItem {
  const { poseMap: _old, ...rest } = i;
  return Object.keys(poseMap).length ? { ...rest, poseMap } : rest;
}

function withView(i: AvatarItem, key: 'front' | 'back', value: number | undefined): AvatarItem {
  const views = { ...i.views };
  if (value === undefined) delete views[key];
  else views[key] = value;
  const next = { ...i };
  if (Object.keys(views).length) next.views = views;
  else delete next.views;
  return next;
}

/**
 * 姿勢表（STUDIO_SPEC §4.4、§4.6）：每個身體幀用部件的第幾個姿勢。
 * 預設依時間平均分配；可逐幀改指定。點格子會在畫面上跳到該幀。
 */
function PoseTable({ item, sheet, base }: { item: AvatarItem; sheet: AseSheet; base: AseSheet }) {
  const tagName = useAvatarPage((s) => s.tag);
  const frameInTag = useAvatarPage((s) => s.frame);
  const tag = base.tags.get(tagName);
  const poseLayers = item.layers.filter((l) => !isViewLayer(l));
  const required = requiredTags(item, Object.keys(AVATAR_TAGS)).includes(tagName);
  if (!tag) return null;
  const frames = tag.to - tag.from + 1;
  // 以最多姿勢的圖層為準（同一件衣服的各圖層通常畫在相同的幀）
  const posesByLayer = poseLayers.map((l) => ({ layer: l, poses: posesInTag(sheet, l, tag) }));
  const poseCount = Math.max(0, ...posesByLayer.map((p) => p.poses.length));
  const map = item.poseMap?.[tagName];
  const custom = map !== undefined;

  const setIndex = (i: number, value: number | null) =>
    updateItem(
      item.id,
      (it) => {
        const current = it.poseMap?.[tagName] ?? Array.from({ length: frames }, (_, k) => defaultPoseIndex(k, frames, poseCount));
        const nextMap = current.map((v, k) => (k === i ? (value ?? defaultPoseIndex(k, frames, poseCount)) : v));
        const isDefault = nextMap.every((v, k) => v === defaultPoseIndex(k, frames, poseCount));
        const { [tagName]: _old, ...rest } = it.poseMap ?? {};
        const poseMap: Record<string, number[]> = isDefault ? rest : { ...rest, [tagName]: nextMap };
        return withPoseMap(it, poseMap);
      },
      '姿勢表',
    );

  return (
    <Section
      title={`姿勢表：${tagName}（${frames} 幀、${poseCount} 姿勢，規格 ${AVATAR_TAGS[tagName as keyof typeof AVATAR_TAGS]?.poses ?? '—'}）`}
      actions={custom && <button className="small" onClick={() => updateItem(item.id, (it) => { const { [tagName]: _old, ...poseMap } = it.poseMap ?? {}; return withPoseMap(it, poseMap); }, '姿勢表還原自動')}>全部自動</button>}
    >
      {poseCount === 0 ? (
        <div className="hint" style={{ color: required ? 'var(--error)' : undefined }}>
          {required ? '這個動作沒有畫任何姿勢（規格檢查會擋匯出）。' : '這個部件不需要畫這個動作（武器只畫自己職業的攻擊動作）。'}
        </div>
      ) : (
        <>
          <table className="grid">
            <thead>
              <tr>
                <th>身體幀</th>
                {Array.from({ length: frames }, (_, i) => (
                  <th key={i} style={{ textAlign: 'center', background: i === frameInTag ? '#2d3561' : undefined, cursor: 'pointer' }} onClick={() => useAvatarPage.setState({ frame: i, playing: false })}>
                    {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>姿勢</td>
                {Array.from({ length: frames }, (_, i) => {
                  const auto = defaultPoseIndex(i, frames, poseCount);
                  const value = map?.[i] ?? auto;
                  return (
                    <td key={i} style={{ padding: 1, background: value !== auto ? 'rgba(124,156,255,0.18)' : undefined }}>
                      <select value={value} onChange={(e) => setIndex(i, Number(e.target.value))} onFocus={() => useAvatarPage.setState({ frame: i, playing: false })}>
                        {Array.from({ length: poseCount }, (_, k) => (
                          <option key={k} value={k}>
                            {k}
                            {k === auto ? '*' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
              {posesByLayer.map(({ layer }) => (
                <tr key={layer}>
                  <td className="hint">{layer}</td>
                  {Array.from({ length: frames }, (_, i) => {
                    const f = resolvePoseFrame(sheet, layer, tag, tag.from + i, item.poseMap);
                    return (
                      <td key={i} className="mono hint" style={{ textAlign: 'center' }}>
                        {f === undefined ? '—' : f - tag.from}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 4 }}>* = 自動分配；藍底 = 手動指定。下排是各圖層實際使用的部件幀（Tag 內位置）。逐幀播放檢查有沒有穿幫，對不準就改指定其他姿勢或在 Aseprite 加畫一張。</div>
        </>
      )}
    </Section>
  );
}
