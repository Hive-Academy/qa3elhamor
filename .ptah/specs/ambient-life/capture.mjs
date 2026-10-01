// Throwaway capture for ambient-life: node capture.mjs <prefix> [tiers=high,medium,low] [viewports=desktop,phone] [gpu|swiftshader]
// Screenshots at a few dive depths plus draw calls / fps per tier (WebGL calls counted per rAF).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [prefix, tiersArg = 'high,medium,low', vpArg = 'desktop,phone', mode = 'swiftshader', posArg] = process.argv.slice(2);
const positions = posArg ? JSON.parse(posArg) : { surface: 0.04, mid: 0.3, town: 0.55, deep: 0.85 };
const viewports = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const args =
  mode === 'gpu'
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });

const counter = () => {
  const stats = { calls: 0, frames: 0, last: 0, times: [] };
  window.__drawStats = stats;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function (...a) {
        stats.calls += 1;
        return original.apply(this, a);
      };
    }
  }
  const tick = (t) => {
    stats.lastFrameCalls = stats.calls;
    stats.calls = 0;
    stats.frames += 1;
    if (stats.last) stats.times.push(t - stats.last);
    if (stats.times.length > 240) stats.times.shift();
    stats.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const results = [];
for (const tier of tiersArg.split(',')) {
  for (const name of vpArg.split(',')) {
    const { width, height, ...rest } = viewports[name];
    const ctx = await browser.newContext({ viewport: { width, height }, ...rest });
    await ctx.addInitScript(counter);
    const page = await ctx.newPage();
    if (process.env.THROTTLE) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
    }
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.error('console', m.type(), m.text().slice(0, 300));
    });
    await page.goto(`http://localhost:${process.env.PORT ?? 4402}/?quality=${tier}${process.env.EXTRA ?? ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(Number(process.env.SETTLE ?? 6000));
    for (const [id, frac] of Object.entries(positions)) {
      await page.evaluate((f) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        scrollTo({ top: f * max, behavior: 'instant' });
      }, frac);
      await page.waitForTimeout(Number(process.env.WAIT ?? 4500));
      const s = await page.evaluate(() => {
        const st = window.__drawStats;
        const sorted = [...st.times].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length / 2)] ?? NaN;
        return { draws: st.lastFrameCalls, fps: Math.round(1000 / p50) };
      });
      const file = `${prefix}-${tier}-${id}-${name}.jpg`;
      await page.screenshot({ path: file });
      results.push({ tier, viewport: name, at: id, ...s });
      console.log('wrote', file, JSON.stringify(s));
    }
    await ctx.close();
  }
}
console.log(JSON.stringify(results));
await browser.close();
