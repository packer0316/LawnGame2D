import { RoomFileVersioned, contentPaths } from '@lawn/shared';
import type { MapDef, RoomDef, RoomFile } from '@lawn/shared';
import { useEffect, useMemo, useState } from 'react';
import { readJson } from '../../fs/projectFs';
import type { ProjectFs } from '../../fs/projectFs';
import { ROOM_COUNT, defaultRoom, mapLineup, parseBetLevels, roomMapId, validateRooms } from '../../rooms/rooms';
import type { RoomContext } from '../../rooms/rooms';
import { docsStore, editDoc, isDirty, useDoc, useDocs } from '../../state/docs';
import { ensureDoc } from '../../state/project';
import { setStatus, useStudio } from '../../state/studio';
import { registerValidator } from '../../state/validation';
import { Checkbox, Field, NumberInput, RangeInput, Section, Select, TextInput } from '../../ui/controls';
import { loadExistingMaps, mapIdsInDocs, mapPath } from '../map/mapStore';
import { monsterPath, scanMonsters, useMonsterPage } from '../monster/monsterStore';
import { registerPage } from '../registry';

const PATH = contentPaths.rooms;

async function loadContext(fs: ProjectFs): Promise<RoomContext> {
  await ensureDoc(PATH, (raw) => RoomFileVersioned.migrate(raw)).catch(() => undefined);
  await loadExistingMaps(fs);
  await scanMonsters(fs);
  const docs = docsStore.getState().docs;
  const maps = new Map(mapIdsInDocs(docs).map((id) => [id, docs[mapPath(id)]!.data as MapDef]));
  const monsters = new Set(useMonsterPage.getState().ids.filter((id) => docs[monsterPath(id)]));
  const bets = await readJson(fs, `content/${contentPaths.betLevels}`).then(parseBetLevels).catch(() => undefined);
  return { maps, monsters, bets };
}

registerValidator('rooms', async ({ fs }) => {
  const ctx = await loadContext(fs);
  return validateRooms(docsStore.getState().docs[PATH]?.data as RoomFile | undefined, ctx);
});

