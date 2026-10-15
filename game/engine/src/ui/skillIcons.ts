/**
 * 技能圖示（24×24 細線 SVG 的內容），HUD 技能列使用。
 * 技能資料的 `icon` 欄位對應這裡的 key。
 */
export const SKILL_ICONS: Record<string, string> = {
  moonExecution: '<path d="M17 3A9 9 0 1 0 21 17 8 8 0 0 1 17 3Z"/><path d="m17 8 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>',
  whirl: '<path d="M12 4a8 8 0 1 1-7.4 5"/><path d="M12 8a4 4 0 1 1-3.6 2.3"/><path d="m3 6 1.6 3 3-1.4"/>',
  iaido: '<path d="M3 15h18"/><path d="m15 9 6 6-6 2"/><path d="M5 11h7"/>',
  quake: '<path d="M3 20h18"/><path d="m6 20 2-6 2 6m3 0 2-9 2 9"/><path d="M11 4v4m-3-2 3 2 3-2"/>',
  thrust: '<path d="M3 12h15"/><path d="m15 8 6 4-6 4"/><path d="M3 9v6"/>',
  rising: '<path d="M5 20C6 11 12 5 20 4"/><path d="m15 3 5 1-1 5"/>',
  wave: '<path d="M8 4c6 3 6 13 0 16"/><path d="M13 6c4 2.5 4 9.5 0 12"/><path d="M3 12h3"/>',
  bolt: '<path d="M13 2 5 14h6l-2 8 8-12h-6Z"/>',
  meteor: '<circle cx="15" cy="15" r="5"/><path d="m3 3 8 8M7 3l6 6M3 7l6 6"/>',
  blink: '<circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="3"/><path d="M9 12h1m2 0h1"/>',
  nova: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/>',
  chain: '<path d="M3 6l5 3-2 4 6 1-2 4 6 2"/>',
  pierce: '<path d="M2 12h17"/><path d="m16 8 5 4-5 4"/><path d="m4 9 3 3-3 3"/>',
  rain: '<path d="M6 3v10m6-8v12m6-10v10"/><path d="m4 11 2 2 2-2m2 4 2 2 2-2m2-4 2 2 2-2"/>',
  triple: '<path d="M3 6h12m-3-3 3 3-3 3"/><path d="M5 12h14m-3-3 3 3-3 3"/><path d="M3 18h12m-3-3 3 3-3 3"/>',
  flip: '<path d="M17 18A7 7 0 1 1 18 8"/><path d="M18 3v5h-5"/>',
  burst: '<path d="M3 12h9"/><circle cx="16" cy="12" r="3"/><path d="M16 5v2m0 10v2m7-7h-2"/>',
  fan: '<path d="m4 12 16-6M4 12h16M4 12l16 6"/>',
  shadow: '<path d="m4 4 16 16M20 4 4 20"/><circle cx="12" cy="12" r="2"/>',
  dash: '<path d="M3 8h8M2 12h10M3 16h8"/><path d="m14 6 7 6-7 6"/>',
  boomerang: '<path d="M5 19C5 10 10 5 19 5"/><path d="M5 19c3-1 6-4 7-7"/><path d="m16 2 3 3-3 3"/>',
  // 大絕招
  holy: '<path d="M12 2v13"/><path d="M8 15h8M12 15v6"/><path d="M5 6c2 4 2 8 0 12M19 6c-2 4-2 8 0 12"/>',
  swords: '<path d="M5 2v12M12 2v14M19 2v12"/><path d="M3 14h4M10 16h4M17 14h4"/><path d="M3 21h18"/>',
  meteors: '<circle cx="8" cy="15" r="3"/><circle cx="17" cy="17" r="2.5"/><path d="m2 3 4 9M8 3l7 11M15 3l4 11"/>',
  reaper: '<path d="M9 21V10a3 3 0 0 1 6 0v11"/><path d="M7 21h10"/><path d="M18 3v18"/><path d="M18 3c-5 0-9 2-11 5"/>',
  volley: '<path d="M4 20 14 4m-2 0h2v2"/><path d="M9 20 19 4m-2 0h2v2"/><path d="M14 20 22 8"/><path d="M2 20h20"/>',
  comet: '<circle cx="17" cy="12" r="3"/><path d="M2 8l12 3M2 12h12M2 16l12-3"/>',
  split: '<path d="m12 9 1.5 3L12 15l-1.5-3Z"/><path d="m4 4 3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/><circle cx="4" cy="4" r="1.5"/><circle cx="20" cy="4" r="1.5"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="20" r="1.5"/>',
  ninja: '<circle cx="12" cy="7" r="3"/><path d="M8 21l2-8h4l2 8"/><path d="M3 9l5 3M21 9l-5 3"/><path d="M2 17h4M18 17h4"/>',
};
