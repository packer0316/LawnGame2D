/** 寬平台戰鬥區；樓層數包含地面。座標為 16px 格子。 */
export interface BattlePlatform {
  x0: number;
  len: number;
  row: number;
  role: 'main' | 'connector';
  solid: boolean;
}

export const PLATFORM_LAYOUT_NAMES = ['林冠雙廊', '雙庭高台', '三層中庭', '交錯露台', '雙翼上庭', '階地環廊'] as const;

/**
 * 房間寬度（格）：每房固定 90 格 = 1440px（SPEC §4.1）。
 * 使用者要「滿版又看得到頭尾」：一般寬螢幕扣掉 HUD 後畫面約 1440–1500 內部像素寬，
 * 整張地圖剛好在一個畫面內，兩端傳送點都看得到、不用捲動。
 */
export function roomWidth(_roomId: number): number {
  return 90;
}

/** 地圖切成幾個區段，每段各自一組平台構圖。一個畫面寬的地圖只用一組。 */
export function sectionCount(width: number): number {
  return width >= 172 ? 3 : width >= 120 ? 2 : 1;
}

/** 第 s 段用哪一種構圖：同一房的各段不重複。 */
export function sectionLayout(roomId: number, s: number): number {
  return (roomId - 1 + s * 2) % PLATFORM_LAYOUT_NAMES.length;
}

/**
 * 每個區段在六種完整構圖間變換，不隨機撒平台。中層、上層在整張圖同高，層距 128px，
 * 留出角色、怪物與招式空間；區段之間留空隙，靠地面與繩梯銜接。
 */
export function battlePlatforms(roomId: number, width: number, groundTop: readonly number[]): BattlePlatform[] {
  const middle = Math.min(...groundTop.slice(1, -1)) - 8;
  const upper = middle - 8;
  const result: BattlePlatform[] = [];
  const sections = sectionCount(width);
  const sectionWidth = width / sections;
  for (let s = 0; s < sections; s++) {
    const start = s * sectionWidth;
    const add = (left: number, right: number, row: number, role: BattlePlatform['role'] = 'main') => {
      const x0 = Math.max(5, Math.round(start + sectionWidth * left));
      const end = Math.min(width - 5, Math.round(start + sectionWidth * right));
      result.push({ x0, len: end - x0, row, role, solid: false });
    };
    switch (sectionLayout(roomId, s)) {
      case 0:
        add(0.17, 0.83, middle);
        add(0.09, 0.42, upper);
        add(0.58, 0.91, upper);
        add(0.46, 0.54, upper, 'connector');
        add(0.09, 0.15, middle + 3, 'connector');
        add(0.85, 0.91, middle + 3, 'connector');
        break;
      case 1:
        add(0.09, 0.42, middle);
        add(0.58, 0.91, middle);
        add(0.46, 0.54, middle, 'connector');
        add(0.31, 0.87, upper);
        break;
      case 2:
        add(0.08, 0.42, middle);
        add(0.58, 0.92, middle);
        add(0.46, 0.54, middle, 'connector');
        add(0.23, 0.77, upper);
        break;
      case 3:
        add(0.09, 0.65, middle);
        add(0.42, 0.91, upper);
        add(0.78, 0.86, middle, 'connector');
        add(0.30, 0.38, upper, 'connector');
        break;
      case 4:
        add(0.18, 0.82, middle);
        add(0.08, 0.40, upper);
        add(0.60, 0.92, upper);
        add(0.46, 0.54, upper, 'connector');
        break;
      case 5:
        add(0.12, 0.88, middle);
        add(0.08, 0.61, upper);
        add(0.68, 0.76, upper, 'connector');
        add(0.07, 0.15, middle + 4, 'connector');
        add(0.85, 0.93, middle + 4, 'connector');
        break;
    }
  }
  return result;
}
