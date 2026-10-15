import { ThemeFileSchema, ThemeFileVersioned, contentPaths } from '@lawn/shared';
import type { MapDef, ThemeDef, ThemeFile } from '@lawn/shared';
import { useEffect, useRef, useState } from 'react';
import { docsStore, editDoc, useDoc } from '../../state/docs';
import { ensureDoc } from '../../state/project';
import { useStudio } from '../../state/studio';
import { registerValidator, zodIssues } from '../../state/validation';
import { Checkbox, ColorInput, Empty, Field, NumberInput, Section, Select, TextInput } from '../../ui/controls';
import { loadExistingMaps, mapIdsInDocs, mapPath } from './mapStore';

const PATH = contentPaths.themes;

registerValidator('themes', async ({ fs }) => {
  await ensureDoc(PATH, (raw) => ThemeFileVersioned.migrate(raw)).catch(() => undefined);
  await loadExistingMaps(fs);
  const docs = docsStore.getState().docs;
  const file = docs[PATH]?.data as ThemeFile | undefined;
  const maps = mapIdsInDocs(docs).map((id) => docs[mapPath(id)]!.data as MapDef);
  if (!file) {
    return maps.length > 0
      ? [{ severity: 'warning', page: 'map', message: `還沒有主題設定（${PATH}），地圖引用的主題：${[...new Set(maps.map((m) => m.theme))].join('、')}` }]
      : [];
  }
  const parsed = ThemeFileSchema.safeParse(file);
  if (!parsed.success) return zodIssues('map', PATH, parsed.error, 'themes');
  const ids = new Set(file.themes.map((t) => t.id));
  const issues = [];
  for (const m of maps) {
    if (!ids.has(m.theme)) issues.push({ severity: 'error' as const, page: 'map' as const, path: mapPath(m.id), target: m.id, message: `${m.id}：主題 ${m.theme} 不存在於 ${PATH}` });
  }
  const seen = new Set<string>();
  for (const t of file.themes) {
    if (seen.has(t.id)) issues.push({ severity: 'error' as const, page: 'map' as const, path: PATH, message: `主題 ID ${t.id} 重複` });
    seen.add(t.id);
  }
  return issues;
});

const newTheme = (id: string): ThemeDef => ({
  id,
  ambient: { color: '#ffffff', intensity: 1 },
  tileset: { image: 'tilesets/forest.png' },
  backgrounds: [],
});

function nextThemeId(themes: ThemeDef[]): string {
  let n = 1;
  while (themes.some((t) => t.id === `theme_${String(n).padStart(4, '0')}`)) n++;
  return `theme_${String(n).padStart(4, '0')}`;
}

/** 列出 content/ 某資料夾的 PNG（不含 _n 法線貼圖）。 */
function usePngList(dir: string): string[] {
  const fs = useStudio((s) => s.fs);
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    if (!fs) return;
    void fs.list(`content/${dir}`).then((entries) =>
      setList(entries.filter((e) => e.name.endsWith('.png') && !e.name.endsWith('_n.png')).map((e) => `${dir}/${e.name}`)),
    );
  }, [fs, dir]);
  return list;
}

export function ThemeEditor() {
  const doc = useDoc<ThemeFile>(PATH);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    ensureDoc(PATH, (raw) => ThemeFileVersioned.migrate(raw)).finally(() => setLoading(false));
  }, []);

  const file = doc?.data;
  const themes = file?.themes ?? [];
  const theme = themes[selected];
  const update = (fn: (t: ThemeDef) => ThemeDef, label: string) =>
    editDoc<ThemeFile>(PATH, (f) => ({ ...f!, themes: f!.themes.map((t, i) => (i === selected ? fn(t) : t)) }), label);

  if (loading) return <section className="canvas"><Empty>讀取中…</Empty></section>;

  return (
    <>
      <section className="canvas">
        {theme ? <ParallaxPreview theme={theme} /> : <Empty>選擇或新增主題</Empty>}
      </section>
      <aside className="props">
        <div className="panel-title">
          主題
          <span className="spacer" />
          {!file && (
            <button className="small" onClick={() => editDoc<ThemeFile>(PATH, { schemaVersion: 1, themes: [newTheme('theme_0001')] }, '建立主題檔')}>
              建立 themes.json
            </button>
          )}
          {file && (
            <button
              className="small"
              onClick={() => {
                editDoc<ThemeFile>(PATH, (f) => ({ ...f!, themes: [...f!.themes, newTheme(nextThemeId(f!.themes))] }), '新增主題');
                setSelected(themes.length);
              }}
            >
              ＋ 新增
            </button>
          )}
        </div>
        {themes.map((t, i) => (
          <div key={i} className={`tree-item ${i === selected ? 'selected' : ''}`} onClick={() => setSelected(i)}>
            <span className="mono">{t.id}</span>
            <span className="meta">{t.backgrounds.length} 層背景</span>
          </div>
        ))}
        {theme && <ThemeForm theme={theme} update={update} onDelete={() => {
          editDoc<ThemeFile>(PATH, (f) => ({ ...f!, themes: f!.themes.filter((_, i) => i !== selected) }), '刪除主題');
          setSelected(0);
        }} />}
      </aside>
      <div className="bottom">
        <span className="hint">拖動預覽畫面可以移動假鏡頭；背景依 rx／ry 視差移動。</span>
      </div>
    </>
  );
}

