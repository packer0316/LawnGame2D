/** Shared by all classes; outfits never contribute combat or resale modifiers. */
export const OUTFITS = [{
  id: 'ninja-1', name: '蒼影忍裝',
  description: '深靛交襟忍服、銀邊輕甲與蒼青雙尾飄帶。熟悉的森境旅人，換上輕捷俐落的新裝。',
}, {
  id: 'hood-1', name: '白隼刺客服',
  description: '象牙白尖簷兜帽、灰色半面巾與銀雕護臂，深褐束帶繫住分岔長衣，暗紅腰巾隨步伐揚起。帽影之下，仍是熟悉的琥珀眼神。',
}] as const;
export const OUTFIT_BY_ID = new Map<string, (typeof OUTFITS)[number]>(OUTFITS.map(outfit => [outfit.id, outfit]));
