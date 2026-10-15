import { PIXEL_ICONS } from './skillArt';

/** CSS atlas sampling preserves the original raster and each cell's proportions. */
export function PixelIcon({ id }: { id: string }) {
  const art = PIXEL_ICONS[id];
  if (!art) return null;
  return <span className="pixel-icon" data-art={id} aria-hidden="true"><span style={{
    backgroundImage: `url("${art.url}")`,
    backgroundSize: `${art.sizeX}% ${art.sizeY}%`,
    backgroundPosition: `${art.positionX}% ${art.positionY}%`,
    width: `${Math.min(1, art.aspect) * 100}%`, height: `${Math.min(1, 1 / art.aspect) * 100}%`,
  }} /></span>;
}
