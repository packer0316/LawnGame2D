/**
 * 文件草稿：所有要寫進 content/ 的 JSON 都以「文件」管理。
 * - data：目前的草稿；saved：磁碟上的版本（undefined = 新檔）。
 * - 每次修改記一筆歷史，可復原／重做；連續輸入同一欄位會合併成一筆。
 * - batch() 把同時改多份文件的動作合成一筆歷史。
 * - 按「匯出」才寫入 content/（見 export.ts）。
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export interface DocEntry<T = unknown> {
  /** 相對 content/ 的路徑，例：maps/map_0001.json */
  path: string;
  data: T;
  saved: T | undefined;
}

interface Change {
  path: string;
  before: DocEntry | undefined;
  after: DocEntry | undefined;
}

interface Edit {
  changes: Change[];
  label: string;
  time: number;
}

export interface DocsState {
  docs: Record<string, DocEntry>;
  past: Edit[];
  future: Edit[];
}

const MERGE_MS = 1000;
const HISTORY_LIMIT = 200;

export const docsStore = createStore<DocsState>(() => ({ docs: {}, past: [], future: [] }));

export function useDocs<T>(selector: (state: DocsState) => T): T {
  return useStore(docsStore, selector);
}

/** selector 回傳陣列／物件時用這個（逐項比較），避免每次都產生新參照造成無限重繪。 */
export function useDocsShallow<T>(selector: (state: DocsState) => T): T {
  return useStore(docsStore, useShallow(selector));
}

export function useDoc<T>(path: string | null | undefined): DocEntry<T> | undefined {
  return useStore(docsStore, (s) => (path ? (s.docs[path] as DocEntry<T> | undefined) : undefined));
}

export function getDoc<T>(path: string): DocEntry<T> | undefined {
  return docsStore.getState().docs[path] as DocEntry<T> | undefined;
}

/** 從磁碟讀入（不記歷史）。草稿還原時傳入 draft。 */
export function loadDoc<T>(path: string, saved: T | undefined, draft?: T): void {
  docsStore.setState((s) => ({
    docs: { ...s.docs, [path]: { path, saved, data: draft !== undefined ? draft : (saved as T) } },
  }));
}

/** 進行中的 batch：同一個 batch 內的修改合成一筆歷史。 */
let pending: Edit | null = null;

function record(change: Change, label: string) {
  const state = docsStore.getState();
  const docs = { ...state.docs };
  if (change.after) docs[change.path] = change.after;
  else delete docs[change.path];

  if (pending) {
    const existing = pending.changes.find((c) => c.path === change.path);
    if (existing) existing.after = change.after;
    else pending.changes.push(change);
    docsStore.setState({ docs });
    return;
  }

  const now = Date.now();
  const last = state.past[state.past.length - 1];
  const only = last?.changes.length === 1 ? last.changes[0] : undefined;
  const merge = last && only && only.path === change.path && only.after && change.after && last.label === label && now - last.time < MERGE_MS;
  const past = merge
    ? [...state.past.slice(0, -1), { ...last, changes: [{ ...only, after: change.after }], time: now }]
    : [...state.past, { changes: [change], label, time: now }].slice(-HISTORY_LIMIT);
  docsStore.setState({ docs, past, future: [] });
}

/** 修改文件（記歷史）。updater 可以直接回傳新值。 */
export function editDoc<T>(path: string, next: T | ((current: T | undefined) => T), label = '修改'): void {
  const before = docsStore.getState().docs[path];
  const value = typeof next === 'function' ? (next as (c: T | undefined) => T)(before?.data as T | undefined) : next;
  if (before && Object.is(before.data, value)) return;
  deletedPaths.delete(path);
  record({ path, before, after: { path, saved: before?.saved, data: value } }, label);
}

/** 新增或整份取代文件（記歷史）。 */
export function putDoc<T>(path: string, data: T, label = '新增'): void {
  editDoc<T>(path, () => data, label);
}

/** 刪除文件（記歷史）；匯出時會刪除磁碟上的檔案。 */
export function deleteDoc(path: string, label = '刪除'): void {
  const before = docsStore.getState().docs[path];
  if (!before) return;
  record({ path, before, after: undefined }, label);
  deletedPaths.add(path);
}

/** 把 fn 內的所有修改合成一筆歷史（fn 必須是同步的）。 */
export function batch(label: string, fn: () => void): void {
  if (pending) {
    fn();
    return;
  }
  pending = { changes: [], label, time: Date.now() };
  try {
    fn();
  } finally {
    const edit = pending;
    pending = null;
    if (edit.changes.length > 0) {
      docsStore.setState((s) => ({ past: [...s.past, edit].slice(-HISTORY_LIMIT), future: [] }));
    }
  }
}

/** 被刪除、匯出時要從磁碟移除的檔案。 */
export const deletedPaths = new Set<string>();

function apply(path: string, entry: DocEntry | undefined) {
  docsStore.setState((s) => {
    const docs = { ...s.docs };
    if (entry) {
      docs[path] = { ...entry, saved: s.docs[path]?.saved ?? entry.saved };
      deletedPaths.delete(path);
    } else {
      delete docs[path];
      deletedPaths.add(path);
    }
    return { docs };
  });
}

export function undo(): string | null {
  const { past, future } = docsStore.getState();
  const edit = past[past.length - 1];
  if (!edit) return null;
  docsStore.setState({ past: past.slice(0, -1), future: [...future, edit] });
  for (const c of [...edit.changes].reverse()) apply(c.path, c.before);
  return edit.label;
}

export function redo(): string | null {
  const { past, future } = docsStore.getState();
  const edit = future[future.length - 1];
  if (!edit) return null;
  docsStore.setState({ past: [...past, edit], future: future.slice(0, -1) });
  for (const c of edit.changes) apply(c.path, c.after);
  return edit.label;
}

export function isDirty(entry: DocEntry | undefined): boolean {
  if (!entry) return false;
  return entry.saved === undefined || JSON.stringify(entry.data) !== JSON.stringify(entry.saved);
}

export function dirtyPaths(): string[] {
  return Object.values(docsStore.getState().docs)
    .filter(isDirty)
    .map((d) => d.path)
    .sort();
}

/** 匯出成功後：磁碟版本 = 目前草稿。 */
export function markSaved(path: string): void {
  docsStore.setState((s) => {
    const entry = s.docs[path];
    return entry ? { docs: { ...s.docs, [path]: { ...entry, saved: entry.data } } } : {};
  });
}

export function resetDocs(): void {
  deletedPaths.clear();
  pending = null;
  docsStore.setState({ docs: {}, past: [], future: [] });
}
