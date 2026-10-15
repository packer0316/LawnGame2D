// Original pixel letterforms; rebuild the PNG and BMFont metrics from this editable source.
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
const glyphs = {
  '0': ['0111110','1100011','1100111','1101111','1111011','1110011','1100011','1100011','0111110'],
  '1': ['0011100','0111100','1111100','0011100','0011100','0011100','0011100','0011100','1111111'],
  '2': ['0111110','1100011','0000011','0000110','0001100','0011000','0110000','1100000','1111111'],
  '3': ['1111110','0000011','0000011','0000110','0011110','0000011','0000011','1100011','0111110'],
  '4': ['0001110','0011110','0110110','1100110','1100110','1111111','0000110','0000110','0000110'],
  '5': ['1111111','1100000','1100000','1111110','0000011','0000011','0000011','1100011','0111110'],
  '6': ['0011110','0110000','1100000','1111110','1100011','1100011','1100011','1100011','0111110'],
  '7': ['1111111','0000011','0000110','0001100','0011000','0011000','0110000','0110000','0110000'],
  '8': ['0111110','1100011','1100011','1100011','0111110','1100011','1100011','1100011','0111110'],
  '9': ['0111110','1100011','1100011','1100011','0111111','0000011','0000011','0000110','0111100'],
  'C': ['0111111','1100000','1100000','1100000','1100000','1100000','1100000','1100000','0111111'],
  'O': ['0111110','1100011','1100011','1100011','1100011','1100011','1100011','1100011','0111110'],
  'M': ['1100011','1110111','1111111','1111111','1101011','1100011','1100011','1100011','1100011'],
  'B': ['1111110','1100011','1100011','1100011','1111110','1100011','1100011','1100011','1111110'],
  '+': ['0000000','0011000','0011000','0011000','1111110','1111110','0011000','0011000','0000000'],
};
const chars = Object.keys(glyphs), cellW = 96, cellH = 128, width = 768, height = 256;
const metrics = { width, height, lineHeight: cellH, glyphs: {} };
const defs = `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffef2"/><stop offset=".38" stop-color="#fff6bd"/><stop offset=".43" stop-color="#ffc84b"/><stop offset=".78" stop-color="#ffab28"/><stop offset="1" stop-color="#ed7018"/></linearGradient><filter id="edge" x="-40%" y="-40%" width="180%" height="200%"><feMorphology in="SourceAlpha" operator="dilate" radius="5" result="outline"/><feOffset in="outline" dx="0" dy="5" result="shadow"/><feFlood flood-color="#081b2d"/><feComposite in2="shadow" operator="in" result="dark"/><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="rim"/><feFlood flood-color="#fff1a9"/><feComposite in2="rim" operator="in" result="light"/><feMerge><feMergeNode in="dark"/><feMergeNode in="light"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const shapes = chars.map((char, i) => {
  const x = i % 8 * cellW, y = Math.floor(i / 8) * cellH;
  metrics.glyphs[char] = { x, y, width: cellW, height: cellH, xadvance: 76 };
  const path = glyphs[char].flatMap((row, ry) => [...row].flatMap((bit, rx) => bit === '1' ? [`M${rx*9} ${ry*9}h9v9h-9z`] : [])).join('');
  return `<g transform="translate(${x+24} ${y+17}) skewX(-10)"><path d="${path}" fill="url(#gold)" filter="url(#edge)"/></g>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${shapes}</svg>`;
const dir = new URL('../assets/ui/combo/', import.meta.url); await fs.mkdir(dir, { recursive: true });
await fs.writeFile(new URL('combo-gold-v1.svg', dir), svg);
await fs.writeFile(new URL('combo-gold-v1.json', dir), JSON.stringify(metrics, null, 2));
const fnt = `<?xml version="1.0"?>\n<font><info face="Lawn Combo Gold" size="96" bold="1" italic="1" unicode="1" stretchH="100" smooth="1" aa="1" padding="0,0,0,0" spacing="0,0"/><common lineHeight="128" base="105" scaleW="${width}" scaleH="${height}" pages="1" packed="0"/><pages><page id="0" file="combo-gold-v1.png"/></pages><chars count="${chars.length}">${chars.map(c => { const g = metrics.glyphs[c]; return `<char id="${c.charCodeAt(0)}" x="${g.x}" y="${g.y}" width="96" height="128" xoffset="0" yoffset="0" xadvance="76" page="0" chnl="15"/>`; }).join('')}</chars></font>\n`;
await fs.writeFile(new URL('combo-gold-v1.fnt', dir), fnt);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async ({ svg, width, height }) => {
    const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(svg); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  }, { svg, width, height });
  await fs.writeFile(new URL('combo-gold-v1.png', dir), Buffer.from(png, 'base64'));
} finally { await browser.close(); }
console.log('Built 15 original combo glyphs: PNG / BMFont / JSON / SVG');
