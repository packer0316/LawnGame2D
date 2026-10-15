/** HUD 使用同一套細線圖示，避免不同平台的 emoji 破壞整體風格。 */
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    leaf: <><path d="M19 4C8 3 3 8 5 15s15 5 14-11Z"/><path d="m4 21 11-12M9 16l-1-5m5 1 4 1"/></>,
    warrior: <><path d="m5 19 3-3m-2-3 5 5M9 14 18 4l2 1-1 3-9 9M3 21l3-1-2-2Z"/></>,
    mage: <><path d="m5 21 9-12M14 2l1.5 4L20 7l-4 2-1 4-2-4-4-1 4-2ZM4 4v4M2 6h4"/></>,
    archer: <><path d="M6 3c16 4 16 14 0 18L10 12ZM3 12h18m-4-3 4 3-4 3"/></>,
    assassin: <><path d="m13 2 2 7 7 2-7 3-2 8-3-7-8-2 7-3Z"/><circle cx="12" cy="12" r="2"/></>,
    coin: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="m12 8 3 4-3 4-3-4Z"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m16 7-2 7-7 3 3-7Z"/></>,
    spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/></>,
    play: <path d="m9 6 9 6-9 6Z"/>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}