function RoomsPage() {
  const fs = useStudio((s) => s.fs);
  const doc = useDoc<RoomFile>(PATH);
  const file = doc?.data;
  const dirty = useDocs((s) => isDirty(s.docs[PATH]));
  const [ctx, setCtx] = useState<RoomContext | null>(null);
  const [selected, setSelected] = useState(1);
  const focus = useStudio((s) => s.focus);

  useEffect(() => {
    if (fs) void loadContext(fs).then(setCtx);
  }, [fs]);
  useEffect(() => {
    if (focus?.page === 'rooms' && focus.target.startsWith('room:')) setSelected(Number(focus.target.slice(5)));
  }, [focus]);

  const issues = useMemo(() => (ctx ? validateRooms(file, ctx) : []), [file, ctx]);
  const room = file?.rooms.find((r) => r.id === selected);

  const generateAll = (overwrite: boolean) => {
    if (!ctx) return;
    editDoc<RoomFile>(
      PATH,
      (f) => {
        const rooms = new Map((f?.rooms ?? []).map((r) => [r.id, r]));
        for (let id = 1; id <= ROOM_COUNT; id++) {
          const map = ctx.maps.get(roomMapId(id));
          if (!map) continue;
          if (overwrite || !rooms.has(id)) rooms.set(id, defaultRoom(id, map, ctx.bets));
        }
        return { schemaVersion: 1, rooms: [...rooms.values()].sort((a, b) => a.id - b.id) };
      },
      overwrite ? '從地圖重新產生房間表' : '從地圖補齊房間',
    );
  };

  const update = (fn: (r: RoomDef) => RoomDef, label: string) =>
    editDoc<RoomFile>(PATH, (f) => ({ ...f!, rooms: f!.rooms.map((r) => (r.id === selected ? fn(r) : r)) }), label);

  const roomIssues = (id: number) => issues.filter((i) => i.target === `room:${id}`);

  return (
    <div className="page">
      <aside className="tree">
        <div className="panel-title">
          房間 <span className={dirty ? 'dirty' : ''} />
          <span className="spacer" />
          <button className="small" disabled={!ctx || ctx.maps.size === 0} onClick={() => generateAll(false)} title="為有地圖但還沒設定的房間產生預設值">
            從地圖補齊
          </button>
        </div>
        {Array.from({ length: ROOM_COUNT }, (_, i) => i + 1).map((id) => {
          const r = file?.rooms.find((x) => x.id === id);
          const errs = roomIssues(id).filter((x) => x.severity === 'error').length;
          return (
            <div key={id} className={`tree-item ${selected === id ? 'selected' : ''}`} onClick={() => setSelected(id)}>
              <span className="mono" style={{ width: 22 }}>{String(id).padStart(2, '0')}</span>
              <span style={{ color: r ? undefined : 'var(--muted)' }}>{r?.name ?? '（未設定）'}</span>
              <span className="meta">{errs > 0 ? <span className="badge error">{errs}</span> : r ? `${r.betRange[0]}–${r.betRange[1]}` : ''}</span>
            </div>
          );
        })}
      </aside>

      <section className="canvas" style={{ overflow: 'auto' }}>
        <div style={{ padding: 12 }}>
          {!file ? (
            <div className="hint">
              還沒有房間表。
              <button className="primary" style={{ marginLeft: 8 }} disabled={!ctx || ctx.maps.size === 0} onClick={() => generateAll(true)}>
                從地圖產生 {ctx?.maps.size ?? 0} 房
              </button>
            </div>
          ) : (
            <RoomTable file={file} selected={selected} onSelect={setSelected} />
          )}
        </div>
      </section>

      <aside className="props">
        <div className="panel-title">房間 {selected}</div>
        {roomIssues(selected).length > 0 && (
          <Section title="問題">
            {roomIssues(selected).map((i, n) => (
              <div key={n} className="hint" style={{ color: i.severity === 'error' ? 'var(--error)' : 'var(--warn)' }}>
                {i.message}
              </div>
            ))}
          </Section>
        )}
        {!room ? (
          <Section title="尚未設定">
            <button
              className="primary"
              onClick={() =>
                editDoc<RoomFile>(
                  PATH,
                  (f) => ({
                    schemaVersion: 1,
                    rooms: [...(f?.rooms ?? []), defaultRoom(selected, ctx?.maps.get(roomMapId(selected)), ctx?.bets)].sort((a, b) => a.id - b.id),
                  }),
                  `新增房間 ${selected}`,
                )
              }
            >
              新增房間 {selected}
            </button>
          </Section>
        ) : (
          ctx && <RoomForm room={room} ctx={ctx} update={update} />
        )}
      </aside>

      <div className="bottom">
        <span className="hint">
          {issues.filter((i) => i.severity === 'error').length} 個錯誤、{issues.filter((i) => i.severity === 'warning').length} 個警告
        </span>
        <span style={{ flex: 1 }} />
        {file && (
          <button
            title="用地圖的設定覆蓋全部房間（可用 Ctrl+Z 復原）"
            onClick={() => {
              generateAll(true);
              setStatus('已從地圖重新產生全部房間（Ctrl+Z 可復原）', 'ok');
            }}
          >
            從地圖重新產生全部
          </button>
        )}
      </div>
    </div>
  );
}

