import { MonsterDefFile, MonsterMathFileVersioned, contentPaths, parseAsepriteSheet, resolveSheetImage } from '@lawn/shared';
import type { AseSheet, MonsterDef, MonsterMathFile } from '@lawn/shared';
import { create } from 'zustand';
import { isNotFound, readJson } from '../../fs/projectFs';
import type { ProjectFs } from '../../fs/projectFs';
import { createMonsterDef, createMonsterMath } from '../../monster/defaults';
import type { Action } from '../../monster/sheet';
import { batch, docsStore, editDoc, getDoc, putDoc } from '../../state/docs';
import { ensureDoc } from '../../state/project';
import { useStudio } from '../../state/studio';

export interface LoadedSheet {
  sheet: AseSheet;
  image: ImageBitmap | null;
  path: string;
  mtime: number | null;
}

export interface MonsterPageState {
  /** content/monsters/ 中有 sheet 或設定檔的 ID。 */
  ids: string[];
  /** 有 sheet 但還沒有設定檔（新匯出、未登錄）。 */
  unregistered: string[];
  selected: string | null;
  sheets: Record<string, LoadedSheet | { error: string }>;
  fxIds: string[];
  action: Action;
  /** Tag 內第幾幀。 */
  frame: number;
  playing: boolean;
  zoom: number;
  showHitbox: boolean;
  view: 'sprite' | 'preview';
  lighting: boolean;
}

export const useMonsterPage = create<MonsterPageState>(() => ({
  ids: [],
  unregistered: [],
  selected: null,
  sheets: {},
  fxIds: [],
  action: 'idle',
  frame: 0,
  playing: true,
  zoom: 4,
  showHitbox: true,
  view: 'sprite',
  lighting: false,
}));

export const MATH_PATH = contentPaths.monstersMath;
export const monsterPath = (id: string) => contentPaths.monster(id);

const SHEET = /^(mob_\d{4})\.sheet\.json$/;
const SETTING = /^(mob_\d{4})\.json$/;

/** 掃描 content/monsters/ 與 content/fx/，載入設定檔與數值檔。 */
export async function scanMonsters(fs: ProjectFs): Promise<void> {
  const entries = await fs.list('content/monsters');
  const sheetIds = new Set(entries.map((e) => SHEET.exec(e.name)?.[1]).filter((x): x is string => !!x));
  const settingIds = new Set(entries.map((e) => SETTING.exec(e.name)?.[1]).filter((x): x is string => !!x));
  for (const id of settingIds) await ensureDoc(monsterPath(id), (raw) => MonsterDefFile.migrate(raw));
  await ensureDoc(MATH_PATH, (raw) => MonsterMathFileVersioned.migrate(raw));
  // 草稿中新登錄的怪物
  for (const path of Object.keys(docsStore.getState().docs)) {
    const id = /^monsters\/(mob_\d{4})\.json$/.exec(path)?.[1];
    if (id) settingIds.add(id);
  }
  const ids = [...new Set([...sheetIds, ...settingIds])].sort();
  const fxIds = (await fs.list('content/fx'))
    .map((e) => /^(.+)\.sheet\.json$/.exec(e.name)?.[1])
    .filter((x): x is string => !!x)
    .sort();
  const selected = useMonsterPage.getState().selected;
  useMonsterPage.setState({
    ids,
    unregistered: ids.filter((id) => !getDoc(monsterPath(id))),
    fxIds,
    selected: selected && ids.includes(selected) ? selected : (ids[0] ?? null),
  });
}

/** 讀 sheet（依修改時間快取）。 */
export async function loadSheet(fs: ProjectFs, id: string, sheetPath: string): Promise<LoadedSheet> {
  const full = `content/${sheetPath}`;
  const mtime = await fs.lastModified(full);
  const cached = useMonsterPage.getState().sheets[id];
  if (cached && 'sheet' in cached && cached.path === sheetPath && cached.mtime === mtime) return cached;
  try {
    const sheet = parseAsepriteSheet(await readJson(fs, full));
    const image = await fs
      .readFile(`content/${resolveSheetImage(sheetPath, sheet.image)}`)
      .then((b) => createImageBitmap(b))
      .catch(() => null);
    const loaded: LoadedSheet = { sheet, image, path: sheetPath, mtime };
    useMonsterPage.setState((s) => ({ sheets: { ...s.sheets, [id]: loaded } }));
    return loaded;
  } catch (error) {
    const message = isNotFound(error) ? `找不到 ${full}` : error instanceof Error ? error.message : String(error);
    useMonsterPage.setState((s) => ({ sheets: { ...s.sheets, [id]: { error: message } } }));
    throw new Error(message);
  }
}

/** 登錄新怪物：依 sheet 建立預設設定，並在數值檔加一筆。 */
export async function registerMonster(id: string): Promise<void> {
  const fs = useStudio.getState().fs;
  if (!fs) return;
  const { sheet } = await loadSheet(fs, id, contentPaths.monsterSheet(id));
  batch(`登錄 ${id}`, () => {
    putDoc(monsterPath(id), createMonsterDef(id, sheet), `登錄 ${id}`);
    const math = getDoc<MonsterMathFile>(MATH_PATH)?.data;
    if (!math) putDoc<MonsterMathFile>(MATH_PATH, { schemaVersion: 1, monsters: [createMonsterMath(id)] }, '建立數值檔');
    else if (!math.monsters.some((m) => m.id === id))
      editDoc<MonsterMathFile>(MATH_PATH, (f) => ({ ...f!, monsters: [...f!.monsters, createMonsterMath(id)] }), `${id} 數值`);
  });
  await scanMonsters(fs);
}

export function updateMonster(id: string, fn: (d: MonsterDef) => MonsterDef, label: string): void {
  editDoc<MonsterDef>(monsterPath(id), (d) => fn(d!), label);
}
