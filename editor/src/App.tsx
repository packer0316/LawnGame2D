import { useEffect, useState } from 'react';
import { isFsaSupported, openDevProject, openProject, pickProject, restoreLastProject } from './state/project';
import { useStudio } from './state/studio';
import { Shell } from './ui/Shell';

export function App() {
  const fs = useStudio((s) => s.fs);
  return fs ? <Shell /> : <Welcome />;
}

function Welcome() {
  const [last, setLast] = useState<FileSystemDirectoryHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('devfs')) {
      openDevProject()
        .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)))
        .finally(() => setBusy(false));
      return;
    }
    if (!isFsaSupported()) {
      setBusy(false);
      return;
    }
    restoreLastProject()
      .then(setLast)
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  }, []);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    fn()
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="welcome">
      <div className="card">
        <h1>LawnStudio</h1>
        <p>
          LawnGame2D 的造型製作系統：把 Aseprite 與 LDtk 的素材變成遊戲資料。
          <br />
          請選擇專案根目錄（包含 <span className="mono">content/</span>、<span className="mono">art/</span> 的那一層）。
        </p>
        {!isFsaSupported() ? (
          <p className="error">這個瀏覽器不支援 File System Access API，請使用 Chrome 或 Edge。</p>
        ) : (
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => run(pickProject)}>
              開啟專案資料夾…
            </button>
            {last && (
              <button disabled={busy} onClick={() => run(() => openProject(last))}>
                重新開啟「{last.name}」
              </button>
            )}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
