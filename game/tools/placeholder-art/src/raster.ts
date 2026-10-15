/** 最小的 RGBA 像素畫布，給測試美術用。座標一律取整。 */

export type RGBA = readonly [number, number, number, number];

export function hex(color: string, alpha = 255): RGBA {
  const value = color.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) : alpha,
  ];
}

export function shade(color: RGBA, factor: number): RGBA {
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return [f(color[0]), f(color[1]), f(color[2]), color[3]];
}

export class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3]! : 0;
  }

  set(x: number, y: number, color: RGBA): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inside(x, y) || color[3] === 0) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = color[0];
    this.data[i + 1] = color[1];
    this.data[i + 2] = color[2];
    this.data[i + 3] = color[3];
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGBA): void {
    x = Math.round(x);
    y = Math.round(y);
    for (let yy = y; yy < y + Math.round(h); yy += 1) {
      for (let xx = x; xx < x + Math.round(w); xx += 1) this.set(xx, yy, color);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: RGBA): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  /** 粗線：沿 Bresenham 每點畫一個 width × width 的方塊。 */
  line(x0: number, y0: number, x1: number, y1: number, color: RGBA, width = 1): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const half = Math.floor((width - 1) / 2);
    for (;;) {
      this.fillRect(x0 - half, y0 - half, width, width, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** 填滿多邊形（偶奇規則）。 */
  fillPolygon(points: readonly (readonly [number, number])[], color: RGBA): void {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i]!;
        const [bx, by] = points[(i + 1) % points.length]!;
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
          xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]! - 0.5); x <= Math.floor(xs[i + 1]! - 0.5); x += 1) this.set(x, y, color);
      }
    }
  }

  /** 在不透明像素外圍加 1 像素描邊（不覆蓋原本的像素）。 */
  outline(color: RGBA): void {
    const marks: [number, number][] = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.alpha(x, y) > 0) continue;
        if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.set(x, y, color);
  }

  /** 疊上另一張畫布（只複製不透明像素）。 */
  draw(source: Canvas, ox: number, oy: number, flipX = false): void {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const color = source.get(flipX ? source.width - 1 - x : x, y);
        if (color[3] > 0) this.set(ox + x, oy + y, color);
      }
    }
  }

  /** 不透明像素的邊界；全透明時回傳 null。 */
  bounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.alpha(x, y) === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  crop(x: number, y: number, w: number, h: number): Canvas {
    const out = new Canvas(w, h);
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) out.set(xx, yy, this.get(x + xx, y + yy));
    }
    return out;
  }
}
