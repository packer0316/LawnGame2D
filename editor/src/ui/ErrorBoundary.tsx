import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/** 頁面出錯時只影響該頁：顯示錯誤與「重新載入此頁」，草稿與其他頁面不受影響。 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('頁面錯誤', error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="canvas-empty">
        <div>
          <div style={{ color: 'var(--error)', marginBottom: 8 }}>這個頁面發生錯誤：{this.state.error.message}</div>
          <div className="hint" style={{ marginBottom: 12 }}>草稿沒有遺失，可以重新載入此頁或切換到其他頁面。</div>
          <button onClick={() => this.setState({ error: null })}>重新載入此頁</button>
        </div>
      </div>
    );
  }
}