function ThemeForm({
  theme,
  update,
  onDelete,
}: {
  theme: ThemeDef;
  update: (fn: (t: ThemeDef) => ThemeDef, label: string) => void;
  onDelete: () => void;
}) {
  const tilesets = usePngList('tilesets');
  const backgrounds = usePngList('backgrounds');
  const withCurrent = (list: string[], v: string) => (list.includes(v) || !v ? list : [v, ...list]);
  const normalOf = (img: string) => contentPaths.normalMap(img);

  return (
    <>
      <Section title="基本" actions={<button className="small" onClick={onDelete}>刪除</button>}>
        <Field label="ID">
          <TextInput mono value={theme.id} onChange={(id) => update((t) => ({ ...t, id }), '主題 ID')} />
        </Field>
        <Field label="環境光顏色">
          <ColorInput value={theme.ambient.color} onChange={(color) => update((t) => ({ ...t, ambient: { ...t.ambient, color } }), '環境光')} />
        </Field>
        <Field label="環境光亮度">
          <NumberInput value={theme.ambient.intensity} min={0} step={0.05} onChange={(intensity) => update((t) => ({ ...t, ambient: { ...t.ambient, intensity } }), '環境光')} />
        </Field>
      </Section>
      <Section title="地形 tileset">
        <Field label="圖">
          <Select
            value={theme.tileset.image}
            options={withCurrent(tilesets, theme.tileset.image)}
            onChange={(image) => update((t) => ({ ...t, tileset: { image, normal: tilesets.length ? normalOf(image) : t.tileset.normal } }), 'tileset')}
          />
        </Field>
        <Field label="法線貼圖">
          <Checkbox
            checked={theme.tileset.normal !== undefined}
            label={theme.tileset.normal ?? '無'}
            onChange={(on) => update((t) => ({ ...t, tileset: { image: t.tileset.image, ...(on ? { normal: normalOf(t.tileset.image) } : {}) } }), '法線貼圖')}
          />
        </Field>
      </Section>
      <Section
        title="背景組（由遠到近）"
        actions={
          <button
            className="small"
            onClick={() =>
              update(
                (t) => ({
                  ...t,
                  backgrounds: [...t.backgrounds, { image: backgrounds[0] ?? 'backgrounds/bg.png', rx: 0.2, ry: 0.1, tileX: true, tileY: false, y: 0 }],
                }),
                '新增背景',
              )
            }
          >
            ＋ 圖層
          </button>
        }
      >
        {theme.backgrounds.length === 0 && <div className="hint">沒有背景圖層</div>}
        {theme.backgrounds.map((bg, i) => {
          const set = (patch: Partial<ThemeDef['backgrounds'][number]>, label = '背景') =>
            update((t) => ({ ...t, backgrounds: t.backgrounds.map((b, j) => (j === i ? { ...b, ...patch } : b)) }), label);
          const move = (d: number) =>
            update((t) => {
              const list = [...t.backgrounds];
              const [item] = list.splice(i, 1);
              list.splice(Math.max(0, Math.min(list.length, i + d)), 0, item!);
              return { ...t, backgrounds: list };
            }, '調整背景順序');
          return (
            <div key={i} style={{ borderTop: i ? '1px dashed var(--line)' : undefined, paddingTop: i ? 6 : 0, marginTop: i ? 6 : 0 }}>
              <Field label={`#${i + 1} 圖`}>
                <Select value={bg.image} options={withCurrent(backgrounds, bg.image)} onChange={(image) => set({ image, normal: bg.normal ? normalOf(image) : undefined })} />
              </Field>
              <Field label="視差 rx／ry" title="鏡頭移動 1 像素時背景移動的像素；0 = 固定、1 = 跟地圖一起動">
                <NumberInput value={bg.rx} step={0.05} onChange={(rx) => set({ rx })} />
                <NumberInput value={bg.ry} step={0.05} onChange={(ry) => set({ ry })} />
              </Field>
              <Field label="y 位置">
                <NumberInput value={bg.y} onChange={(y) => set({ y })} />
              </Field>
              <Field label="重複">
                <Checkbox checked={bg.tileX} onChange={(tileX) => set({ tileX })} label="水平" />
                <Checkbox checked={bg.tileY} onChange={(tileY) => set({ tileY })} label="垂直" />
              </Field>
              <Field label="自動捲動" title="每秒水平移動的像素；0 = 不捲動">
                <NumberInput value={bg.scrollX ?? 0} step={1} onChange={(scrollX) => set(scrollX === 0 ? { scrollX: undefined } : { scrollX })} />
              </Field>
              <Field label="法線貼圖">
                <Checkbox checked={bg.normal !== undefined} label={bg.normal ?? '無'} onChange={(on) => set({ normal: on ? normalOf(bg.image) : undefined })} />
              </Field>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="small" disabled={i === 0} onClick={() => move(-1)}>上移</button>
                <button className="small" disabled={i === theme.backgrounds.length - 1} onClick={() => move(1)}>下移</button>
                <button className="small" onClick={() => update((t) => ({ ...t, backgrounds: t.backgrounds.filter((_, j) => j !== i) }), '刪除背景')}>刪除</button>
              </div>
            </div>
          );
        })}
      </Section>
    </>
  );
}

