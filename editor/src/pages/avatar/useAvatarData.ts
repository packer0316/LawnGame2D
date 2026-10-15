import type { AvatarItem } from '@lawn/shared';
import { useEffect, useMemo, useState } from 'react';
import { AvatarRenderer } from '../../avatar/render';
import type { RenderPart, SheetImage } from '../../avatar/render';
import { loadSheet, useSheet } from '../../content/sheets';
import { useDocs } from '../../state/docs';
import { useStudio } from '../../state/studio';
import { BASE_SHEET, itemPath, useAvatarPage } from './avatarStore';

export function useBase(): { base: SheetImage | null; error: string | null } {
  const version = useAvatarPage((s) => s.version);
  const { data, error } = useSheet(BASE_SHEET, version);
  return { base: data, error };
}

/** 讀入多個武器（設定檔 + sheet）。 */
export function useParts(ids: string[]): { parts: RenderPart[]; errors: string[] } {
  const fs = useStudio((s) => s.fs);
  const version = useAvatarPage((s) => s.version);
  const key = ids.join(',');
  const itemsKey = useDocs((s) => ids.map((id) => JSON.stringify(s.docs[itemPath(id)]?.data ?? null)).join('\u0000'));
  const [state, setState] = useState<{ parts: RenderPart[]; errors: string[] }>({ parts: [], errors: [] });

  useEffect(() => {
    if (!fs) return;
    let cancelled = false;
    const items = ids.length === 0 ? [] : itemsKey.split('\u0000').map((j) => JSON.parse(j) as AvatarItem | null);
    Promise.all(
      items.map(async (item, i) => {
        if (!item) return { error: `${ids[i]} 尚未登錄` };
        try {
          const loaded = await loadSheet(fs, item.sheet);
          return { part: { item, sheet: loaded.sheet, image: loaded.image } satisfies RenderPart };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setState({
        parts: results.flatMap((r) => ('part' in r && r.part ? [r.part] : [])),
        errors: results.flatMap((r) => ('error' in r && r.error ? [r.error] : [])),
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, key, itemsKey, version]);
  return state;
}

export function useRenderer(base: SheetImage | null, parts: RenderPart[]) {
  return useMemo(() => (base ? new AvatarRenderer(base, parts) : null), [base, parts]);
}
