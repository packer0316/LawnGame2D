import { MapDefFile, buildNavGraph, contentPaths } from '@lawn/shared';
import type { MapDef, NavEdgeType } from '@lawn/shared';
import { create } from 'zustand';
import { dirname, joinPath, readJson } from '../../fs/projectFs';
import type { ProjectFs } from '../../fs/projectFs';
import { convertLdtkProject, loadExternalLevels } from '../../ldtk/convert';
import type { ConvertIssue } from '../../ldtk/convert';
import type { LdtkProject } from '../../ldtk/types';
import { applyNavEdits, emptyNavEdits, navEditsPath } from '../../map/navEdits';
import type { NavEdits } from '../../map/navEdits';
import { batch, docsStore, editDoc, getDoc, putDoc } from '../../state/docs';
import { pendingAssets } from '../../state/export';
import { ensureDoc } from '../../state/project';
import { setStatus, useStudio } from '../../state/studio';

export type MapView = 'structure' | 'preview';

export interface MapLayers {
  tiles: boolean;
  footholds: boolean;
  walls: boolean;
  climbables: boolean;
  entities: boolean;
  zones: boolean;
  lights: boolean;
  nav: boolean;
  grid: boolean;
}

export interface MapPageState {
  ldtkPath: string | null;
  candidates: string[];
  autoReimport: boolean;
  lastImport: { mtime: number | null; at: number } | null;
  convertIssues: ConvertIssue[];
  /** content/ 的 tileset 路徑 → 專案中的原圖路徑（畫布用，匯出前 content/ 可能還沒有圖）。 */
  tilesetSources: Record<string, string>;
  selected: string | null;
  /** 地圖內被選取的物件，例：portal:{id}、zone:{id}、light:3、climb:2、fh:5 */
  selection: string | null;
  view: MapView;
  layers: MapLayers;
  mode: 'maps' | 'themes';
  /** 導航圖編輯：select = 點選連線、add = 依序點起點與終點足場新增連線。 */
  navTool: 'select' | 'add';
  navAddType: NavEdgeType;
  navDraft: [number, number] | null;
}

export const useMapPage = create<MapPageState>(() => ({
  ldtkPath: null,
  candidates: [],
  autoReimport: true,
  lastImport: null,
  convertIssues: [],
  tilesetSources: {},
  selected: null,
  selection: null,
  view: 'structure',
  layers: {
    tiles: true,
    footholds: true,
    walls: true,
    climbables: true,
    entities: true,
    zones: true,
    lights: true,
    nav: false,
    grid: false,
  },
  mode: 'maps',
  navTool: 'select',
  navAddType: 'jump',
  navDraft: null,
}));

export const mapPath = (id: string) => contentPaths.map(id);

/** 地圖的導航圖 = buildNavGraph（遊戲同一套物理）+ 手動增刪。 */
export function computeNav(map: MapDef, edits: NavEdits | undefined) {
  return applyNavEdits(map, buildNavGraph(map), edits);
}

/** 手動修改導航圖後重算並寫回地圖（記一筆歷史）。 */
export async function updateNavEdits(mapId: string, fn: (e: NavEdits) => NavEdits, label: string): Promise<void> {
  await ensureDoc(navEditsPath(mapId)).catch(() => undefined);
  batch(label, () => {
    editDoc<NavEdits>(navEditsPath(mapId), (e) => fn(e ?? emptyNavEdits()), label);
    const map = getDoc<MapDef>(mapPath(mapId))?.data;
    if (!map) return;
    const nav = computeNav(map, getDoc<NavEdits>(navEditsPath(mapId))?.data).nav;
    editDoc<MapDef>(mapPath(mapId), (m) => ({ ...m!, nav }), label);
  });
}

/**
 * 找專案中的 LDtk 檔：art/maps/*.ldtk 優先，其次是編輯器的測試檔。
 * 測試檔中 ldtk-verdant 用遊戲端的 tileset 圖塊排列；ldtk 是編輯器自己的 programmer tileset（匯入會覆蓋 content/tilesets）。
 */
export async function findLdtkFiles(fs: ProjectFs): Promise<string[]> {
  const found: string[] = [];
  for (const dir of ['art/maps', 'editor/fixtures/ldtk-verdant', 'editor/fixtures/ldtk']) {
    for (const e of await fs.list(dir)) if (e.kind === 'file' && e.name.endsWith('.ldtk')) found.push(`${dir}/${e.name}`);
  }
  return found;
}

export async function refreshCandidates(): Promise<void> {
  const fs = useStudio.getState().fs;
  if (!fs) return;
  const candidates = await findLdtkFiles(fs);
  const current = useMapPage.getState().ldtkPath;
  useMapPage.setState({
    candidates,
    ldtkPath: current && candidates.includes(current) ? current : (candidates[0] ?? null),
  });
}