function RoomTable({ file, selected, onSelect }: { file: RoomFile; selected: number; onSelect: (id: number) => void }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>#</th>
          <th>名稱</th>
          <th>地圖</th>
          <th>押注</th>
          <th>怪物組成</th>
          <th>Boss</th>
          <th>怪潮</th>
          <th>BGM</th>
        </tr>
      </thead>
      <tbody>
        {file.rooms.map((r) => (
          <tr key={r.id} className={r.id === selected ? 'selected' : ''} onClick={() => onSelect(r.id)} style={{ cursor: 'pointer' }}>
            <td className="mono">{r.id}</td>
            <td>{r.name}</td>
            <td className="mono">{r.mapId}</td>
            <td className="mono">
              {r.betRange[0]}–{r.betRange[1]}
            </td>
            <td className="mono">{(r.lineup ?? []).map((m) => m.replace('mob_', '')).join(' ')}</td>
            <td className="mono">{r.boss ? `${r.boss.mobId.replace('mob_', '')} / ${r.boss.intervalSec}s` : '—'}</td>
            <td className="mono">{r.wave ? `${r.wave.everySec[0]}–${r.wave.everySec[1]}s ×${r.wave.durationSec}s` : '—'}</td>
            <td className="mono">{r.bgm ?? '（地圖）'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RoomForm({ room, ctx, update }: { room: RoomDef; ctx: RoomContext; update: (fn: (r: RoomDef) => RoomDef, label: string) => void }) {
  const mobs = [...ctx.monsters].sort();
  const map = ctx.maps.get(room.mapId);
  const betOptions = ctx.bets;
  const BetInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) =>
    betOptions?.length ? (
      <Select value={String(value)} options={[...new Set([...betOptions, value])].sort((a, b) => a - b).map(String)} onChange={(v) => onChange(Number(v))} />
    ) : (
      <NumberInput value={value} min={0.01} step={1} onChange={onChange} />
    );

  return (
    <>
      <Section title="基本">
        <Field label="名稱">
          <TextInput value={room.name} onChange={(name) => update((r) => ({ ...r, name }), '房間名稱')} />
        </Field>
        <Field label="地圖">
          <Select value={room.mapId} options={[...new Set([...ctx.maps.keys(), room.mapId])].sort()} onChange={(mapId) => update((r) => ({ ...r, mapId }), '地圖')} />
        </Field>
        <Field label="押注範圍">
          <BetInput value={room.betRange[0]} onChange={(v) => update((r) => ({ ...r, betRange: [v, Math.max(v, r.betRange[1])] }), '押注範圍')} />
          <span className="hint">–</span>
          <BetInput value={room.betRange[1]} onChange={(v) => update((r) => ({ ...r, betRange: [Math.min(v, r.betRange[0]), v] }), '押注範圍')} />
        </Field>
        <Field label="BGM 覆寫">
          <TextInput
            mono
            value={room.bgm ?? ''}
            placeholder={map?.bgm ? `（地圖：${map.bgm}）` : '（地圖）'}
            onChange={(bgm) =>
              update((r) => {
                const { bgm: _b, ...rest } = r;
                return bgm ? { ...rest, bgm } : rest;
              }, 'BGM')
            }
          />
        </Field>
      </Section>

      <Section
        title="怪物組成（換房列表的圖示）"
        actions={map && <button className="small" onClick={() => update((r) => ({ ...r, lineup: mapLineup(map) }), '怪物組成')}>從地圖帶入</button>}
      >
        <MobList
          value={room.lineup ?? []}
          options={mobs}
          onChange={(lineup) =>
            update((r) => {
              const { lineup: _l, ...rest } = r;
              return lineup.length ? { ...rest, lineup } : rest;
            }, '怪物組成')
          }
        />
        <div className="hint">實際生怪依地圖的生怪區（LDtk SpawnZone）。</div>
      </Section>

      <Section title="Boss">
        <Field label="啟用">
          <Checkbox
            checked={room.boss !== undefined}
            onChange={(on) =>
              update((r) => {
                const { boss: _b, ...rest } = r;
                return on ? { ...rest, boss: { mobId: map?.boss?.mobId ?? mobs[0] ?? 'mob_0001', intervalSec: map?.boss?.intervalSec ?? 300 } } : rest;
              }, 'Boss')
            }
            label={map?.boss ? `地圖有 BossSpawn（${map.boss.mobId}）` : '地圖沒有 BossSpawn'}
          />
        </Field>
        {room.boss && (
          <>
            <Field label="怪物">
              <Select value={room.boss.mobId} options={[...new Set([...mobs, room.boss.mobId])]} onChange={(mobId) => update((r) => ({ ...r, boss: { ...r.boss!, mobId } }), 'Boss')} />
            </Field>
            <Field label="出現間隔（秒）">
              <NumberInput value={room.boss.intervalSec} min={1} onChange={(intervalSec) => update((r) => ({ ...r, boss: { ...r.boss!, intervalSec } }), 'Boss 間隔')} />
            </Field>
          </>
        )}
      </Section>

      <Section title="怪潮">
        <Field label="啟用">
          <Checkbox
            checked={room.wave !== undefined}
            onChange={(on) =>
              update((r) => {
                const { wave: _w, ...rest } = r;
                return on
                  ? { ...rest, wave: { everySec: [300, 480], durationSec: 40, pool: (r.lineup ?? mobs).slice(0, 2).map((mobId) => ({ mobId, weight: 1 })), maxMonsters: 150 } }
                  : rest;
              }, '怪潮')
            }
            label={map ? `地圖有 ${map.waveEntries.length} 個湧入點` : ''}
          />
        </Field>
        {room.wave && (
          <>
            <Field label="間隔（秒）">
              <RangeInput value={room.wave.everySec} min={1} onChange={(everySec) => update((r) => ({ ...r, wave: { ...r.wave!, everySec } }), '怪潮間隔')} />
            </Field>
            <Field label="持續（秒）">
              <NumberInput value={room.wave.durationSec} min={1} onChange={(durationSec) => update((r) => ({ ...r, wave: { ...r.wave!, durationSec } }), '怪潮持續')} />
            </Field>
            <Field label="怪物上限">
              <NumberInput value={room.wave.maxMonsters} min={1} integer onChange={(maxMonsters) => update((r) => ({ ...r, wave: { ...r.wave!, maxMonsters } }), '怪潮上限')} />
            </Field>
            <div className="hint" style={{ margin: '6px 0 2px' }}>怪物池（權重）</div>
            {room.wave.pool.map((p, i) => (
              <Field key={i} label={`#${i + 1}`}>
                <Select
                  value={p.mobId}
                  options={[...new Set([...mobs, p.mobId])]}
                  onChange={(mobId) => update((r) => ({ ...r, wave: { ...r.wave!, pool: r.wave!.pool.map((x, j) => (j === i ? { ...x, mobId } : x)) } }), '怪潮怪物')}
                />
                <NumberInput
                  value={p.weight}
                  min={0.01}
                  width={60}
                  onChange={(weight) => update((r) => ({ ...r, wave: { ...r.wave!, pool: r.wave!.pool.map((x, j) => (j === i ? { ...x, weight } : x)) } }), '怪潮權重')}
                />
                <button
                  className="small"
                  disabled={room.wave!.pool.length <= 1}
                  onClick={() => update((r) => ({ ...r, wave: { ...r.wave!, pool: r.wave!.pool.filter((_, j) => j !== i) } }), '刪除怪潮怪物')}
                >
                  ✕
                </button>
              </Field>
            ))}
            <button
              className="small"
              onClick={() => update((r) => ({ ...r, wave: { ...r.wave!, pool: [...r.wave!.pool, { mobId: mobs[0] ?? 'mob_0001', weight: 1 }] } }), '新增怪潮怪物')}
            >
              ＋ 怪物
            </button>
          </>
        )}
      </Section>
    </>
  );
}

function MobList({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const rest = options.filter((o) => !value.includes(o));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {value.map((m, i) => (
        <span key={m} className="badge" style={{ display: 'inline-flex', gap: 4, padding: '2px 6px' }}>
          <span className="mono">{m}</span>
          <span style={{ cursor: 'pointer' }} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ✕
          </span>
        </span>
      ))}
      {rest.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">＋ 加入…</option>
          {rest.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

registerPage({ id: 'rooms', title: '房間表', component: RoomsPage });
