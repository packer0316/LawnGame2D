import type { AseSheet, MonsterDef, MonsterMath, MonsterMathFile } from '@lawn/shared';
import { useMemo } from 'react';
import { TIER_RULES } from '../../monster/defaults';
import { ACTIONS, hitboxFromSlice, labelFromSlice, tagDurationMs } from '../../monster/sheet';
import type { Action } from '../../monster/sheet';
import { validateMonster } from '../../monster/validate';
import { editDoc, useDoc } from '../../state/docs';
import { Checkbox, ColorInput, Field, NumberInput, RangeInput, Section, Select, TextInput } from '../../ui/controls';
import { MATH_PATH, updateMonster, useMonsterPage } from './monsterStore';

const ACTION_LABEL: Record<Action, string> = { move: '移動', idle: '待機', hit: '受擊', die: '死亡', appear: '登場（選配）' };
const TIER_LABEL = { normal: '一般', elite: '菁英', special: '特殊', boss: 'Boss' } as const;
const FEATURES = ['', 'bomb', 'chain', 'drill', 'chest', 'wheel'] as const;

export function MonsterProps({ def, sheet }: { def: MonsterDef; sheet: AseSheet | null }) {
  const id = def.id;
  const set = (fn: (d: MonsterDef) => MonsterDef, label: string) => updateMonster(id, fn, label);
  const mathFile = useDoc<MonsterMathFile>(MATH_PATH)?.data;
  const math = mathFile?.monsters.find((m) => m.id === def.mathId);
  const fxIds = useMonsterPage((s) => s.fxIds);
  const action = useMonsterPage((s) => s.action);
  const issues = useMemo(() => validateMonster(def, sheet, mathFile), [def, sheet, mathFile]);
  const tagNames = sheet ? [...sheet.tags.keys()] : [];

  const setMath = (fn: (m: MonsterMath) => MonsterMath, label: string) =>
    editDoc<MonsterMathFile>(MATH_PATH, (f) => ({ ...f!, monsters: f!.monsters.map((m) => (m.id === def.mathId ? fn(m) : m)) }), label);

  const tag = sheet?.tags.get(def.tags[action] ?? '');
  const durations = def.frameDurations ?? {};

  return (
    <>
      <div className="panel-title">怪物 {id}</div>
      {issues.length > 0 && (
        <Section title={`問題（${issues.length}）`}>
          {issues.map((i, n) => (
            <div key={n} className="hint" style={{ color: i.severity === 'error' ? 'var(--error)' : 'var(--warn)' }}>
              {i.message.replace(`${id}：`, '')}
            </div>
          ))}
        </Section>
      )}
      <Section title="基本">
        <Field label="名稱">
          <TextInput value={def.name} onChange={(name) => set((d) => ({ ...d, name }), '名稱')} />
        </Field>
        <Field label="sheet">
          <span className="mono hint">{def.sheet}</span>
        </Field>
      </Section>

      <Section title="動作（Tag 對應）">
        {(['move', 'idle', 'hit', 'die', 'appear'] as const).map((a) => (
          <Field key={a} label={ACTION_LABEL[a]}>
            <Select
              value={def.tags[a] ?? ''}
              options={[{ value: '', label: a === 'appear' ? '（無）' : '（未對應）' }, ...tagNames.map((n) => ({ value: n, label: n }))]}
              onChange={(v) =>
                set((d) => {
                  const tags = { ...d.tags };
                  if (a === 'appear') {
                    if (v) tags.appear = v;
                    else delete tags.appear;
                  } else tags[a] = v;
                  return { ...d, tags };
                }, '動作對應')
              }
            />
          </Field>
        ))}
        {!ACTIONS.every((a) => def.tags[a]) && <div className="hint" style={{ color: 'var(--error)' }}>四個必備動作都要對應，否則不能匯出。</div>}
      </Section>

      {sheet && tag && (
        <Section
          title={`幀時間：${ACTION_LABEL[action]}（${tagDurationMs(sheet, tag, durations)}ms）`}
          actions={
            Object.keys(durations).some((k) => Number(k) >= tag.from && Number(k) <= tag.to) && (
              <button
                className="small"
                onClick={() =>
                  set((d) => {
                    const next = Object.fromEntries(Object.entries(d.frameDurations ?? {}).filter(([k]) => Number(k) < tag.from || Number(k) > tag.to));
                    const { frameDurations: _old, ...rest } = d;
                    return Object.keys(next).length ? { ...rest, frameDurations: next } : rest;
                  }, '重設幀時間')
                }
              >
                用 Aseprite 的設定
              </button>
            )
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {Array.from({ length: tag.to - tag.from + 1 }, (_, i) => {
              const f = tag.from + i;
              const base = sheet.frame(null, f)?.durationMs ?? 100;
              const v = durations[String(f)] ?? base;
              return (
                <label key={f} className="hint" style={{ display: 'grid', gap: 2 }}>
                  <span style={{ color: durations[String(f)] !== undefined ? 'var(--accent)' : undefined }}>#{i}</span>
                  <NumberInput
                    value={v}
                    min={1}
                    integer
                    onChange={(ms) =>
                      set((d) => {
                        const next = { ...d.frameDurations };
                        if (ms === base) delete next[String(f)];
                        else next[String(f)] = ms;
                        const { frameDurations: _old, ...rest } = d;
                        return Object.keys(next).length ? { ...rest, frameDurations: next } : rest;
                      }, '幀時間')
                    }
                  />
                </label>
              );
            })}
          </div>
        </Section>
      )}

      <Section
        title="判定"
        actions={
          sheet && (hitboxFromSlice(sheet) || labelFromSlice(sheet)) ? (
            <button
              className="small"
              title="重新讀取 Aseprite 的 Slice hitbox／label"
              onClick={() =>
                set((d) => ({ ...d, hitbox: hitboxFromSlice(sheet) ?? d.hitbox, labelOffset: labelFromSlice(sheet) ?? d.labelOffset }), '從 Slice 讀取判定')
              }
            >
              從 Slice 讀取
            </button>
          ) : undefined
        }
      >
        <Field label="判定框 x, y">
          <NumberInput value={def.hitbox.x} integer onChange={(x) => set((d) => ({ ...d, hitbox: { ...d.hitbox, x } }), '判定框')} />
          <NumberInput value={def.hitbox.y} integer onChange={(y) => set((d) => ({ ...d, hitbox: { ...d.hitbox, y } }), '判定框')} />
        </Field>
        <Field label="判定框 w, h">
          <NumberInput value={def.hitbox.w} min={1} integer onChange={(w) => set((d) => ({ ...d, hitbox: { ...d.hitbox, w } }), '判定框')} />
          <NumberInput value={def.hitbox.h} min={1} integer onChange={(h) => set((d) => ({ ...d, hitbox: { ...d.hitbox, h } }), '判定框')} />
        </Field>
        <Field label="標籤 x, y">
          <NumberInput value={def.labelOffset.x} integer onChange={(x) => set((d) => ({ ...d, labelOffset: { ...d.labelOffset, x } }), '標籤位置')} />
          <NumberInput value={def.labelOffset.y} integer onChange={(y) => set((d) => ({ ...d, labelOffset: { ...d.labelOffset, y } }), '標籤位置')} />
        </Field>
        <div className="hint">座標相對腳底原點。也可以在畫面上直接拖曳判定框與黃點。</div>
      </Section>

      <Section title="行為">
        <Field label="移動類型">
          <Select
            value={def.behavior.move}
            options={[
              { value: 'ground', label: '地面巡邏' },
              { value: 'fly', label: '飛行' },
              { value: 'static', label: '靜止' },
            ]}
            onChange={(move) => set((d) => ({ ...d, behavior: { ...d.behavior, move } }), '移動類型')}
          />
        </Field>
        <Field label="速度（px/s）">
          <NumberInput value={def.behavior.speed} min={0} onChange={(speed) => set((d) => ({ ...d, behavior: { ...d.behavior, speed } }), '速度')} />
        </Field>
        <Field label="待機秒數">
          <RangeInput value={def.behavior.idleSec} min={0} step={0.5} onChange={(idleSec) => set((d) => ({ ...d, behavior: { ...d.behavior, idleSec } }), '待機秒數')} />
        </Field>
        <Field label="移動秒數">
          <RangeInput value={def.behavior.moveSec} min={0} step={0.5} onChange={(moveSec) => set((d) => ({ ...d, behavior: { ...d.behavior, moveSec } }), '移動秒數')} />
        </Field>
        <Field label="擊退（px）">
          <NumberInput value={def.behavior.knockback} min={0} onChange={(knockback) => set((d) => ({ ...d, behavior: { ...d.behavior, knockback } }), '擊退')} />
        </Field>
        <Field label="死亡淡出（秒）" title="不填時遊戲預設 0.4 秒">
          <NumberInput
            value={def.behavior.dieFadeSec ?? 0.4}
            min={0}
            step={0.1}
            onChange={(dieFadeSec) => set((d) => ({ ...d, behavior: { ...d.behavior, dieFadeSec } }), '死亡淡出')}
          />
        </Field>
      </Section>

      <Section title="演出">
        <Field label="受擊特效">
          <Select value={def.fx.hit ?? ''} options={['', ...fxIds]} onChange={(hit) => set((d) => ({ ...d, fx: withOptional(d.fx, 'hit', hit) }), '受擊特效')} />
        </Field>
        <Field label="死亡特效">
          <Select value={def.fx.die ?? ''} options={['', ...fxIds]} onChange={(die) => set((d) => ({ ...d, fx: withOptional(d.fx, 'die', die) }), '死亡特效')} />
        </Field>
        <Field label="受擊音效">
          <TextInput mono value={def.fx.sfxHit ?? ''} placeholder="（無）" onChange={(v) => set((d) => ({ ...d, fx: withOptional(d.fx, 'sfxHit', v) }), '受擊音效')} />
        </Field>
        <Field label="死亡音效">
          <TextInput mono value={def.fx.sfxDie ?? ''} placeholder="（無）" onChange={(v) => set((d) => ({ ...d, fx: withOptional(d.fx, 'sfxDie', v) }), '死亡音效')} />
        </Field>
        <Field label="噴金幣：第幾幀" title="die 動畫的第幾幀（從 0 起）">
          <NumberInput value={def.fx.coinFrame} min={0} integer onChange={(coinFrame) => set((d) => ({ ...d, fx: { ...d.fx, coinFrame } }), '噴金幣')} />
        </Field>
        <Field label="噴金幣：數量">
          <NumberInput value={def.fx.coinCount} min={0} integer onChange={(coinCount) => set((d) => ({ ...d, fx: { ...d.fx, coinCount } }), '噴金幣')} />
        </Field>
        <Field label="血條">
          <Checkbox checked={def.showHpBar} onChange={(showHpBar) => set((d) => ({ ...d, showHpBar }), '血條')} label="顯示（菁英／Boss）" />
        </Field>
        <Field label="光源">
          <Checkbox
            checked={def.fx.light !== undefined}
            onChange={(on) =>
              set((d) => {
                const { light: _l, ...fx } = d.fx;
                return { ...d, fx: on ? { ...fx, light: { color: '#ffe27a', radius: 48 } } : fx };
              }, '光源')
            }
            label="帶光源"
          />
        </Field>
        {def.fx.light && (
          <>
            <Field label="光源顏色">
              <ColorInput value={def.fx.light.color} onChange={(color) => set((d) => ({ ...d, fx: { ...d.fx, light: { ...d.fx.light!, color } } }), '光源顏色')} />
            </Field>
            <Field label="光源半徑">
              <NumberInput value={def.fx.light.radius} min={1} onChange={(radius) => set((d) => ({ ...d, fx: { ...d.fx, light: { ...d.fx.light!, radius } } }), '光源半徑')} />
            </Field>
          </>
        )}
      </Section>

      <Section title="數值（正式版只放伺服器）">
        {!math ? (
          <div className="hint" style={{ color: 'var(--error)' }}>
            數值檔沒有 {def.mathId}。
            <button
              className="small"
              onClick={() =>
                editDoc<MonsterMathFile>(
                  MATH_PATH,
                  (f) => ({ schemaVersion: 1, monsters: [...(f?.monsters ?? []), { id: def.mathId, tier: 'normal', multiplier: 2 }] }),
                  '新增數值',
                )
              }
            >
              新增
            </button>
          </div>
        ) : (
          <>
            <Field label="等級">
              <Select
                value={math.tier}
                options={(Object.keys(TIER_LABEL) as (keyof typeof TIER_LABEL)[]).map((t) => ({ value: t, label: `${TIER_LABEL[t]}（${TIER_RULES[t].multiplier.join('–')}×）` }))}
                onChange={(tier) => setMath((m) => ({ ...m, tier }), '等級')}
              />
            </Field>
            <Field label="倍率">
              <Select
                value={typeof math.multiplier === 'number' ? 'fixed' : 'range'}
                options={[
                  { value: 'fixed', label: '固定' },
                  { value: 'range', label: '區間' },
                ]}
                onChange={(mode) =>
                  setMath((m) => {
                    const lo = typeof m.multiplier === 'number' ? m.multiplier : m.multiplier[0];
                    return { ...m, multiplier: mode === 'fixed' ? lo : [lo, lo * 2] };
                  }, '倍率')
                }
              />
            </Field>
            <Field label="">
              {typeof math.multiplier === 'number' ? (
                <NumberInput value={math.multiplier} min={2} onChange={(v) => setMath((m) => ({ ...m, multiplier: v }), '倍率')} />
              ) : (
                <RangeInput value={math.multiplier} min={2} onChange={(v) => setMath((m) => ({ ...m, multiplier: v }), '倍率')} />
              )}
              <span className="hint">×</span>
            </Field>
            <Field label="特殊玩法">
              <Select
                value={math.feature ?? ''}
                options={FEATURES.map((f) => ({ value: f, label: f || '（無）' }))}
                onChange={(feature) =>
                  setMath((m) => {
                    const { feature: _f, ...rest } = m;
                    return feature ? { ...rest, feature } : rest;
                  }, '特殊玩法')
                }
              />
            </Field>
          </>
        )}
      </Section>
    </>
  );
}

function withOptional<T extends object, K extends keyof T>(obj: T, key: K, value: string): T {
  const next = { ...obj };
  if (value) (next as Record<K, unknown>)[key] = value;
  else delete next[key];
  return next;
}
