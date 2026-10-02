// Empirical check of the speech bubble tail's lean (review defect 1).
// Renders the kit's real bubble CSS and tail markup, places the bubble the way
// `placeSpeechBubble` does for a narrator far left and far right of it, writes the CSS
// variables the way `useSpeechBubblePlacement` does (with the skew sign under test), and
// measures where the tail's tip lands against the anchor (the narrator's head).
// node tail-check.mjs <outDir> [negated|plain]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = 'shots', sign = 'negated'] = process.argv.slice(2);
const css = readFileSync(new URL('../../../apps/web/src/app/narrators/speech-bubble.css', import.meta.url), 'utf8');
const clamp = (v, lo, hi) => (hi < lo ? lo : v < lo ? lo : v > hi ? hi : v);

// `placeSpeechBubble`, verbatim maths.
function place(anchor, size, viewport, insets, tail = 22, bias = 0.6) {
  const left = clamp(anchor.x - size.width * bias, insets.left, viewport.width - insets.right - size.width);
  const top = Math.max(anchor.y - tail - size.height, insets.top);
  const tailX = clamp(anchor.x - left, 30, size.width - 30);
  const tailLength = Math.max(anchor.y - (top + size.height), tail * 0.5);
  return { left, top, tailX, tailLength, tailLean: clamp(anchor.x - left - tailX, -tailLength * 1.2, tailLength * 1.2) };
}

const browser = await chromium.launch();
const cases = [
  { name: 'desktop', vp: { width: 1440, height: 900 }, box: { width: 480, height: 144 } },
  { name: 'phone', vp: { width: 390, height: 844 }, box: { width: 366, height: 135 } },
];
const insets = { top: 14, right: 12, bottom: 86, left: 12 };
for (const c of cases) {
  for (const side of ['far-left', 'far-right']) {
    const page = await browser.newPage({ viewport: c.vp });
    const anchor = { x: side === 'far-left' ? 6 : c.vp.width - 6, y: 420 };
    const p = place(anchor, c.box, c.vp, insets);
    const skew = (Math.atan2(p.tailLean, Math.max(p.tailLength, 1)) * 180) / Math.PI;
    const written = sign === 'negated' ? -skew : skew;
    await page.setContent(`<style>${css} body{margin:0;background:#123} .anchor{position:absolute;width:10px;height:10px;border-radius:50%;background:#f40;transform:translate(-50%,-50%)}</style>
      <div class="speech-box" style="opacity:1;transform:translate3d(${p.left}px,${p.top}px,0);width:${c.box.width}px;--tail-x:${p.tailX}px;--tail-len:${p.tailLength}px;--tail-skew:${written.toFixed(2)}deg">
        <section class="speech" style="height:${c.box.height - 6}px;box-sizing:border-box">Two sand dollars and a dictionary
          <span class="speech__tail" aria-hidden="true"><svg viewBox="0 0 40 100" preserveAspectRatio="none"><polygon class="speech__tail-fill" points="0,0 40,0 20,100" /><polyline class="speech__tail-ink" points="0,2 20,100 40,2" /></svg></span>
        </section>
      </div>
      <div class="anchor" style="left:${anchor.x}px;top:${anchor.y}px"></div>`);
    const tip = await page.evaluate(() => {
      const svg = document.querySelector('.speech__tail svg');
      const pt = svg.createSVGPoint();
      pt.x = 20; pt.y = 100;
      const at = pt.matrixTransform(svg.getScreenCTM());
      return { x: Math.round(at.x), y: Math.round(at.y) };
    });
    const miss = Math.round(Math.hypot(tip.x - anchor.x, tip.y - anchor.y));
    console.log(`${sign} ${c.name} ${side}: anchor ${anchor.x},${anchor.y} lean ${Math.round(p.tailLean)} skew ${written.toFixed(1)}deg -> tip ${tip.x},${tip.y}; miss ${miss}px (${Math.sign(tip.x - (p.left + p.tailX)) === Math.sign(p.tailLean) ? 'towards' : 'AWAY FROM'} the narrator)`);
    await page.screenshot({ path: `${outDir}/t-tail-${sign}-${side}-${c.name}.jpg`, type: 'jpeg', quality: 86 });
    await page.close();
  }
}
await browser.close();
