import { describe, expect, it } from 'vitest';
import { AutoReportRecorder } from './AutoReport';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe('掛機紀錄', () => {
  it('每秒記一點財產，掛機中曲線最後接上現在；停止後保留', () => {
    const rec = new AutoReportRecorder(null);
    rec.start(1000, 0);
    rec.sample(990, 400); // 不到 1 秒：只更新現值
    rec.sample(1200, 1000);
    rec.sample(800, 2500);
    const live = rec.view(2600)!;
    expect(live.running).toBe(true);
    expect(live.elapsedMs).toBe(2600);
    expect(live.points).toEqual([[0, 1000], [1000, 1200], [2500, 800], [2600, 800]]);
    expect([live.high, live.low]).toEqual([1200, 800]);
    rec.stop(850, '手動停止', 3000);
    const done = rec.view(99_000)!;
    expect(done.running).toBe(false);
    expect(done.elapsedMs).toBe(3000);
    expect(done.stopReason).toBe('手動停止');
    expect(done.points.at(-1)).toEqual([3000, 850]);
    // 停止後不再記錄
    rec.sample(5, 4000);
    rec.item('weapon', '木劍', 'weapon_0001', 4000);
    expect(rec.view(5000)!.items).toEqual([]);
  });

  it('同樣的掉落合併成 ×N，記下每次的時間', () => {
    const rec = new AutoReportRecorder(null);
    rec.start(0, 0);
    rec.item('scroll', '10% 武器卷軸', 'scroll-10', 100);
    rec.item('weapon', '木劍', 'weapon_0001', 200);
    rec.item('scroll', '10% 武器卷軸', 'scroll-10', 300);
    expect(rec.view(400)!.items).toEqual([
      { kind: 'scroll', name: '10% 武器卷軸', id: 'scroll-10', count: 2, times: [100, 300] },
      { kind: 'weapon', name: '木劍', id: 'weapon_0001', count: 1, times: [200] },
    ]);
  });

  it('6 小時內每秒一點；更長的掛機點數有上限，頭尾都保留', () => {
    const rec = new AutoReportRecorder(null);
    rec.start(0, 0);
    for (let t = 1000; t <= 3600_000; t += 1000) rec.sample(t / 1000, t);
    expect(rec.view(3600_000)!.points.length).toBe(3601 + 1);
    for (let t = 3601_000; t <= 8 * 3600_000; t += 1000) rec.sample(t / 1000, t);
    const view = rec.view(8 * 3600_000)!;
    expect(view.points.length).toBeLessThanOrEqual(21_602);
    expect(view.points[0]).toEqual([0, 0]);
    expect(view.points.at(-1)![1]).toBe(8 * 3600);
  });

  it('改金錢時整條曲線平移，不算輸贏', () => {
    const rec = new AutoReportRecorder(null);
    rec.start(100, 0);
    rec.sample(150, 1000);
    rec.shift(1000);
    const view = rec.view(1000)!;
    expect(view.startBalance).toBe(1100);
    expect(view.points.slice(0, 2)).toEqual([[0, 1100], [1000, 1150]]);
  });

  it('存在瀏覽器：重新整理還看得到；掛機中關掉頁面就當成停止', () => {
    const storage = new MemoryStorage();
    const rec = new AutoReportRecorder(storage);
    rec.start(500, 10_000);
    rec.item('weapon', '木劍', 'weapon_0001', 11_000);
    rec.sample(700, 12_000);
    rec.item('weapon', '木劍', 'weapon_0001', 13_000);
    const again = new AutoReportRecorder(storage).view(99_999)!;
    expect(again.running).toBe(false);
    expect(again.stopReason).toBe('頁面已關閉');
    expect(again.items[0]?.count).toBe(2);
    expect(again.elapsedMs).toBe(2000);
  });
});
