import { SKILL_ICONS } from '@lawn/engine';

/** HUD 使用同一套細線圖示，避免不同平台的 emoji 破壞整體風格。技能圖示來自 engine 的 SKILL_ICONS（掉落方塊也用同一份）。 */
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const skill = SKILL_ICONS[name];
  if (skill) return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: skill }} />;
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
    plus: <path d="M5 12h14M12 5v14"/>,
    minus: <path d="M5 12h14"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    expand: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></>,
    collapse: <><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></>,
    bag: <><path d="M9 6V5a3 3 0 0 1 6 0v1"/><rect x="4" y="6" width="16" height="15" rx="4"/><path d="M4 12h16M10 12v2h4v-2"/></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
    gear: <><path d="M19.38 10.17L21.9 10.59L21.9 13.41L19.38 13.83L18.51 15.92L20 18L18 20L15.92 18.51L13.83 19.38L13.41 21.9L10.59 21.9L10.17 19.38L8.08 18.51L6 20L4 18L5.49 15.92L4.62 13.83L2.1 13.41L2.1 10.59L4.62 10.17L5.49 8.08L4 6L6 4L8.08 5.49L10.17 4.62L10.59 2.1L13.41 2.1L13.83 4.62L15.92 5.49L18 4L20 6L18.51 8.08Z"/><circle cx="12" cy="12" r="3.2"/></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}