/** 已載入的地圖 ID（content/maps/ 的檔案 + 草稿）。 */
export async function loadExistingMaps(fs: ProjectFs): Promise<void> {
  for (const e of await fs.list('content/maps')) {
    const m = /^(map_\d{4})\.json$/.exec(e.name);
    if (m) await ensureDoc(mapPath(m[1]!), (raw) => MapDefFile.migrate(raw));
  }
}

export function mapIdsInDocs(docs: ReturnType<typeof docsStore.getState>['docs']): string[] {
  return Object.keys(docs)
    .map((p) => /^maps\/(map_\d{4})\.json$/.exec(p)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort();
}

/** 讀 LDtk → 轉成 MapDef → 有變動的地圖寫成草稿；tileset 圖排入匯出。 */
export async function importLdtk(): Promise<void> {
  const fs = useStudio.getState().fs;
  const { ldtkPath } = useMapPage.getState();
  if (!fs || !ldtkPath) return;
  const ldtkDir = dirname(ldtkPath);
  const mtime = await fs.lastModified(ldtkPath);
  const project = await loadExternalLevels(await readJson<LdtkProject>(fs, ldtkPath), (rel) =>
    readJson(fs, joinPath(ldtkDir, rel)),
  );
  const result = convertLdtkProject(project, { buildNav: buildNavGraph });

  let changed = 0;
  for (const map of result.maps) {
    const path = mapPath(map.id);
    // 套用手動的導航圖修改
    const edits = (await ensureDoc<NavEdits>(navEditsPath(map.id)).catch(() => undefined))?.data;
    if (edits) {
      const applied = applyNavEdits(map, map.nav, edits);
      map.nav = applied.nav;
      for (const u of applied.unresolved) {
        result.issues.push({
          level: map.name,
          severity: 'warning',
          message: `手動${u.kind === 'add' ? '新增' : '刪除'}的導航連線（${u.edge.from.join(',')} → ${u.edge.to.join(',')}）找不到對應的足場，地圖可能改過了`,
        });
      }
    }
    await ensureDoc(path, (raw) => MapDefFile.migrate(raw)).catch(() => undefined);
  }
  // 有變動的地圖一次寫入（一筆歷史，Ctrl+Z 可整批復原）
  batch(`匯入 ${ldtkPath}`, () => {
    for (const map of result.maps) {
      const path = mapPath(map.id);
      const current = getDoc<MapDef>(path);
      if (!current || JSON.stringify(current.data) !== JSON.stringify(map)) {
        putDoc(path, map, `匯入 ${ldtkPath}`);
        changed++;
      }
    }
  });

  // tileset：LDtk 引用的 PNG 匯出到 content/tilesets/，有法線貼圖（_n.png）一併複製
  const tilesetSources: Record<string, string> = {};
  for (const t of project.defs.tilesets) {
    if (!t.relPath) continue;
    const source = joinPath(ldtkDir, t.relPath);
    const target = `tilesets/${t.identifier}.png`;
    tilesetSources[target] = source;
    if (!source.endsWith('.png')) {
      result.issues.push({
        level: '(專案)',
        severity: 'warning',
        message: `tileset ${t.identifier} 不是 PNG（${t.relPath}），請先用 npm run art 匯出到 content/${target}`,
      });
      continue;
    }
    pendingAssets.set(target, () => fs.readFile(source));
    const normal = source.replace(/\.png$/, '_n.png');
    if (await fs.exists(normal)) pendingAssets.set(contentPaths.normalMap(target), () => fs.readFile(normal));
  }

  const ids = result.maps.map((m) => m.id);
  const state = useMapPage.getState();
  useMapPage.setState({
    lastImport: { mtime, at: Date.now() },
    convertIssues: result.issues,
    tilesetSources,
    selected: state.selected && ids.includes(state.selected) ? state.selected : (ids[0] ?? null),
  });
  const errors = result.issues.filter((i) => i.severity === 'error').length;
  setStatus(
    `已匯入 ${ldtkPath}：${result.maps.length} 張地圖，${changed} 張有變動${errors ? `，${errors} 個轉換錯誤` : ''}`,
    errors ? 'error' : 'ok',
  );
}

/** 監看 LDtk 存檔，自動重新匯入；回傳停止函式。 */
export function watchLdtk(intervalMs = 1500): () => void {
  let busy = false;
  const timer = setInterval(async () => {
    const fs = useStudio.getState().fs;
    const { ldtkPath, autoReimport, lastImport } = useMapPage.getState();
    if (busy || !fs || !ldtkPath || !autoReimport || !lastImport) return;
    busy = true;
    try {
      const mtime = await fs.lastModified(ldtkPath);
      if (mtime !== lastImport.mtime) await importLdtk();
    } catch (error) {
      setStatus(`自動匯入失敗：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      busy = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
