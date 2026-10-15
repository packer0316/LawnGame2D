import { z } from 'zod';

/**
 * Aseprite CLI 匯出的 sprite sheet JSON（`--format json-array` 或 json-hash，
 * 搭配 `--list-tags`、`--list-slices`、`--list-layers`）。
 */
const RawRectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const RawFrameBodySchema = z.object({
  frame: RawRectSchema,
  rotated: z.boolean().optional(),
  trimmed: z.boolean().optional(),
  spriteSourceSize: RawRectSchema,
  sourceSize: z.object({ w: z.number(), h: z.number() }),
  duration: z.number(),
});
const RawFrameSchema = RawFrameBodySchema.extend({ filename: z.string() });

export const AsepriteRawSheetSchema = z.object({
  frames: z.union([z.array(RawFrameSchema), z.record(z.string(), RawFrameBodySchema)]),
  meta: z.object({
    image: z.string(),
    size: z.object({ w: z.number(), h: z.number() }),
    frameTags: z
      .array(
        z.object({
          name: z.string(),
          from: z.number().int(),
          to: z.number().int(),
          direction: z.string(),
          repeat: z.string().optional(),
        }),
      )
      .optional(),
    layers: z.array(z.object({ name: z.string() }).loose()).optional(),
    slices: z
      .array(
        z.object({
          name: z.string(),
          color: z.string().optional(),
          data: z.string().optional(),
          keys: z.array(
            z.object({
              frame: z.number().int(),
              bounds: RawRectSchema,
              center: RawRectSchema.optional(),
              pivot: z.object({ x: z.number(), y: z.number() }).optional(),
            }),
          ),
        }),
      )
      .optional(),
  }).loose(),
});
export type AsepriteRawSheet = z.infer<typeof AsepriteRawSheetSchema>;

export interface AseRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AseFrame {
  /** 圖層名稱；沒有 `--split-layers` 時為 null。 */
  layer: string | null;
  /** 在原始檔中的幀索引（0 起算）。 */
  index: number;
  /** 在 sheet 圖片中的位置。 */
  rect: AseRect;
  /** 修剪後的圖在原畫布中的位置（`--trim` 時用來還原位置）。 */
  sourceRect: AseRect;
  sourceSize: { w: number; h: number };
  durationMs: number;
}

export type AseDirection = 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse';

export interface AseTag {
  name: string;
  from: number;
  to: number;
  direction: AseDirection;
}

export interface AseSliceKey {
  frame: number;
  bounds: AseRect;
  center?: AseRect;
  /** 相對 bounds 左上角。 */
  pivot?: { x: number; y: number };
}

export interface AseSheet {
  image: string;
  size: { w: number; h: number };
  /** 原始檔的總幀數。 */
  frameCount: number;
  /** 有出現在 sheet 中的圖層（沒有分層時為 [null]）。 */
  layers: (string | null)[];
  frames: AseFrame[];
  tags: Map<string, AseTag>;
  slices: Map<string, AseSliceKey[]>;
  /** 取得某圖層某幀；`--ignore-empty` 略過的空白幀會回傳 undefined。 */
  frame(layer: string | null, index: number): AseFrame | undefined;
  /** 某 Slice 在某幀的 key（沿用該幀之前最近的一個 key）。 */
  sliceAt(name: string, frame: number): AseSliceKey | undefined;
  /** Slice pivot 在原畫布中的絕對座標。 */
  slicePivotAt(name: string, frame: number): { x: number; y: number } | undefined;
}

/** 從 frame filename 取出圖層與幀索引；無法辨識時回傳 null，改用出現順序。 */
export type FilenameParser = (filename: string) => { layer: string | null; index: number } | null;

/**
 * 預設命名規則（STUDIO_SPEC §8.1）：一般 sheet 是時間軸幀號 `"12"`；
 * 部件 sheet（`--split-layers`）是 `"{圖層}|{幀號}"`，例如 `"top|12"`。
 */
export const defaultFilenameParser: FilenameParser = (filename) => {
  const match = /^(?:(.*)\|)?(\d+)$/.exec(filename);
  if (!match) return null;
  return { layer: match[1] ?? null, index: Number(match[2]) };
};

const DIRECTIONS: readonly string[] = ['forward', 'reverse', 'pingpong', 'pingpong_reverse'];

