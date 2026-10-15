import { AVATAR_TAGS, defaultPoseIndex, posesInTag, resolvePoseFrame } from '@lawn/shared';
import type { AseSheet, AvatarItem, ClassId } from '@lawn/shared';
import { CLASSES, CLASS_LABEL, WEAPON_LAYERS, requiredTags } from '../../avatar/defaults';
import { Checkbox, Field, NumberInput, Section, Select, TextInput } from '../../ui/controls';
import { updateItem, useAvatarPage } from './avatarStore';

export function ItemForm({ item, sheet, base }: { item: AvatarItem; sheet: AseSheet | null; base: AseSheet | null }) {
  const set = (fn: (i: AvatarItem) => AvatarItem, label: string) => updateItem(item.id, fn, label);
  const sheetLayers = new Set(sheet?.layers.filter((l): l is string => !!l) ?? []);
  const setOffset = (x: number, y: number) =>
    set((i) => {
      const { offset: _o, ...rest } = i;
      return x || y ? { ...rest, offset: { x, y } } : rest;
    }, '武器偏移');

  return (
    <>
      <Section title="武器登錄">
        <Field label="名稱">
          <TextInput value={item.name} onChange={(name) => set((i) => ({ ...i, name }), '名稱')} />
        </Field>
        <Field label="職業">
          <Select
            value={item.classId ?? ''}
            options={[{ value: '', label: '（未設定）' }, ...CLASSES.map((c) => ({ value: c, label: CLASS_LABEL[c] }))]}
            onChange={(v) =>
              set((i) => {
                const { classId: _c, ...rest } = i;
                return v ? { ...rest, classId: v as ClassId } : rest;
              }, '職業')
            }
          />
        </Field>
        <Field label="圖層">
          {WEAPON_LAYERS.map((l) => (
            <Checkbox
              key={l}
              label={`${l}${sheetLayers.has(l) ? '' : '（sheet 無）'}`}
              checked={item.layers.includes(l)}
              onChange={(on) => set((i) => ({ ...i, layers: on ? WEAPON_LAYERS.filter((x) => x === l || i.layers.includes(x)) : i.layers.filter((x) => x !== l) }), '圖層')}
            />
          ))}
        </Field>
        <Field label="偏移 x, y" title="額外偏移：weapon 跟著 hand、weapon_back 跟著 torso；也可以在畫面上拖曳">
          <NumberInput value={item.offset?.x ?? 0} integer onChange={(x) => setOffset(x, item.offset?.y ?? 0)} />
          <NumberInput value={item.offset?.y ?? 0} integer onChange={(y) => setOffset(item.offset?.x ?? 0, y)} />
        </Field>
      </Section>
      {sheet && base && <PoseTable item={item} sheet={sheet} base={base} />}
    </>
  );
}

function withPoseMap(i: AvatarItem, poseMap: Record<string, number[]>): AvatarItem {
  const { poseMap: _old, ...rest } = i;
  return Object.keys(poseMap).length ? { ...rest, poseMap } : rest;
}

/**
 * 姿勢表（STUDIO_SPEC §4.4）：角色每一幀用武器的第幾個姿勢。
 * 預設依時間平均分配；可逐幀改指定。點格子會在畫面上跳到該幀。
 */
function PoseTable({ item, sheet, base }: { item: AvatarItem; sheet: AseSheet; base: AseSheet }) {
  const tagName = useAvatarPage((s) => s.tag);
  const frameInTag = useAvatarPage((s) => s.frame);
  const tag = base.tags.get(tagName);
  const required = requiredTags(item, Object.keys(AVATAR_TAGS)).includes(tagName);
  if (!tag) return null;
  const frames = tag.to - tag.from + 1;
  const layers = item.layers.filter((l) => WEAPON_LAYERS.includes(l));
  const poseCount = Math.max(0, ...layers.map((l) => posesInTag(sheet, l, tag).length));
  const map = item.poseMap?.[tagName];

  const setIndex = (i: number, value: number) =>
    updateItem(
      item.id,
      (it) => {
        const current = it.poseMap?.[tagName] ?? Array.from({ length: frames }, (_, k) => defaultPoseIndex(k, frames, poseCount));
        const nextMap = current.map((v, k) => (k === i ? value : v));
        const isDefault = nextMap.every((v, k) => v === defaultPoseIndex(k, frames, poseCount));
        const { [tagName]: _old, ...rest } = it.poseMap ?? {};
        return withPoseMap(it, isDefault ? rest : { ...rest, [tagName]: nextMap });
      },
      '姿勢表',
    );

  return (
    <Section
      title={`姿勢表：${tagName}（${frames} 幀、${poseCount} 姿勢，規格 ${AVATAR_TAGS[tagName as keyof typeof AVATAR_TAGS]?.poses ?? '—'}）`}
      actions={
        map && (
          <button
            className="small"
            onClick={() =>
              updateItem(
                item.id,
                (it) => {
                  const { [tagName]: _old, ...poseMap } = it.poseMap ?? {};
                  return withPoseMap(it, poseMap);
                },
                '姿勢表還原自動',
              )
            }
          >
            全部自動
          </button>
        )
      }
    >
      {poseCount === 0 ? (
        <div className="hint" style={{ color: required ? 'var(--error)' : undefined }}>
          {required ? '這個動作沒有畫任何姿勢（規格檢查會擋匯出）。' : '這把武器不需要畫這個動作（爬繩梯時收起，或是其他職業的攻擊）。'}
        </div>
      ) : (
        <>
          <table className="grid">
            <thead>
              <tr>
                <th>角色幀</th>
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
              {layers.map((layer) => (
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
          <div className="hint" style={{ marginTop: 4 }}>
            * = 自動分配；藍底 = 手動指定。下排是各圖層實際使用的武器幀（Tag 內位置）。逐幀播放檢查有沒有穿幫，對不準就改指定其他姿勢或在 Aseprite 加畫一張。
          </div>
        </>
      )}
    </Section>
  );
}
