import type { Palette, PaletteFile, PaletteGroup } from '@lawn/shared';
import { Section, TextInput } from '../../ui/controls';
import { updatePalettes } from './avatarStore';

export const GROUP_LABEL: Record<PaletteGroup, string> = { skin: '膚色', hair: '髮色', eye: '瞳色', dye: '染色' };
const GROUPS: PaletteGroup[] = ['skin', 'hair', 'eye', 'dye'];

function nextPaletteId(file: PaletteFile): string {
  let n = 1;
  while (file.palettes.some((p) => p.id === `palette_${String(n).padStart(4, '0')}`)) n++;
  return `palette_${String(n).padStart(4, '0')}`;
}

function Swatch({ color, onChange, title }: { color: string; onChange: (c: string) => void; title?: string }) {
  return (
    <label title={title ?? color} style={{ display: 'inline-block', position: 'relative', width: 26, height: 26, border: '1px solid var(--line)', borderRadius: 3, background: color, cursor: 'pointer' }}>
      <input type="color" value={color.slice(0, 7)} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </label>
  );
}

/**
 * 調色盤（STUDIO_SPEC §4.5）：每個群組一組 Key 色階（部件底圖用的固定顏色），
 * 每個顏色選項提供同樣階數的目標色階。改 Key 色階的階數會同步增減該群組所有顏色的階數。
 */
export function PalettePanel({ file }: { file: PaletteFile | undefined }) {
  if (!file) {
    return (
      <div className="section">
        <div className="hint">還沒有調色盤（content/avatar/palettes.json）。</div>
        <button className="primary" style={{ marginTop: 8 }} onClick={() => updatePalettes((p) => p, '建立調色盤')}>
          建立調色盤
        </button>
      </div>
    );
  }
  const setKey = (g: PaletteGroup, ramp: string[]) =>
    updatePalettes(
      (f) => ({
        ...f,
        keyRamps: { ...f.keyRamps, [g]: ramp },
        palettes: f.palettes.map((p) =>
          p.group !== g ? p : { ...p, colors: ramp.map((k, i) => p.colors[i] ?? p.colors[p.colors.length - 1] ?? k) },
        ),
      }),
      `Key 色階 ${GROUP_LABEL[g]}`,
    );
  const setPalette = (id: string, fn: (p: Palette) => Palette, label: string) =>
    updatePalettes((f) => ({ ...f, palettes: f.palettes.map((p) => (p.id === id ? fn(p) : p)) }), label);

  return (
    <div style={{ padding: 12, display: 'grid', gap: 12 }}>
      {GROUPS.map((g) => {
        const ramp = file.keyRamps[g];
        const list = file.palettes.filter((p) => p.group === g);
        return (
          <div key={g} className="section" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
            <h4 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {GROUP_LABEL[g]}
              <span className="hint">（{ramp.length} 階）</span>
              <span style={{ flex: 1 }} />
              <button
                className="small"
                onClick={() =>
                  updatePalettes(
                    (f) => ({ ...f, palettes: [...f.palettes, { id: nextPaletteId(f), group: g, name: `新${GROUP_LABEL[g]}`, colors: [...f.keyRamps[g]] }] }),
                    `新增${GROUP_LABEL[g]}`,
                  )
                }
              >
                ＋ 顏色
              </button>
            </h4>
            <table className="grid" style={{ width: 'auto' }}>
              <tbody>
                <tr>
                  <th style={{ minWidth: 120 }}>Key 色階</th>
                  <td colSpan={2}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {ramp.map((c, i) => (
                        <Swatch key={i} color={c} title={`Key ${i + 1}：${c}`} onChange={(v) => setKey(g, ramp.map((x, j) => (j === i ? v : x)))} />
                      ))}
                      <button className="small" title="增加一階" onClick={() => setKey(g, [...ramp, ramp[ramp.length - 1] ?? '#808080'])}>
                        ＋
                      </button>
                      <button className="small" title="減少一階" disabled={ramp.length <= 1} onClick={() => setKey(g, ramp.slice(0, -1))}>
                        －
                      </button>
                    </div>
                  </td>
                </tr>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <TextInput value={p.name} onChange={(name) => setPalette(p.id, (x) => ({ ...x, name }), '顏色名稱')} />
                      <div className="hint mono">{p.id}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.colors.map((c, i) => (
                          <Swatch key={i} color={c} onChange={(v) => setPalette(p.id, (x) => ({ ...x, colors: x.colors.map((y, j) => (j === i ? v : y)) }), '色階')} />
                        ))}
                      </div>
                    </td>
                    <td>
                      <button className="small" onClick={() => updatePalettes((f) => ({ ...f, palettes: f.palettes.filter((x) => x.id !== p.id) }), '刪除顏色')}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 6 }}>
              Key 色階的顏色只能用在需要換{GROUP_LABEL[g]}的地方；同一張圖中不要用接近但不相同的顏色（規格檢查會抓出來）。
            </div>
          </div>
        );
      })}
    </div>
  );
}
