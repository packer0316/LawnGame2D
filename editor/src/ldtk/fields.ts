import type { LdtkFieldInstance, LdtkTileRect } from './types';

/** 讀取 LDtk 欄位值的小工具：型別不符或欄位不存在時回傳 undefined。 */
export class Fields {
  constructor(private readonly list: LdtkFieldInstance[]) {}

  has(name: string): boolean {
    return this.raw(name) !== undefined;
  }

  raw(name: string): unknown {
    const value = this.list.find((f) => f.__identifier === name)?.__value;
    return value === null ? undefined : value;
  }

  number(name: string): number | undefined {
    const v = this.raw(name);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  /** 字串或 enum 值都當字串讀。 */
  string(name: string): string | undefined {
    const v = this.raw(name);
    return typeof v === 'string' ? v : undefined;
  }

  bool(name: string): boolean | undefined {
    const v = this.raw(name);
    return typeof v === 'boolean' ? v : undefined;
  }

  strings(name: string): string[] | undefined {
    const v = this.raw(name);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined;
  }

  tile(name: string): LdtkTileRect | undefined {
    const v = this.raw(name);
    if (typeof v !== 'object' || v === null) return undefined;
    const t = v as Partial<LdtkTileRect>;
    return typeof t.tilesetUid === 'number' && typeof t.x === 'number' && typeof t.y === 'number'
      ? { tilesetUid: t.tilesetUid, x: t.x, y: t.y, w: t.w ?? 0, h: t.h ?? 0 }
      : undefined;
  }
}
