import { useEffect } from 'react';
import { pages } from '../pages/registry';
import { dirtyPaths, docsStore, isDirty, redo, undo, useDocs } from '../state/docs';
import { exportAll } from '../state/export';
import { setPage, setStatus, useStudio } from '../state/studio';
import { runValidators } from '../state/validation';
import { ErrorBoundary } from './ErrorBoundary';
import { IssuesPanel } from './IssuesPanel';

export async function validateNow(): Promise<void> {
  const { fs } = useStudio.getState();
  if (!fs) return;
  const issues = await runValidators({ fs, docs: docsStore.getState().docs });
  const errors = issues.filter((i) => i.severity === 'error').length;
  useStudio.setState({ issues, issuesOpen: issues.length > 0 });
  setStatus(
    issues.length === 0 ? '驗證通過' : `驗證：${errors} 個錯誤、${issues.length - errors} 個警告`,
    errors > 0 ? 'error' : 'ok',
  );
}

export async function exportNow(): Promise<void> {
  const { fs } = useStudio.getState();
  if (!fs) return;
  setStatus('匯出中…');
  try {
    const report = await exportAll(fs);
    useStudio.setState({ issues: report.issues, issuesOpen: !report.ok });
    if (!report.ok) {
      setStatus(`有 ${report.issues.filter((i) => i.severity === 'error').length} 個錯誤，未匯出`, 'error');
      return;
    }
    const n = report.written.length + report.deleted.length + report.assets.length;
    setStatus(n === 0 ? '沒有需要匯出的變更（已更新 manifest.json）' : `已匯出 ${n} 個檔案到 content/`, 'ok');
  } catch (error) {
    setStatus(`匯出失敗：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function doUndo() {
  const label = undo();
  setStatus(label ? `復原：${label}` : '沒有可復原的動作');
}

function doRedo() {
  const label = redo();
  setStatus(label ? `重做：${label}` : '沒有可重做的動作');
}

export function Shell() {
  const page = useStudio((s) => s.page);
  const status = useStudio((s) => s.status);
  const issues = useStudio((s) => s.issues);
  const fsName = useStudio((s) => s.fs?.name);
  const canUndo = useDocs((s) => s.past.length > 0);
  const canRedo = useDocs((s) => s.future.length > 0);
  const dirtyCount = useDocs((s) => Object.values(s.docs).filter(isDirty).length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void exportNow();
      } else if (!typing && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyPaths().length > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const Page = pages.find((p) => p.id === page)?.component;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">LawnStudio</span>
        <nav className="tabs">
          {pages.map((p) => (
            <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => setPage(p.id)}>
              {p.title}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <button title="復原 (Ctrl+Z)" disabled={!canUndo} onClick={doUndo}>
          ↶
        </button>
        <button title="重做 (Ctrl+Y)" disabled={!canRedo} onClick={doRedo}>
          ↷
        </button>
        <button data-issues-toggle onClick={() => void validateNow()}>
          驗證 {errors > 0 && <span className="badge error">{errors}</span>}
          {warnings > 0 && <span className="badge warning">{warnings}</span>}
        </button>
        <button className="primary" data-issues-toggle title="寫入 content/ (Ctrl+S)" onClick={() => void exportNow()}>
          匯出{dirtyCount > 0 ? `（${dirtyCount}）` : ''}
        </button>
      </header>
      <main style={{ minHeight: 0, display: 'grid', position: 'relative' }}>
        <ErrorBoundary resetKey={page}>{Page ? <Page /> : null}</ErrorBoundary>
      </main>
      <footer className="statusbar">
        <span className="mono">{fsName}</span>
        <span className={status.kind === 'error' ? 'error' : status.kind === 'ok' ? 'ok' : ''}>{status.text}</span>
        <span style={{ flex: 1 }} />
        {issues.length > 0 && (
          <button className="small" data-issues-toggle onClick={() => useStudio.setState((s) => ({ issuesOpen: !s.issuesOpen }))}>
            問題 {errors > 0 && <span className="badge error">{errors}</span>}
            {warnings > 0 && <span className="badge warning">{warnings}</span>}
          </button>
        )}
        <span>{dirtyCount > 0 ? `${dirtyCount} 份草稿未匯出` : '已全部匯出'}</span>
      </footer>
      <IssuesPanel />
    </div>
  );
}
