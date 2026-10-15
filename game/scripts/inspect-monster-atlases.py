"""Read atlas alpha only; emit frame metadata without changing any generated pixels."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets' / 'monsters'
results = {}
for path in sorted(root.glob('map_????-v1.png')):
    rgba = np.asarray(Image.open(path).convert('RGBA'))
    alpha = rgba[:, :, 3]
    h, w = alpha.shape
    density = (alpha > 100).sum(axis=1)
    smooth = np.convolve(density, np.ones(5) / 5, mode='same')
    rows = [0]
    for row in range(1, 8):
        lo, hi = round(h * row / 8 - h / 12), round(h * row / 8 + h / 12)
        # Find genuine transparent gutters, then choose the one nearest the expected row boundary.
        scores = smooth[lo:hi]
        candidates = np.flatnonzero(scores <= scores.min() + 1)
        cut = lo + int(min(candidates, key=lambda p: abs(lo + p - h * row / 8)))
        rows.append(cut)
    rows.append(h)
    frames = []
    source_columns = 7 if path.stem == 'map_0007-v1' else 6
    for row in range(8):
        top, bottom = rows[row:row+2]
        col_density = (alpha[top:bottom] > 100).sum(axis=0)
        cols = [0]
        for col in range(1, source_columns):
            lo, hi = round(w * col / source_columns - w / 50), round(w * col / source_columns + w / 50)
            candidates = np.flatnonzero(col_density[lo:hi] == col_density[lo:hi].min())
            cols.append(lo + int(min(candidates, key=lambda p: abs(lo + p - w * col / source_columns))))
        cols.append(w)
        selected = ([0, 1, 2, 3, 4, 6] if row % 2 == 0 else [0, 1, 2, 3, 5, 6]) if source_columns == 7 else range(6)
        for col in selected:
            left, right = cols[col:col+2]
            ys, xs = np.where(alpha[top:bottom, left:right] > 32)
            if len(xs) < 20:
                raise RuntimeError(f'{path.name} row {row} col {col}: missing sprite')
            x0, x1 = max(left, left+int(xs.min())-2), min(right, left+int(xs.max())+3)
            y0, y1 = max(top, top+int(ys.min())-2), min(bottom, top+int(ys.max())+3)
            frames.append({'x':x0,'y':y0,'w':x1-x0,'h':y1-y0})
    canvas = max(max(f['w'], f['h']) for f in frames) + 4
    results[path.stem.replace('-v1','')] = {'width':w,'height':h,'canvas':canvas,'sourceColumns':source_columns,'rows':rows,'frames':frames,
        'idleHeights':[max(frames[i*12]['h'],frames[i*12+1]['h']) for i in range(4)],
        'gutterDensity':[int(density[r]) for r in rows[1:-1]]}
out = root / 'atlas-layouts-v1.json'
out.write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps({key:{'size':[v['width'],v['height']],'frames':len(v['frames']),'gutters':v['gutterDensity']} for key,v in results.items()}))
