/** 角色造型頁的驗證與匯出掛勾（圖示）。 */
import { AVATAR_TAGS, contentPaths } from '@lawn/shared';
import type { AvatarItem, PaletteFile } from '@lawn/shared';
import { findNearKeyColors, usedKeyColors } from '../../avatar/colors';
import { AvatarRenderer, renderIcon } from '../../avatar/render';
import { validateBase, validateItem, validatePalettes } from '../../avatar/validate';
import { loadSheet, sheetPixels } from '../../content/sheets';
import type { ProjectFs } from '../../fs/projectFs';
import { docsStore, isDirty } from '../../state/docs';
import { pendingAssets, registerExportHook } from '../../state/export';
import { registerValidator } from '../../state/validation';
import type { Issue } from '../../state/validation';
import { BASE_SHEET, PALETTES_PATH, itemPath, scanAvatar, useAvatarPage } from './avatarStore';
import { GROUP_LABEL } from './PalettePanel';
import { defaultLoadout } from './useAvatarData';

const GROUPS = ['hair', 'eye', 'dye'] as const;

registerValidator('avatar', async ({ fs }) => {
  await scanAvatar(fs);
  const docs = docsStore.getState().docs;
  const { ids, unregistered } = useAvatarPage.getState();
  const palettes = docs[PALETTES_PATH]?.data as PaletteFile | undefined;
  const base = await loadSheet(fs, BASE_SHEET).catch(() => null);
  const issues: Issue[] = [...validateBase(base?.sheet ?? null), ...validatePalettes(palettes)];
  const items = ids.filter((id) => docs[itemPath(id)]).map((id) => docs[itemPath(id)]!.data as AvatarItem);
  const underHatUsed = items.some((i) => i.hairMode === 'underHat');
  for (const item of items) {
    const loaded = await loadSheet(fs, item.sheet).catch(() => null);
    issues.push(...validateItem(item, loaded?.sheet ?? null, base?.sheet ?? null, { underHatUsed }));
    if (!loaded?.image || !palettes) continue;
    const pixels = sheetPixels(loaded.image);
    const target = item.id;
    const path = itemPath(item.id);
    if (item.recolor) {
      for (const near of findNearKeyColors(pixels, palettes.keyRamps[item.recolor]).slice(0, 3)) {
        issues.push({
          severity: 'error',
          page: 'avatar',
          path,
          target,
          message: `${item.id}：顏色 ${near.color}（${near.pixels} 像素）很接近 ${GROUP_LABEL[item.recolor]} Key 色 ${near.key} 但不相同，換色時不會被替換`,
        });
      }
    }
    for (const g of GROUPS) {
      if (g === item.recolor) continue;
      const used = usedKeyColors(pixels, palettes.keyRamps[g]);
      if (used.length) {
        issues.push({ severity: 'warning', page: 'avatar', path, target, message: `${item.id}：用了${GROUP_LABEL[g]}的 Key 色 ${used.join('、')}，但換色群組不是${GROUP_LABEL[g]}，這些顏色不會被替換` });
      }
    }
  }
  for (const id of unregistered) issues.push({ severity: 'warning', page: 'avatar', target: id, message: `${id}：有匯出的 sheet，但還沒有登錄（遊戲不會使用）` });
  return issues;
});

/** 產生部件圖示的 PNG（stand 第一幀、預設顏色）。 */
export async function makeIcon(fs: ProjectFs, item: AvatarItem): Promise<Blob> {
  const base = await loadSheet(fs, BASE_SHEET);
  const part = await loadSheet(fs, item.sheet);
  const palettes = docsStore.getState().docs[PALETTES_PATH]?.data as PaletteFile | undefined;
  const loadout = defaultLoadout(palettes, [item.id]);
  const dye = palettes?.palettes.find((p) => p.group === 'dye');
  if (item.recolor === 'dye' && dye) loadout.dyes = { [item.id]: dye.id };
  const renderer = new AvatarRenderer(base, [{ item, sheet: part.sheet, image: part.image }], palettes, loadout);
  const stand = base.sheet.tags.get('stand')?.from ?? 0;
  // 武器：沒畫 stand 時改用該職業的攻擊動作第一幀
  const frame = renderer.ops(stand).some((op) => op.source === item.id)
    ? stand
    : ([...base.sheet.tags.values()].filter((t) => t.name in AVATAR_TAGS).map((t) => t.from).find((f) => renderer.ops(f).some((op) => op.source === item.id)) ?? stand);
  return renderIcon(renderer, item.id, frame).convertToBlob({ type: 'image/png' });
}

/** 匯出時：設定有變動、或還沒有圖示的部件，重新產生圖示。 */
registerExportHook('avatar-icons', async (fs) => {
  const docs = docsStore.getState().docs;
  for (const [path, entry] of Object.entries(docs)) {
    if (!/^avatar\/items\/[a-zA-Z]+_\d{4}\.json$/.test(path)) continue;
    const item = entry.data as AvatarItem;
    const iconPath = item.icon || `avatar/items/${item.id}.icon.png`;
    if (isDirty(entry) || !(await fs.exists(`content/${iconPath}`)) || isDirty(docs[contentPaths.palettes])) {
      const blob = await makeIcon(fs, item).catch(() => null);
      if (blob) pendingAssets.set(iconPath, async () => blob);
    }
  }
});
