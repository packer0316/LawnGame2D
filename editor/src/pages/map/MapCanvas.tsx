import type { MapDef } from '@lawn/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '../../state/studio';
import { footholdUnder, footholdYAt } from '../../map/geometry';
import { applyNavEdits, navEditsPath } from '../../map/navEdits';
import type { NavEdits } from '../../map/navEdits';
import { useDoc } from '../../state/docs';
import { drawMap, hitTest, hitTestNav, prerenderTiles } from './renderMap';
import type { View } from './renderMap';
import { updateNavEdits, useMapPage } from './mapStore';

type Img = ImageBitmap;

/** 依專案路徑載入圖片（快取）。 */
const imageCache = new Map<string, Promise<Img | null>>();
function loadImage(path: string): Promise<Img | null> {
  let p = imageCache.get(path);
  if (!p) {
    const fs = useStudio.getState().fs;
    p = fs
      ? fs
          .readFile(path)
          .then((blob) => createImageBitmap(blob))
          .catch(() => null)
      : Promise.resolve(null);
    imageCache.set(path, p);
  }
  return p;
}

export function clearMapImageCache(): void {
  imageCache.clear();
}

export function MapCanvas({ map, onCursor }: { map: MapDef; onCursor?: (pos: [number, number] | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useMapPage((s) => s.layers);
  const selection = useMapPage((s) => s.selection);
  const tilesetSources = useMapPage((s) => s.tilesetSources);
  const navTool = useMapPage((s) => s.navTool);
  const navDraft = useMapPage((s) => s.navDraft);
  const edits = useDoc<NavEdits>(navEditsPath(map.id))?.data;
  const manualNav = useMemo(() => applyNavEdits(map, { nodes: [], edges: [] }, edits ? { ...edits, remove: [] } : undefined).manual, [map, edits]);
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [images, setImages] = useState<Map<string, Img>>(new Map());

  // tileset 圖：優先用 LDtk 引用的原圖，其次 content/
  useEffect(() => {
    let cancelled = false;
    const paths = new Set([...map.tileLayers.map((l) => l.tileset), ...map.decors.map((d) => d.tileset)]);
    Promise.all(
      [...paths].map(async (p) => [p, (await loadImage(tilesetSources[p] ?? `content/${p}`)) ?? (await loadImage(`content/${p}`))] as const),
    ).then((entries) => {
      if (!cancelled) setImages(new Map(entries.filter((e): e is [string, Img] => e[1] !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [map, tilesetSources]);

  const tiles = useMemo(
    () => ({ back: prerenderTiles(map, images, 'back'), front: prerenderTiles(map, images, 'front') }),
    [map, images],
  );

  // 尺寸
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 換地圖時縮放到整張地圖
  const fitKey = `${map.id}:${map.size.w}x${map.size.h}:${size.w}x${size.h}`;
  useEffect(() => {
    if (size.w === 0) return;
    const scale = Math.max(0.25, Math.min((size.w - 40) / map.size.w, (size.h - 80) / map.size.h, 4));
    setView({ scale, ox: (size.w - map.size.w * scale) / 2, oy: (size.h - map.size.h * scale) / 2 + 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // 繪製
  useEffect(() => {
    const c = canvas.current;
    if (!c || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d')!;
    drawMap(ctx, map, { scale: view.scale * dpr, ox: view.ox * dpr, oy: view.oy * dpr }, layers, tiles, selection, { manualNav, navDraft });
  }, [map, view, size, layers, tiles, selection, manualNav, navDraft]);

  const toMap = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.ox) / view.scale, (e.clientY - r.top - view.oy) / view.scale];
  };

  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  return (
    <div ref={host} className="canvas-host">
      <canvas
        ref={canvas}
        onWheel={(e) => {
          const r = canvas.current!.getBoundingClientRect();
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
          const scale = Math.max(0.1, Math.min(16, view.scale * factor));
          setView({ scale, ox: mx - ((mx - view.ox) * scale) / view.scale, oy: my - ((my - view.oy) * scale) / view.scale });
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
        }}
        onPointerMove={(e) => {
          onCursor?.(toMap(e).map(Math.round) as [number, number]);
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) setView((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const [x, y] = toMap(e);
            const px = 1 / view.scale;
            if (layers.nav && navTool === 'add') {
              addNavPoint(map, x, y, px);
              return;
            }
            const navHit = layers.nav ? hitTestNav(map, x, y, px) : null;
            useMapPage.setState({ selection: navHit ?? hitTest(map, x, y, layers, px) });
          }
        }}
        onPointerLeave={() => onCursor?.(null)}
        style={{ cursor: 'crosshair' }}
      />
    </div>
  );
}

/** 新增導航連線：第一下點起點足場、第二下點終點足場。 */
function addNavPoint(map: MapDef, x: number, y: number, px: number) {
  const fh = footholdUnder(map, x, y, Math.max(8, 10 * px));
  if (!fh) {
    useMapPage.setState({ navDraft: null });
    return;
  }
  const point: [number, number] = [Math.round(x), Math.round(footholdYAt(fh, x) ?? y)];
  const { navDraft, navAddType } = useMapPage.getState();
  if (!navDraft) {
    useMapPage.setState({ navDraft: point });
    return;
  }
  const from = navDraft;
  useMapPage.setState({ navDraft: null });
  const dir = Math.sign(point[0] - from[0]) as -1 | 0 | 1;
  void updateNavEdits(map.id, (e) => ({ ...e, add: [...e.add, { from, to: point, type: navAddType, dir }] }), '新增導航連線');
}