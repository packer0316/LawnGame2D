import { describe, it, expect } from 'vitest';
import { parseAsepriteSheet } from '@lawn/shared';
import ninjaBase from '../../../assets/outfits/ninja/export/ninja-base.sheet.json';
import ninjaMotions from '../../../assets/outfits/ninja/export/ninja-motions.sheet.json';
import hoodBase from '../../../assets/outfits/hood/export/hood-base.sheet.json';
import hoodMotions from '../../../assets/outfits/hood/export/hood-motions.sheet.json';
import originalBase from '../../../../content/avatar/base.sheet.json';
import originalMotions from '../../../assets/verdant/motions/export/hero-motions.sheet.json';

describe('costume animation contracts', () => {
  for (const [label, raw, original] of [['ninja base',ninjaBase,originalBase],['ninja motions',ninjaMotions,originalMotions],['hood base',hoodBase,originalBase],['hood motions',hoodMotions,originalMotions]] as const) {
    it(`${label} covers the entire original timeline with identical timing and anchors`, () => {
      const sheet=parseAsepriteSheet(raw), reference=parseAsepriteSheet(original);
      expect([...sheet.tags]).toEqual([...reference.tags]);
      expect(sheet.frames.length).toBe(reference.frames.length);
      for (const frame of reference.frames) {
        const next=sheet.frame(frame.layer,frame.index)!;
        expect(next.durationMs).toBe(frame.durationMs);
        expect(next.sourceSize).toEqual({w:128,h:128});
        expect(next.sourceRect.x).toBeGreaterThan(0);
        expect(next.sourceRect.x+next.sourceRect.w).toBeLessThan(128);
        expect(next.sourceRect.y+next.sourceRect.h).toBeLessThan(128);
        for (const anchor of ['hand','torso','head','root']) expect(sheet.slicePivotAt(anchor,frame.index)).toEqual(reference.slicePivotAt(anchor,frame.index));
      }
    });
  }
});
