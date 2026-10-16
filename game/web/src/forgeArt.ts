import scrolls from '../../assets/inventory/loot-scrolls-v4.png?url';

export const SCROLL_ART = scrolls;
// Alpha bounds of v4, with a 2px margin. Crop each icon instead of displaying its atlas padding.
export const SCROLL_ART_VIEWS = { 10: '171 125 493 465', 60: '849 126 490 465', 90: '1552 126 482 465' } as const;
export const FORGE_CHARGE_MS = 1050;
export const FORGE_RESULT_MS = 850;
let loading: Promise<void> | undefined;
/** The light fields are drawn locally; only the shared scroll artwork needs loading. */
export function preloadForgeArt(): Promise<void> {
  return loading ??= Promise.all([scrolls].map(src => new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('刻印素材載入失敗')); image.src = src;
  }))).then(() => undefined).catch(error => { loading = undefined; throw error; });
}
