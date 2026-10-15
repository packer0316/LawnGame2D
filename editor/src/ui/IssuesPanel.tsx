import { useEffect, useRef } from 'react';
import { useStudio } from '../state/studio';

export function IssuesPanel() {
  const open = useStudio((s) => s.issuesOpen);
  const issues = useStudio((s) => s.issues);
  const ref = useRef<HTMLDivElement>(null);

  // 點面板外面就關閉，避免蓋住下方的按鈕
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest('[data-issues-toggle]')) return;
      useStudio.setState({ issuesOpen: false });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  if (!open || issues.length === 0) return null;
  return (
    <div className="issues" ref={ref}>
      <div className="panel-title">
        驗證結果
        <span className="spacer" />
        <button className="small" onClick={() => useStudio.setState({ issuesOpen: false })}>
          關閉
        </button>
      </div>
      {issues.map((issue, i) => (
        <div
          key={i}
          className="issue"
          onClick={() =>
            useStudio.setState({
              page: issue.page,
              focus: issue.target ? { page: issue.page, target: issue.target } : null,
            })
          }
        >
          <span className={`sev-${issue.severity}`}>{issue.severity === 'error' ? '錯誤' : '警告'}</span>
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}
