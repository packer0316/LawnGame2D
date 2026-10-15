/** 編輯器全域狀態：專案、目前頁面、狀態列訊息、驗證結果。 */
import { create } from 'zustand';
import type { ContentSource } from '@lawn/engine';
import type { ProjectFs } from '../fs/projectFs';
import type { Issue, PageId } from './validation';

export interface StudioState {
  fs: ProjectFs | null;
  content: (ContentSource & { revokeAll(): void }) | null;
  page: PageId;
  status: { text: string; kind: 'info' | 'error' | 'ok' };
  issues: Issue[];
  issuesOpen: boolean;
  /** 遊戲引擎是否載入成功（game/ 尚未 npm install 時會失敗）。 */
  engineError: string | null;
  /** 各頁面的選取目標（由驗證面板跳轉時設定）。 */
  focus: { page: PageId; target: string } | null;
  /** content/ 的素材（sheet、圖片）有更新時遞增；頁面據此重新掃描、重新載圖。 */
  contentVersion: number;
}

export const useStudio = create<StudioState>(() => ({
  fs: null,
  content: null,
  page: 'map',
  status: { text: '請開啟專案資料夾', kind: 'info' },
  issues: [],
  issuesOpen: false,
  engineError: null,
  focus: null,
  contentVersion: 0,
}));

export function setStatus(text: string, kind: StudioState['status']['kind'] = 'info'): void {
  useStudio.setState({ status: { text, kind } });
}

export function setPage(page: PageId): void {
  useStudio.setState({ page });
}
