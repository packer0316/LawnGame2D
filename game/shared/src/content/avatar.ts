import { z } from 'zod';
import { versioned } from '../versioned';
import { ClassIdSchema, HexColorSchema, IdSchema, Vec2Schema } from './common';

/** 紙娃娃圖層，由後到前（STUDIO_SPEC §4.3）。 */
export const AVATAR_LAYERS = [
  'cape',
  'hair_back',
  'weapon_back',
  'body',
  'shoes',
  'bottom',
  'top',
  'head',
  'face',
  'face_acc',
  'eye_acc',
  'hair_front',
  'hat',
  'weapon',
  'arm_front',
  'sleeve',
  'glove',
] as const;
export const AvatarLayerSchema = z.enum(AVATAR_LAYERS);
export type AvatarLayer = z.infer<typeof AvatarLayerSchema>;

/** 範本檔的動作、身體幀數、部件姿勢數、頭部視角（STUDIO_SPEC §4.2）。 */
export const AVATAR_TAGS = {
  stand: { frames: 6, poses: 2, view: 'front' },
  run: { frames: 8, poses: 4, view: 'front' },
  jump: { frames: 2, poses: 1, view: 'front' },
  fall: { frames: 2, poses: 1, view: 'front' },
  land: { frames: 2, poses: 1, view: 'front' },
  roll: { frames: 6, poses: 3, view: 'front' },
  prone: { frames: 1, poses: 1, view: 'front' },
  ladder: { frames: 4, poses: 2, view: 'back' },
  rope: { frames: 4, poses: 2, view: 'back' },
  swing1: { frames: 5, poses: 2, view: 'front' },
  swing2: { frames: 5, poses: 2, view: 'front' },
  swing3: { frames: 5, poses: 2, view: 'front' },
  cast: { frames: 6, poses: 3, view: 'front' },
  shoot: { frames: 6, poses: 3, view: 'front' },
  throw: { frames: 5, poses: 2, view: 'front' },
} as const satisfies Record<string, { frames: number; poses: number; view: 'front' | 'back' }>;
export type AvatarTag = keyof typeof AVATAR_TAGS;
export const AVATAR_TAG_NAMES = Object.keys(AVATAR_TAGS) as AvatarTag[];

/** 範本畫布：128×128，腳底中心在 (64, 120)（STUDIO_SPEC §4.1）。 */
export const AVATAR_CANVAS = { w: 128, h: 128, footX: 64, footY: 120 } as const;

/** 範本檔上的錨點 Slice。 */
export const AVATAR_SLICES = ['head', 'torso', 'hand'] as const;
export const AvatarSliceSchema = z.enum(AVATAR_SLICES);
export type AvatarSlice = z.infer<typeof AvatarSliceSchema>;

export const AvatarCategorySchema = z.enum([
  'face',
  'hair',
  'hat',
  'top',
  'bottom',
  'overall',
  'shoes',
  'gloves',
  'cape',
  'weapon',
  'faceAcc',
  'eyeAcc',
]);
export type AvatarCategory = z.infer<typeof AvatarCategorySchema>;

export const AvatarItemSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1),
  category: AvatarCategorySchema,
  /** 武器限定職業。 */
  classId: ClassIdSchema.optional(),
  /** 姿勢部件／錨點部件。 */
  kind: z.enum(['pose', 'anchor']),
  /** 匯出的 sheet JSON（相對 content/）。 */
  sheet: z.string().min(1),
  /** 佔用的圖層，例：上衣 = ['top', 'sleeve']。 */
  layers: z.array(AvatarLayerSchema).min(1),
  /** 姿勢部件：每個 Tag 的「身體幀 → 姿勢索引」對應；未填則自動平均分配。 */
  poseMap: z.record(z.string(), z.array(z.number().int().min(0))).optional(),
  /** 額外偏移（像素）。跟哪個錨點由圖層決定（LAYER_ANCHOR）。 */
  offset: Vec2Schema.optional(),
  /** 錨點部件的視角幀覆寫；不填時正面 = stand 第一幀、背面 = ladder 第一幀。 */
  views: z.object({ front: z.number().int().min(0).optional(), back: z.number().int().min(0).optional() }).optional(),
  recolor: z.enum(['hair', 'eye', 'dye']).optional(),
  hairMode: z.enum(['full', 'underHat', 'hidden']).optional(),
  hidesLayers: z.array(AvatarLayerSchema).optional(),
  icon: z.string(),
});
export type AvatarItem = z.infer<typeof AvatarItemSchema>;
export const AvatarItemFile = versioned(AvatarItemSchema, 1);

export const PaletteGroupSchema = z.enum(['skin', 'hair', 'eye', 'dye']);
export type PaletteGroup = z.infer<typeof PaletteGroupSchema>;

export const PaletteSchema = z.object({
  id: IdSchema,
  group: PaletteGroupSchema,
  name: z.string().min(1),
  /** 依序對應該群組 Key 色階的每一階。 */
  colors: z.array(HexColorSchema).min(1),
});
export type Palette = z.infer<typeof PaletteSchema>;

/** `content/avatar/palettes.json`：Key 色階 + 各顏色的色階。 */
export const PaletteFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    keyRamps: z.object({
      skin: z.array(HexColorSchema).min(1),
      hair: z.array(HexColorSchema).min(1),
      eye: z.array(HexColorSchema).min(1),
      dye: z.array(HexColorSchema).min(1),
    }),
    palettes: z.array(PaletteSchema),
  })
  .superRefine((file, ctx) => {
    file.palettes.forEach((palette, index) => {
      const expected = file.keyRamps[palette.group].length;
      if (palette.colors.length !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['palettes', index, 'colors'],
          message: `${palette.id} 有 ${palette.colors.length} 階，但 ${palette.group} 的 Key 色階有 ${expected} 階`,
        });
      }
    });
  });
export type PaletteFile = z.infer<typeof PaletteFileSchema>;
export const PaletteFileVersioned = versioned(PaletteFileSchema, 1);

/** 角色目前的外觀組合。 */
export const AvatarLoadoutSchema = z.object({
  items: z.array(IdSchema),
  skin: IdSchema,
  hair: IdSchema,
  eye: IdSchema,
  /** 部件 ID → 染色 palette ID。 */
  dyes: z.record(z.string(), IdSchema).optional(),
});
export type AvatarLoadout = z.infer<typeof AvatarLoadoutSchema>;
