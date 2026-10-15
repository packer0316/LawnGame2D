import { beforeEach, describe, expect, it, vi } from 'vitest';
import { batch, deleteDoc, deletedPaths, dirtyPaths, docsStore, editDoc, getDoc, loadDoc, markSaved, redo, resetDocs, undo } from './docs';

describe('docs', () => {
  beforeEach(() => {
    resetDocs();
    vi.useRealTimers();
  });

  it('載入的文件不是髒的；修改後是髒的；markSaved 後又不是', () => {
    loadDoc('rooms/rooms.json', { a: 1 });
    expect(dirtyPaths()).toEqual([]);
    editDoc<{ a: number }>('rooms/rooms.json', (d) => ({ a: d!.a + 1 }));
    expect(dirtyPaths()).toEqual(['rooms/rooms.json']);
    markSaved('rooms/rooms.json');
    expect(dirtyPaths()).toEqual([]);
  });

  it('復原與重做', () => {
    loadDoc('x.json', 1);
    editDoc('x.json', 2, 'a');
    editDoc('x.json', 3, 'b');
    expect(undo()).toBe('b');
    expect(getDoc('x.json')!.data).toBe(2);
    expect(undo()).toBe('a');
    expect(getDoc('x.json')!.data).toBe(1);
    expect(undo()).toBeNull();
    expect(redo()).toBe('a');
    expect(getDoc('x.json')!.data).toBe(2);
  });

  it('同一欄位連續修改合併成一筆歷史', () => {
    vi.useFakeTimers();
    loadDoc('x.json', 'a');
    editDoc('x.json', 'ab', '名稱');
    vi.advanceTimersByTime(200);
    editDoc('x.json', 'abc', '名稱');
    expect(docsStore.getState().past).toHaveLength(1);
    undo();
    expect(getDoc('x.json')!.data).toBe('a');
  });

  it('新修改會清掉重做堆疊', () => {
    loadDoc('x.json', 1);
    editDoc('x.json', 2, 'a');
    undo();
    editDoc('x.json', 5, 'c');
    expect(redo()).toBeNull();
  });

  it('刪除可以復原，並記錄要從磁碟移除的路徑', () => {
    loadDoc('x.json', 1);
    deleteDoc('x.json');
    expect(getDoc('x.json')).toBeUndefined();
    expect(deletedPaths.has('x.json')).toBe(true);
    undo();
    expect(getDoc('x.json')!.data).toBe(1);
    expect(deletedPaths.has('x.json')).toBe(false);
  });

  it('batch：同時改多份文件只記一筆歷史，一次復原', () => {
    loadDoc('a.json', 1);
    loadDoc('b.json', 1);
    batch('一起改', () => {
      editDoc('a.json', 2);
      editDoc('b.json', 3);
      editDoc('a.json', 4);
    });
    expect(docsStore.getState().past).toHaveLength(1);
    expect(undo()).toBe('一起改');
    expect([getDoc('a.json')!.data, getDoc('b.json')!.data]).toEqual([1, 1]);
    redo();
    expect([getDoc('a.json')!.data, getDoc('b.json')!.data]).toEqual([4, 3]);
  });

  it('新檔（沒有 saved）一律是髒的', () => {
    editDoc('new.json', { a: 1 }, '新增');
    expect(dirtyPaths()).toEqual(['new.json']);
  });
});
