import type { z } from 'zod';

/** 把 schemaVersion = n 的資料轉成 n + 1。 */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export type MigrateResult<T> = { success: true; data: T } | { success: false; error: string };

export interface VersionedSchema<T> {
  readonly schema: z.ZodType<T>;
  /** 目前版本；寫檔時一律寫這個版本。 */
  readonly version: number;
  /** 舊版資料逐版升級後驗證，失敗時丟出錯誤。 */
  migrate(raw: unknown): T;
  safeMigrate(raw: unknown): MigrateResult<T>;
}

/**
 * 包裝一個帶 `schemaVersion` 欄位的 schema。
 * `migrations[n]` 負責把版本 n 升到 n + 1；缺少 schemaVersion 的資料視為版本 1。
 */
export function versioned<T>(
  schema: z.ZodType<T>,
  version: number,
  migrations: Record<number, Migration> = {},
): VersionedSchema<T> {
  function upgrade(raw: unknown): unknown {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
    let data = raw as Record<string, unknown>;
    let current = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;
    if (current > version) {
      throw new Error(`資料版本 ${current} 比程式支援的版本 ${version} 新，請更新程式`);
    }
    while (current < version) {
      const step = migrations[current];
      if (!step) throw new Error(`缺少版本 ${current} → ${current + 1} 的 migration`);
      data = { ...step(data), schemaVersion: current + 1 };
      current += 1;
    }
    return data;
  }

  return {
    schema,
    version,
    migrate(raw) {
      return schema.parse(upgrade(raw));
    },
    safeMigrate(raw) {
      try {
        const result = schema.safeParse(upgrade(raw));
        return result.success
          ? { success: true, data: result.data }
          : { success: false, error: result.error.message };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
