import { useEffect, useRef, useState } from 'react';
import { loadEngine } from '../engine';
import type { Engine } from '../engine';
import { setStatus } from '../state/studio';

/**
 * 引擎元件的方法呼叫一律包 try/catch：引擎內部錯誤（例如場景尚未建立就呼叫 update）
 * 只顯示在狀態列，不會讓整個編輯器的 React 樹崩潰。
 */
function guard<H extends object>(handle: H): H {
  return new Proxy(handle, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        try {
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        } catch (error) {
          setStatus(`遊戲引擎錯誤（${String(prop)}）：${error instanceof Error ? error.message : String(error)}`, 'error');
          return undefined;
        }
      };
    },
  });
}

/**
 * 掛載遊戲引擎元件（預覽或試玩）。mount 回傳 handle；deps 改變時重新建立。
 */
export function EngineView<H extends { destroy(): void }>({
  mount,
  deps,
  onHandle,
}: {
  mount: (engine: Engine, parent: HTMLElement) => H;
  deps: unknown[];
  onHandle?: (handle: H | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let handle: H | null = null;
    let cancelled = false;
    setError(null);
    loadEngine()
      .then((engine) => {
        if (cancelled || !host.current) return;
        try {
          handle = guard(mount(engine, host.current));
          onHandle?.(handle);
        } catch (e) {
          setError(`遊戲引擎建立失敗：${e instanceof Error ? e.message : String(e)}`);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      onHandle?.(null);
      handle?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <>
      <div ref={host} className="canvas-host" />
      {error && <div className="canvas-empty" style={{ color: 'var(--error)' }}>{error}</div>}
    </>
  );
}
