/**
 * vite-plugin-pwa-sw — build-time versioning for the service worker.
 *
 * After `vite build` it rewrites dist/<swFile>:
 *  - BUILD_ID  → a hash of the built asset list + index.html, so the SW's cache name
 *                (and therefore the "update available" prompt) changes exactly when the
 *                app's built files change, and never when they don't.
 *  - PRECACHE_ASSETS → the built /assets/* files, so the app opens offline right after
 *                the first visit and a cached index.html never points at a deleted file.
 *
 * Ported from MyChama's tools/vite-plugin-pwa-seo.ts (the service-worker half only).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Plugin, ResolvedConfig } from 'vite';

export default function pwaSw(opts: { swFile?: string } = {}): Plugin {
  const swFile = opts.swFile ?? 'service-worker.js';
  let config: ResolvedConfig;
  return {
    name: 'pwa-sw-stamp',
    apply: 'build',
    configResolved(c) { config = c; },
    closeBundle: {
      order: 'post',
      handler() {
        const out = path.resolve(config.root, config.build.outDir);
        const swPath = path.join(out, swFile);
        if (!fs.existsSync(swPath)) {
          console.warn(`[pwa-sw] dist/${swFile} not found — is public/${swFile} missing?`);
          return;
        }

        const assetsDir = path.join(out, 'assets');
        const assets = fs.existsSync(assetsDir)
          ? fs.readdirSync(assetsDir)
              .filter((f) => /\.(js|css|woff2?|svg|png|webp|jpe?g|wasm)$/.test(f))
              .sort()
              .map((f) => `/assets/${f}`)
          : [];
        const buildId = crypto
          .createHash('sha1')
          .update(assets.join('|'))
          .update(fs.readFileSync(path.join(out, 'index.html')))
          .digest('hex')
          .slice(0, 10);

        const before = fs.readFileSync(swPath, 'utf8');
        const after = before
          .replace(/\/\*__BUILD_ID__\*\/\s*'dev'/, `'${buildId}'`)
          .replace(/\/\*__PRECACHE_ASSETS__\*\/\s*\[\]/, JSON.stringify(assets));
        if (after === before) console.warn(`[pwa-sw] ${swFile} placeholders not found; service worker was not versioned`);
        else console.log(`[pwa-sw] ${swFile} stamped: build ${buildId}, precaching ${assets.length} assets`);
        fs.writeFileSync(swPath, after);
      },
    },
  };
}
