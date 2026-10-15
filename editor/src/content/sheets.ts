/** 讀取 Aseprite 匯出的 sheet（JSON + PNG），依檔案修改時間快取；也提供像素資料給規格檢查。 */
import { parseAsepriteSheet, resolveSheetImage } from '@lawn/shared';
import type { AseSheet } from '@lawn/shared';
import { useEffect, useState } from 'react';
import { isNotFound, readJson } from '../fs/projectFs';
import type { ProjectFs } from '../fs/projectFs';
import { useStudio } from '../state/studio';

export interface LoadedSheet {
  path: string;
  sheet: AseSheet;
  image: ImageBitmap | null;
  imagePath: string;
  mtime: number | null;
}

const cache = new Map<string, Promise<LoadedSheet>>();
const mtimes = new Map<string, number | null>();

/** path 相對 content/。 */
export async function loadSheet(fs: ProjectFs, path: string): Promise<LoadedSheet> {
  const mtime = await fs.lastModified(`content/${path}`);
  if (mtimes.get(path) !== mtime) {
    mtimes.set(path, mtime);
    cache.set(
      path,
      (async () => {
        try {
          const sheet = parseAsepriteSheet(await readJson(fs, `content/${path}`));
          const imagePath = resolveSheetImage(path, sheet.image);
          const image = await fs
            .readFile(`content/${imagePath}`)
            .then((b) => createImageBitmap(b))
            .catch(() => null);
          return { path, sheet, image, imagePath, mtime };
        } catch (error) {
          throw new Error(isNotFound(error) ? `找不到 content/${path}` : `${path}：${error instanceof Error ? error.message : String(error)}`);
        }
      })(),
    );
  }
  return cache.get(path)!;
}

export function clearSheetCache(): void {
  cache.clear();
  mtimes.clear();
}

/** React：讀取 sheet，回傳 { data, error }。version 改變時重新檢查檔案。 */
export function useSheet(path: string | null | undefined, version = 0): { data: LoadedSheet | null; error: string | null } {
  const fs = useStudio((s) => s.fs);
  const [state, setState] = useState<{ data: LoadedSheet | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (!fs || !path) {
      setState({ data: null, error: null });
      return;
    }
    let cancelled = false;
    loadSheet(fs, path)
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((e: unknown) => !cancelled && setState({ data: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [fs, path, version]);
  return state;
}

/** 整張 sheet 圖的像素（RGBA）。 */
export function sheetPixels(image: ImageBitmap): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}
