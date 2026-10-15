/** 角色造型頁的驗證與匯出掛勾（武器圖示）。 */
import { AVATAR_TAGS } from '@lawn/shared';
import type { AvatarItem } from '@lawn/shared';
import { AvatarRenderer, renderIcon } from '../../avatar/render';
import { validateBase, validateItem } from '../../avatar/validate';
import { loadSheet } from '../../content/sheets';
import type { ProjectFs } from '../../fs/projectFs';
import { docsStore, isDirty } from '../../state/docs';
import { pendingAssets, registerExportHook } from '../../state/export';
import { registerValidator } from '../../state/validation';
import type { Issue } from '../../state/validation';
import { BASE_SHEET, itemPath, scanAvatar, useAvatarPage } from './avatarStore';

registerValidator('avatar', async ({ fs }) => {
  await scanAvatar(fs);
  const docs = docsStore.getState().docs;
  const { ids, unregistered } = useAvatarPage.getState();
  const base = await loadSheet(fs, BASE_SHEET).catch(() => null);
  const issues: Issue[] = [...validateBase(base?.sheet ?? null)];
  for (const id of ids) {
    const item = docs[itemPath(id)]?.data as AvatarItem | undefined;
    if (!item) continue;
    const loaded = await loadSheet(fs, item.sheet).catch(() => null);
    issues.push(...validateItem(item, loaded?.sheet ?? null, base?.sheet ?? null));
  }
  for (const id of unregistered) issues.push({ severity: 'warning', page: 'avatar', target: id, message: `${id}：有匯出的 sheet，但還沒有登錄（遊戲不會使用）` });
  return issues;
});

/** 武器圖示的 PNG：stand 第一幀（沒畫 stand 時用第一個有畫的動作）。 */
export async function makeIcon(fs: ProjectFs, item: AvatarItem): Promise<Blob> {
  const base = await loadSheet(fs, BASE_SHEET);
  const part = await loadSheet(fs, item.sheet);
  const renderer = new AvatarRenderer(base, [{ item, sheet: part.sheet, image: part.image }]);
  const starts = [...base.sheet.tags.values()].filter((t) => t.name in AVATAR_TAGS).map((t) => t.from);
  const frame = starts.find((f) => renderer.ops(f).some((op) => op.source === item.id)) ?? starts[0] ?? 0;
  return renderIcon(renderer, item.id, frame).convertToBlob({ type: 'image/png' });
}

/** 匯出時：設定有變動、或還沒有圖示的武器，重新產生圖示。 */
registerExportHook('avatar-icons', async (fs) => {
  const docs = docsStore.getState().docs;
  for (const [path, entry] of Object.entries(docs)) {
    if (!/^avatar\/items\/[a-zA-Z]+_\d{4}\.json$/.test(path)) continue;
    const item = entry.data as AvatarItem;
    if (item.category !== 'weapon') continue;
    const iconPath = item.icon || `avatar/items/${item.id}.icon.png`;
    if (isDirty(entry) || !(await fs.exists(`content/${iconPath}`))) {
      const blob = await makeIcon(fs, item).catch(() => null);
      if (blob) pendingAssets.set(iconPath, async () => blob);
    }
  }
});
