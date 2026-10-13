#!/usr/bin/env node
/**
 * Regenerates every Plot Yangu raster brand asset from the SVGs in brand/:
 *   public/favicon.svg, plot.ico, icons/* (touch, PWA any+maskable, MS tiles, iOS splash), social/og-image.jpg
 *   assets/* (Capacitor icon + splash sources)  and  android/app/src/main/res/{mipmap-*,drawable*} (launcher + splash)
 * Needs the dev dependency `sharp`:  npm i  &&  npm run brand
 * Brand: Plot Yangu purple #7A3E8E · amber door #D9993A / #F5C983 · cream #FBF9F4 · ink #0B1210
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, 'brand', f), 'utf8');
const out = (...p) => { const f = path.join(ROOT, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };
const PURPLE = '#7A3E8E', CREAM = '#FBF9F4', INK = '#0B1210';

const icon = rd('plot-yangu-icon.svg');
const inner = icon.match(/<g transform[\s\S]*<\/g>/)[0];
const svgOf = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg ? `<rect width="200" height="200" fill="${bg}"/>` : ''}${body}</svg>`;
const scaled = (s) => `<g transform="translate(100 100) scale(${s}) translate(-100 -100)">${inner}</g>`;
const png = (svg, w, h = w) => sharp(Buffer.from(svg), { density: 384 }).resize(w, h).png({ compressionLevel: 9 });

const bleed = svgOf(inner, PURPLE);                 // full-bleed purple + house (iOS/MS/Capacitor)
const maskable = svgOf(scaled(0.85), PURPLE);       // inside the maskable safe zone
const fg = svgOf(scaled(1.3));                      // transparent foreground for adaptive icons
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="100" fill="${PURPLE}"/>${scaled(0.9)}</svg>`;
const solid = svgOf('', PURPLE);

// ---- web
fs.writeFileSync(out('public', 'favicon.svg'), icon);
await png(bleed, 180).toFile(out('public', 'icons', 'apple-icon-180.png'));
await png(maskable, 192).toFile(out('public', 'icons', 'manifest-icon-192.maskable.png'));
await png(maskable, 512).toFile(out('public', 'icons', 'manifest-icon-512.maskable.png'));
await png(icon, 192).toFile(out('public', 'icons', 'icon-192x192.png'));
await png(icon, 512).toFile(out('public', 'icons', 'icon-512x512.png'));
for (const s of [70, 150, 310]) await png(bleed, s).toFile(out('public', 'icons', `icon-${s}x${s}.png`));
await sharp({ create: { width: 310, height: 150, channels: 4, background: PURPLE } })
  .composite([{ input: await png(bleed, 150).toBuffer(), left: 80, top: 0 }]).png().toFile(out('public', 'icons', 'icon-310x150.png'));

// favicon (PNG-in-ICO: 16, 32, 48)
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => png(icon, s).toBuffer()));
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => { const e = Buffer.alloc(16); e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(off, 12); off += pngs[i].length; return e; });
fs.writeFileSync(out('public', 'plot.ico'), Buffer.concat([head, ...dir, ...pngs]));

// social image
await sharp(Buffer.from(rd('plot-yangu-og.svg')), { density: 144 }).resize(1200, 630).jpeg({ quality: 88, mozjpeg: true }).toFile(out('public', 'social', 'og-image.jpg'));

// ---- splash: centred lockup on cream (light) / ink (dark)
const lockLight = rd('plot-yangu-lockup.svg'), lockDark = rd('plot-yangu-lockup-reversed.svg');
async function splash(file, w, h, dark, frac = 0.62) {
  const lw = Math.round(Math.min(w, h) * frac);
  const lock = await sharp(Buffer.from(dark ? lockDark : lockLight), { density: 384 }).resize({ width: lw }).png().toBuffer();
  const lh = (await sharp(lock).metadata()).height;
  const bg = dark ? INK : CREAM;
  const q = file.endsWith('.jpg');
  const img = sharp({ create: { width: w, height: h, channels: 3, background: bg } }).composite([{ input: lock, left: Math.round((w - lw) / 2), top: Math.round((h - lh) / 2) }]);
  await (q ? img.jpeg({ quality: 90 }) : img.png({ compressionLevel: 9 })).toFile(file);
}
for (const f of fs.readdirSync(path.join(ROOT, 'public/icons')).filter((n) => /^apple-splash-\d+-\d+\.jpg$/.test(n))) {
  const [, w, h] = f.match(/(\d+)-(\d+)\.jpg/);
  await splash(out('public', 'icons', f), +w, +h, false, +w > +h ? 0.4 : 0.62);
}

// ---- Capacitor sources
await png(bleed, 1024).toFile(out('assets', 'icon.png'));
await png(fg, 1024).toFile(out('assets', 'icon-foreground.png'));
await png(solid, 1024).toFile(out('assets', 'icon-background.png'));
await splash(out('assets', 'splash.png'), 2800, 2800, false, 0.5);
await splash(out('assets', 'splash-dark.png'), 2800, 2800, true, 0.5);

// ---- Android: regenerate every existing launcher + splash file at its current size
const RES = path.join(ROOT, 'android/app/src/main/res');
for (const d of fs.readdirSync(RES)) {
  const dp = path.join(RES, d);
  if (d.startsWith('mipmap-') && !d.includes('anydpi')) {
    for (const [name, svg] of [['ic_launcher.png', icon], ['ic_launcher_round.png', round], ['ic_launcher_foreground.png', fg], ['ic_launcher_background.png', solid]]) {
      const f = path.join(dp, name);
      if (!fs.existsSync(f)) continue;
      const { width } = await sharp(f).metadata();
      await png(svg, width).toFile(f + '.tmp'); fs.renameSync(f + '.tmp', f);
    }
  }
  const sp = path.join(dp, 'splash.png');
  if (d.startsWith('drawable') && fs.existsSync(sp)) {
    const { width, height } = await sharp(sp).metadata();
    const tmp = sp + '.tmp.png';
    await splash(tmp, width, height, d.includes('night'), width > height ? 0.4 : 0.62); fs.renameSync(tmp, sp);
  }
}
console.log('✔ Plot Yangu icons, splash screens and social image regenerated.');
