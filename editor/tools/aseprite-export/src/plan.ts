/**
 * art/ → content/ 的匯出規劃（STUDIO_SPEC §2、§8.1）。純函式，方便在沒有 Aseprite 的環境測試。
 */

export type ArtKind = 'avatarBase' | 'avatarItem' | 'monster' | 'fx' | 'ui' | 'tileset' | 'background' | 'normalMap';

export interface ArtJob {
  kind: ArtKind;
  /** 相對專案根目錄。 */
  source: string;
  /** 輸出的 PNG（相對專案根目錄）。 */
  png: string;
  /** 輸出的 sheet 資料；平面圖（tileset、背景）與法線貼圖沒有。 */
  data?: string;
}

const RULES: { pattern: RegExp; kind: ArtKind; out: (name: string) => string }[] = [
  { pattern: /^art\/avatar\/avatar_base\.aseprite$/, kind: 'avatarBase', out: () => 'content/avatar/base' },
  { pattern: /^art\/avatar\/items\/([^/]+)\.aseprite$/, kind: 'avatarItem', out: (n) => `content/avatar/items/${n}` },
  { pattern: /^art\/monsters\/([^/]+)\.aseprite$/, kind: 'monster', out: (n) => `content/monsters/${n}` },
  { pattern: /^art\/fx\/([^/]+)\.aseprite$/, kind: 'fx', out: (n) => `content/fx/${n}` },
  { pattern: /^art\/ui\/([^/]+)\.aseprite$/, kind: 'ui', out: (n) => `content/ui/${n}` },
  { pattern: /^art\/maps\/tilesets\/([^/]+)\.aseprite$/, kind: 'tileset', out: (n) => `content/tilesets/${n}` },
  { pattern: /^art\/backgrounds\/([^/]+)\.aseprite$/, kind: 'background', out: (n) => `content/backgrounds/${n}` },
  // Laigter 產生的法線貼圖（PNG）直接複製
  { pattern: /^art\/maps\/tilesets\/([^/]+_n)\.png$/, kind: 'normalMap', out: (n) => `content/tilesets/${n}` },
  { pattern: /^art\/backgrounds\/([^/]+_n)\.png$/, kind: 'normalMap', out: (n) => `content/backgrounds/${n}` },
];

const FLAT: ArtKind[] = ['tileset', 'background', 'normalMap'];

export function planJob(source: string): ArtJob | null {
  const path = source.replace(/\\/g, '/');
  for (const rule of RULES) {
    const m = rule.pattern.exec(path);
    if (!m) continue;
    const base = rule.out(m[1] ?? '');
    return FLAT.includes(rule.kind) ? { kind: rule.kind, source: path, png: `${base}.png` } : { kind: rule.kind, source: path, png: `${base}.png`, data: `${base}.sheet.json` };
  }
  return null;
}

export const isLayered = (kind: ArtKind) => kind === 'avatarBase' || kind === 'avatarItem';

/** 參考用圖層：名稱以 _ 開頭。 */
export const isReferenceLayer = (name: string) => name.split('/').pop()!.startsWith('_');

/** Aseprite CLI 參數（不含執行檔）。layers 是 --list-layers 讀到的圖層。 */
export function asepriteArgs(job: ArtJob, layers: string[]): string[] {
  const ignore = layers.filter(isReferenceLayer).flatMap((l) => ['--ignore-layer', l]);
  if (job.kind === 'normalMap') throw new Error('法線貼圖直接複製，不經過 Aseprite');
  if (job.kind === 'tileset' || job.kind === 'background') {
    return ['-b', '--oneframe', ...ignore, job.source, '--save-as', job.png];
  }
  const common = ['--format', 'json-array', '--list-tags', '--list-slices', '--list-layers'];
  const layered = isLayered(job.kind) ? ['--split-layers', '--ignore-empty'] : [];
  return [
    '-b',
    ...common,
    ...layered,
    ...ignore,
    '--sheet-type',
    'packed',
    '--trim',
    '--shape-padding',
    '1',
    '--filename-format',
    isLayered(job.kind) ? '{layer}|{frame}' : '{frame}',
    job.source,
    '--sheet',
    job.png,
    '--data',
    job.data!,
  ];
}

/** 匯出後把 meta.image 改成 PNG 檔名（相對 .sheet.json 所在資料夾，§8.1）。 */
export function fixSheetJson(json: string, png: string): string {
  const data = JSON.parse(json) as { meta?: { image?: string } };
  if (data.meta) data.meta.image = png.split('/').pop()!;
  return `${JSON.stringify(data, null, 1)}\n`;
}
