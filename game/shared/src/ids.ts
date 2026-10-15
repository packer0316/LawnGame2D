/** 內容 ID 規則：`{分類}_{4 位數}`，例如 `hair_0001`、`mob_0003`、`map_0001`。 */
export const ID_PATTERN = /^[a-z][a-zA-Z]*_\d{4}$/;

export function isValidId(id: string, category?: string): boolean {
  if (!ID_PATTERN.test(id)) return false;
  return category === undefined || id.startsWith(`${category}_`);
}

/** 取出 ID 的分類部分；格式不符時回傳 null。 */
export function idCategory(id: string): string | null {
  return ID_PATTERN.test(id) ? id.slice(0, id.lastIndexOf('_')) : null;
}
