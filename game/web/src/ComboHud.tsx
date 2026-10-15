import type { CSSProperties } from 'react';
import type { HudState } from '@lawn/engine';
import atlas from '../../assets/ui/combo/combo-gold-v1.png?url';
import fontSource from '../../assets/ui/combo/combo-gold-v1.fnt?raw';
import './combo.css';

// Use the shipped BMFont metrics, so the same atlas works in Phaser or this screen-space HUD.
const font = new DOMParser().parseFromString(fontSource, 'application/xml');
const common = font.querySelector('common')!;
const line = Number(common.getAttribute('lineHeight'));
const glyphs = new Map([...font.querySelectorAll('char')].map(el => [String.fromCharCode(Number(el.getAttribute('id'))),
  Object.fromEntries(['x', 'y', 'width', 'height', 'xadvance'].map(key => [key, Number(el.getAttribute(key))]))]));
function BitmapWord({ text, className }: { text: string; className: string }) {
  return <span className={`combo-bitmap ${className}`} aria-hidden="true">{[...text].map((char, i) => {
    const g = glyphs.get(char)!;
    return <i key={i} data-glyph={char} style={{ width: `${g.width! / line}em`, height: `${g.height! / line}em`, marginRight: i < text.length - 1 ? `${(g.xadvance! - g.width!) / line}em` : 0,
      backgroundImage: `url("${atlas}")`, backgroundSize: `${Number(common.getAttribute('scaleW')) / line}em ${Number(common.getAttribute('scaleH')) / line}em`, backgroundPosition: `${-g.x! / line}em ${-g.y! / line}em` }} />;
  })}</span>;
}
export function ComboHud({ combo }: { combo: HudState['combo'] }) {
  if (!combo) return null;
  const tier = combo.count >= 100 ? 3 : combo.count >= 50 ? 2 : combo.count >= 10 ? 1 : 0;
  const ratio = combo.remainingMs / combo.windowMs;
  return <div className={`combo-hud combo-tier-${tier} ${ratio === 0 ? 'combo-expired' : ''} ${ratio < .25 ? 'combo-urgent' : ''}`}
    role="img" aria-label={`${combo.count} COMBO`} data-count={combo.count} data-remaining={combo.remainingMs}>
    <div className="combo-backlight" />
    <div key={combo.beat} className="combo-beat">
      <div className="combo-impact" />
      <BitmapWord text={String(combo.count)} className={`combo-number ${combo.count >= 1000 ? 'combo-number-long' : ''} ${combo.count >= 10000 ? 'combo-number-dense' : ''}`} />
      <BitmapWord text="COMBO" className="combo-word" />
      <div className="combo-sparks">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--spark-angle': `${i * 60 - 10}deg` } as CSSProperties} />)}</div>
    </div>
    <div className="combo-window" aria-hidden="true"><i style={{ transform: `scaleX(${ratio})` }} /></div>
  </div>;
}
