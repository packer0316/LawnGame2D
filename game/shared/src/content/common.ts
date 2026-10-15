import { z } from 'zod';
import { ID_PATTERN } from '../ids';

export const IdSchema = z.string().regex(ID_PATTERN, 'ID 格式必須是 {分類}_{4 位數}');
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, '顏色格式必須是 #RRGGBB 或 #RRGGBBAA');
export const Vec2Schema = z.object({ x: z.number(), y: z.number() });
export const RectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const RangeSchema = z.tuple([z.number(), z.number()]);
export const WeightedMobSchema = z.object({ mobId: IdSchema, weight: z.number().positive() });

export const ClassIdSchema = z.enum(['warrior', 'mage', 'archer', 'assassin']);
export type ClassId = z.infer<typeof ClassIdSchema>;

export type Vec2 = z.infer<typeof Vec2Schema>;
export type Rect = z.infer<typeof RectSchema>;