/** 背景組視差預覽：拖動移動假鏡頭。 */
function ParallaxPreview({ theme }: { theme: ThemeDef }) {
  const fs = useStudio((s) => s.fs);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0 });
  const [images, setImages] = useState<Map<string, ImageBitmap>>(new Map());

  useEffect(() => {
    if (!fs) return;
    let cancelled = false;
    Promise.all(
      theme.backgrounds.map(async (b) => [b.image, await fs.readFile(`content/${b.image}`).then(createImageBitmap).catch(() => null)] as const),
    ).then((entries) => !cancelled && setImages(new Map(entries.filter((e): e is [string, ImageBitmap] => e[1] !== null))));
    return () => {
      cancelled = true;
    };
  }, [fs, theme.backgrounds]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const c = canvas.current;
      const h = host.current;
      if (c && h) {
        const scale = Math.max(1, Math.floor(h.clientHeight / 540));
        c.width = Math.ceil(h.clientWidth / scale);
        c.height = Math.ceil(h.clientHeight / scale);
        c.style.width = `${c.width * scale}px`;
        c.style.height = `${c.height * scale}px`;
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0c0b12';
        ctx.fillRect(0, 0, c.width, c.height);
        const t = (now - start) / 1000;
        for (const bg of theme.backgrounds) {
          const img = images.get(bg.image);
          if (!img) continue;
          const x0 = -cam.current.x * bg.rx + (bg.scrollX ?? 0) * t;
          const y0 = bg.y - cam.current.y * bg.ry;
          const xs = bg.tileX ? range(mod(x0, img.width) - img.width, c.width, img.width) : [x0];
          const ys = bg.tileY ? range(mod(y0, img.height) - img.height, c.height, img.height) : [y0];
          for (const x of xs) for (const y of ys) ctx.drawImage(img, Math.round(x), Math.round(y));
        }
        // 環境光：用 multiply 疊上顏色與亮度
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = theme.ambient.color;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = 'source-over';
        if (theme.ambient.intensity < 1) {
          ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, theme.ambient.intensity)})`;
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px monospace';
        ctx.fillText(`鏡頭 (${Math.round(cam.current.x)}, ${Math.round(cam.current.y)})`, 6, 14);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [theme, images]);

  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  return (
    <div
      ref={host}
      className="canvas-host"
      style={{ cursor: 'grab' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) cam.current = { x: d.cx - (e.clientX - d.x), y: d.cy - (e.clientY - d.y) };
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <canvas ref={canvas} />
      {theme.backgrounds.length === 0 && <Empty>這個主題沒有背景圖層</Empty>}
    </div>
  );
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v < end; v += step) out.push(v);
  return out;
}
