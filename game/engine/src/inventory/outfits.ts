/** Shared by all classes; outfits never contribute combat or resale modifiers. */
export const OUTFITS = [{
  id: 'ninja-1', name: '蒼影忍裝',
  description: '深靛交襟忍服、銀邊輕甲與蒼青雙尾飄帶。熟悉的森境旅人，換上輕捷俐落的新裝。',
}] as const;
export const OUTFIT_BY_ID = new Map<string, (typeof OUTFITS)[number]>(OUTFITS.map(outfit => [outfit.id, outfit]));
