/**
 * 驗證：每個頁面註冊自己的檢查。錯誤擋匯出，警告不擋（STUDIO_SPEC §3）。
 */
import type { ProjectFs } from '../fs/projectFs';
import type { DocsState } from './docs';

export type PageId = 'avatar' | 'monster' | 'map' | 'rooms';

export interface Issue {
  severity: 'error' | 'warning';
  page: PageId;
  /** 相關的 content/ 路徑。 */
  path?: string;
  /** 頁面內的選取目標（點擊問題時跳過去）。 */
  target?: string;
  message: string;
}

export interface ValidationContext {
  fs: ProjectFs;
  docs: DocsState['docs'];
}

export type Validator = (ctx: ValidationContext) => Promise<Issue[]> | Issue[];

const validators = new Map<string, Validator>();

export function registerValidator(name: string, validator: Validator): void {
  validators.set(name, validator);
}

export async function runValidators(ctx: ValidationContext): Promise<Issue[]> {
  const results = await Promise.all(
    [...validators].map(async ([name, v]) => {
      try {
        return await v(ctx);
      } catch (error) {
        return [
          {
            severity: 'error' as const,
            page: 'map' as const,
            message: `驗證 ${name} 執行失敗：${error instanceof Error ? error.message : String(error)}`,
          },
        ];
      }
    }),
  );
  return results.flat().sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/** 把 zod 的錯誤轉成 Issue。 */
export function zodIssues(
  page: PageId,
  path: string,
  error: { issues: { path: PropertyKey[]; message: string }[] },
  target?: string,
): Issue[] {
  return error.issues.map((i) => ({
    severity: 'error',
    page,
    path,
    target,
    message: `${path}：${i.path.map(String).join('.') || '(根)'} ${i.message}`,
  }));
}
