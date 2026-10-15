import { AvatarItemFile, PaletteFileVersioned, contentPaths } from '@lawn/shared';
import type { AvatarItem, PaletteFile } from '@lawn/shared';
import { create } from 'zustand';
import { createAvatarItem } from '../../avatar/defaults';
import { loadSheet } from '../../content/sheets';
import type { ProjectFs } from '../../fs/projectFs';
import { docsStore, editDoc, getDoc, putDoc } from '../../state/docs';
import { ensureDoc } from '../../state/project';
import { useStudio } from '../../state/studio';

export type AvatarSelection = 'base' | 'palettes' | 'tryon' | string;

export interface AvatarPageState {
  ids: string[];
  unregistered: string[];
  selected: AvatarSelection;
  /** 姿勢表目前檢視的動作。 */
  tag: string;
  frame: number;
  playing: boolean;
  zoom: number;
  version: number;
}

export const useAvatarPage = create<AvatarPageState>(() => ({
  ids: [],
  unregistered: [],
  selected: 'base',
  tag: 'run',
  frame: 0,
  playing: false,
  zoom: 4,
  version: 0,
}));

export const PALETTES_PATH = contentPaths.palettes;
export const BASE_SHEET = contentPaths.avatarBaseSheet;
export const itemPath = (id: string) => contentPaths.avatarItem(id);

const SHEET = /^(.+)\.sheet\.json$/;
const SETTING = /^([a-zA-Z]+_\d{4})\.json$/;

export async function scanAvatar(fs: ProjectFs): Promise<void> {
  const entries = await fs.list('content/avatar/items');
  const sheetIds = new Set(entries.map((e) => SHEET.exec(e.name)?.[1]).filter((x): x is string => !!x));
  const settingIds = new Set(entries.map((e) => SETTING.exec(e.name)?.[1]).filter((x): x is string => !!x));
  for (const id of settingIds) await ensureDoc(itemPath(id), (raw) => AvatarItemFile.migrate(raw));
  await ensureDoc(PALETTES_PATH, (raw) => PaletteFileVersioned.migrate(raw)).catch(() => undefined);
  for (const path of Object.keys(docsStore.getState().docs)) {
    const id = /^avatar\/items\/([a-zA-Z]+_\d{4})\.json$/.exec(path)?.[1];
    if (id) settingIds.add(id);
  }
  const ids = [...new Set([...sheetIds, ...settingIds])].sort();
  useAvatarPage.setState({ ids, unregistered: ids.filter((id) => !getDoc(itemPath(id))) });
}

export async function registerItem(id: string): Promise<void> {
  const fs = useStudio.getState().fs;
  if (!fs) return;
  const { sheet } = await loadSheet(fs, contentPaths.avatarItemSheet(id));
  putDoc(itemPath(id), createAvatarItem(id, sheet), `登錄 ${id}`);
  await scanAvatar(fs);
}

export function updateItem(id: string, fn: (i: AvatarItem) => AvatarItem, label: string): void {
  editDoc<AvatarItem>(itemPath(id), (i) => fn(i!), label);
}

export function updatePalettes(fn: (p: PaletteFile) => PaletteFile, label: string): void {
  editDoc<PaletteFile>(PALETTES_PATH, (p) => fn(p ?? { schemaVersion: 1, keyRamps: { skin: ['#ffe0c8'], hair: ['#d99a2b'], eye: ['#3b82c4'], dye: ['#b7c4d9'] }, palettes: [] }), label);
}
