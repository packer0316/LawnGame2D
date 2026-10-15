import scrolls from '../../assets/inventory/scrolls-v2.png?url';
import charge from '../../assets/inventory/forge-charge-sequence-v2.png?url';
import success from '../../assets/inventory/forge-success-sequence-v2.png?url';
import failure from '../../assets/inventory/forge-failure-sequence-v2.png?url';

export const SCROLL_ART = scrolls;
export const FORGE_ART = { charge, success, failure };
export const FORGE_CHARGE_MS = 2640;
export const FORGE_RESULT_MS = 1560;
export const FORGE_FRAMES = 12;
let loading: Promise<void> | undefined;
/** Preload every possible outcome equally, so loading never signals the result. */
export function preloadForgeArt(): Promise<void> {
  return loading ??= Promise.all([scrolls, ...Object.values(FORGE_ART)].map(src => new Promise<void>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('刻印素材載入失敗')); image.src = src;
  }))).then(() => undefined).catch(error => { loading = undefined; throw error; });
}
