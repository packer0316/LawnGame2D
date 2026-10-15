import scrolls from '../../assets/inventory/scrolls-v2.png?url';

export const SCROLL_ART = scrolls;
export const FORGE_CHARGE_MS = 1050;
export const FORGE_RESULT_MS = 850;
let loading: Promise<void> | undefined;
/** The light fields are drawn locally; only the shared scroll artwork needs loading. */
export function preloadForgeArt(): Promise<void> {
  return loading ??= Promise.all([scrolls].map(src => new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('刻印素材載入失敗')); image.src = src;
  }))).then(() => undefined).catch(error => { loading = undefined; throw error; });
}