export function parseAsepriteSheet(
  raw: unknown,
  options: { parseFilename?: FilenameParser } = {},
): AseSheet {
  const data = AsepriteRawSheetSchema.parse(raw);
  const parseFilename = options.parseFilename ?? defaultFilenameParser;

  const entries = Array.isArray(data.frames)
    ? data.frames
    : Object.entries(data.frames).map(([filename, body]) => ({ ...body, filename }));

  const positional = new Map<string | null, number>();
  const frames: AseFrame[] = entries.map((entry) => {
    const parsed = parseFilename(entry.filename);
    const layer = parsed ? parsed.layer : null;
    const fallbackIndex = positional.get(layer) ?? 0;
    positional.set(layer, fallbackIndex + 1);
    return {
      layer,
      index: parsed ? parsed.index : fallbackIndex,
      rect: entry.frame,
      sourceRect: entry.spriteSourceSize,
      sourceSize: entry.sourceSize,
      durationMs: entry.duration,
    };
  });

  const byKey = new Map<string, AseFrame>();
  const layers: (string | null)[] = [];
  for (const frame of frames) {
    byKey.set(`${frame.layer ?? ''}\u0000${frame.index}`, frame);
    if (!layers.includes(frame.layer)) layers.push(frame.layer);
  }

  const tags = new Map<string, AseTag>();
  for (const tag of data.meta.frameTags ?? []) {
    const direction = (DIRECTIONS.includes(tag.direction) ? tag.direction : 'forward') as AseDirection;
    tags.set(tag.name, { name: tag.name, from: tag.from, to: tag.to, direction });
  }

  const slices = new Map<string, AseSliceKey[]>();
  for (const slice of data.meta.slices ?? []) {
    slices.set(slice.name, [...slice.keys].sort((a, b) => a.frame - b.frame));
  }

  const tagMax = Math.max(-1, ...[...tags.values()].map((tag) => tag.to));
  const frameMax = Math.max(-1, ...frames.map((frame) => frame.index));

  function sliceAt(name: string, frame: number): AseSliceKey | undefined {
    const keys = slices.get(name);
    if (!keys) return undefined;
    let found: AseSliceKey | undefined;
    for (const key of keys) {
      if (key.frame > frame) break;
      found = key;
    }
    return found;
  }

  return {
    image: data.meta.image,
    size: data.meta.size,
    frameCount: Math.max(tagMax, frameMax) + 1,
    layers,
    frames,
    tags,
    slices,
    frame: (layer, index) => byKey.get(`${layer ?? ''}\u0000${index}`),
    sliceAt,
    slicePivotAt(name, frame) {
      const key = sliceAt(name, frame);
      if (!key) return undefined;
      const pivot = key.pivot ?? { x: Math.floor(key.bounds.w / 2), y: Math.floor(key.bounds.h / 2) };
      return { x: key.bounds.x + pivot.x, y: key.bounds.y + pivot.y };
    },
  };
}

/** `meta.image` 只有檔名、相對 .sheet.json 所在資料夾；轉成相對 content/ 的路徑。 */
export function resolveSheetImage(sheetPath: string, image: string): string {
  const slash = sheetPath.lastIndexOf('/');
  return slash < 0 ? image : `${sheetPath.slice(0, slash + 1)}${image}`;
}

/** 某幀屬於哪個 Tag（取第一個符合的區間）。 */
export function tagOfFrame(sheet: AseSheet, frame: number): AseTag | undefined {
  for (const tag of sheet.tags.values()) {
    if (frame >= tag.from && frame <= tag.to) return tag;
  }
  return undefined;
}

/** 依 Tag 方向展開成播放順序的幀索引（不含 repeat）。 */
export function tagFrameSequence(tag: AseTag): number[] {
  const forward: number[] = [];
  for (let i = tag.from; i <= tag.to; i += 1) forward.push(i);
  switch (tag.direction) {
    case 'forward':
      return forward;
    case 'reverse':
      return [...forward].reverse();
    case 'pingpong':
      return [...forward, ...forward.slice(1, -1).reverse()];
    case 'pingpong_reverse': {
      const reversed = [...forward].reverse();
      return [...reversed, ...reversed.slice(1, -1).reverse()];
    }
  }
}
