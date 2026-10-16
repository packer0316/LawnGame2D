import { useEffect, useState } from 'react';

export type HudLayoutPreference = 'auto' | 'desktop' | 'mobile';
const STORAGE_KEY = 'lawn.ui.layout.v1';
const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1366px)';

/** 介面選擇保存在本機；自動模式同時判斷觸控裝置與可用寬度，支援手機橫放。 */
export function useHudLayout() {
  const [preference, setPreference] = useState<HudLayoutPreference>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'desktop' || saved === 'mobile' ? saved : 'auto';
    } catch { return 'auto'; }
  });
  const [compact, setCompact] = useState(() => matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = matchMedia(MOBILE_QUERY);
    const update = () => setCompact(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const change = (value: HudLayoutPreference) => {
    setPreference(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* 儲存受限時仍可在本次切換。 */ }
  };
  return { preference, change, mobile: preference === 'mobile' || (preference === 'auto' && compact) };
}
