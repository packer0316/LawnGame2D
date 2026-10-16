import { useEffect, useState } from 'react';
import type { LoadingProgress } from '@lawn/engine';
import artwork from '../../assets/loading/rare-beasts-v2.webp?url';
import { Icon } from './Icons';
import './loading.css';

export function LoadingScreen({ progress, error }: { progress?: LoadingProgress | null; error?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(timer);
  }, [progress?.stage, progress?.percent, progress?.loaded]);
  const percent = progress?.percent ?? 0;
  return <section className="loading-screen" aria-label="遊戲載入" aria-busy={!error}>
    <img className="loading-art" src={artwork} alt="森境旅人與白薔薇鹿衛、夜花斗篷狐、月芽兔、星露水母、彗尾星魟及望遠鏡貓一同冒險" fetchPriority="high" />
    <div className="loading-shade" />
    <header className="loading-brand"><Icon name="leaf" /><div><strong>森境</strong><span>LAWN / ADVENTURE</span></div></header>
    <div className="loading-content">
      <span className="loading-eyebrow">奇遇，從這裡開始</span>
      <div className="loading-heading"><h1>{error ? '旅途暫時中斷' : '正在走進森境'}</h1><span className="loading-percent">{percent}<small>%</small></span></div>
      <div className={`loading-track${error ? ' is-error' : ''}`} role="progressbar" aria-label="整體載入進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%，${progress?.stage ?? '準備下載'}`}>
        <div className="loading-fill" style={{ width: `${percent}%` }} />
      </div>
      {error ? <div className="loading-error" role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>重新載入</button></div> : <>
        <div className="loading-status"><span role="status">{progress?.stage ?? '準備下載冒險資源'}<span className="loading-dots" aria-hidden="true">…</span></span><span>{progress && progress.total > 0 ? `本批 ${progress.loaded} / ${progress.total}` : '連接森境中'}</span></div>
        <p className="loading-hint">{slow ? '仍在下載中，首次進入需要較多時間，請稍候。' : '循著晨光，與森境裡的珍奇異獸相遇。'}</p>
      </>}
    </div>
    <footer className="loading-footer">晨光森林 <span>◆</span> 森境旅人</footer>
  </section>;
}
