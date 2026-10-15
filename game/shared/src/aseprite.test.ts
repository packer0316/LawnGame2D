import { describe, expect, it } from 'vitest';
import { parseAsepriteSheet, tagFrameSequence } from './aseprite';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const frame = (filename: string, x: number) => ({
  filename,
  frame: rect(x, 0, 8, 8),
  rotated: false,
  trimmed: true,
  spriteSourceSize: rect(60, 112, 8, 8),
  sourceSize: { w: 128, h: 128 },
  duration: 100,
});

const raw = {
  frames: [frame('body|0', 0), frame('body|1', 8), frame('top|0', 16), frame('top|2', 24)],
  meta: {
    app: 'https://www.aseprite.org/',
    image: 'base.png',
    size: { w: 32, h: 8 },
    frameTags: [
      { name: 'stand', from: 0, to: 1, direction: 'forward' },
      { name: 'run', from: 2, to: 4, direction: 'pingpong' },
    ],
    slices: [
      {
        name: 'head',
        color: '#0000ffff',
        keys: [
          { frame: 2, bounds: rect(60, 40, 4, 4), pivot: { x: 2, y: 3 } },
          { frame: 0, bounds: rect(60, 50, 4, 4), pivot: { x: 2, y: 3 } },
        ],
      },
    ],
  },
};

describe('parseAsepriteSheet', () => {
  const sheet = parseAsepriteSheet(raw);

  it('依 {layer}|{frame} 拆出圖層與幀索引', () => {
    expect(sheet.layers).toEqual(['body', 'top']);
    expect(sheet.frame('body', 1)?.rect.x).toBe(8);
    expect(sheet.frame('top', 2)?.rect.x).toBe(24);
    expect(sheet.frame('top', 1)).toBeUndefined();
  });

  it('總幀數取 Tag 與幀索引的最大值', () => {
    expect(sheet.frameCount).toBe(5);
  });

  it('Slice 沿用該幀之前最近的 key', () => {
    expect(sheet.sliceAt('head', 1)?.bounds.y).toBe(50);
    expect(sheet.sliceAt('head', 3)?.bounds.y).toBe(40);
    expect(sheet.slicePivotAt('head', 4)).toEqual({ x: 62, y: 43 });
    expect(sheet.sliceAt('missing', 0)).toBeUndefined();
  });

  it('無法辨識的檔名依出現順序編號', () => {
    const plain = parseAsepriteSheet({ ...raw, frames: [frame('mob 0.aseprite', 0), frame('mob 1.aseprite', 8)] });
    expect(plain.layers).toEqual([null]);
    expect(plain.frame(null, 1)?.rect.x).toBe(8);
  });

  it('支援 json-hash 格式', () => {
    const hash = parseAsepriteSheet({
      ...raw,
      frames: { '0': { ...frame('', 0), filename: undefined }, '1': { ...frame('', 8), filename: undefined } },
    });
    expect(hash.frame(null, 1)?.rect.x).toBe(8);
  });
});

describe('tagFrameSequence', () => {
  it('展開各種播放方向', () => {
    expect(tagFrameSequence({ name: 'a', from: 2, to: 4, direction: 'forward' })).toEqual([2, 3, 4]);
    expect(tagFrameSequence({ name: 'a', from: 2, to: 4, direction: 'reverse' })).toEqual([4, 3, 2]);
    expect(tagFrameSequence({ name: 'a', from: 2, to: 5, direction: 'pingpong' })).toEqual([2, 3, 4, 5, 4, 3]);
    expect(tagFrameSequence({ name: 'a', from: 2, to: 4, direction: 'pingpong_reverse' })).toEqual([4, 3, 2, 3]);
  });
});
