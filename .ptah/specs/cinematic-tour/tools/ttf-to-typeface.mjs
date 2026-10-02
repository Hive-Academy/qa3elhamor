// Converts a TrueType font (glyf outlines) to the three.js "typeface" JSON that drei's <Text3D>
// (three-stdlib FontLoader) reads, keeping only the characters asked for. No dependencies.
//
//   node ttf-to-typeface.mjs <in.ttf> <out.json> "<family name>" [chars]
//
// chars defaults to printable ASCII (U+0020..U+007E). Used once for the cinematic tour's hero
// title: apps/web/public/fonts/qaa-title/qaa-title.typeface.json (see the README next to it).
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output, family, charsArg] = process.argv;
if (!input || !output || !family) {
  console.error('usage: node ttf-to-typeface.mjs <in.ttf> <out.json> "<family name>" [chars]');
  process.exit(1);
}
const chars =
  charsArg ?? Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

const buf = readFileSync(input);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const u16 = (o) => view.getUint16(o);
const i16 = (o) => view.getInt16(o);
const u32 = (o) => view.getUint32(o);

const tables = {};
const numTables = u16(4);
for (let i = 0; i < numTables; i++) {
  const r = 12 + i * 16;
  const tag = String.fromCharCode(buf[r], buf[r + 1], buf[r + 2], buf[r + 3]);
  tables[tag] = { offset: u32(r + 8), length: u32(r + 12) };
}
for (const t of ['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cmap']) {
  if (!tables[t]) throw new Error(`missing table ${t} (CFF fonts are not supported)`);
}

const head = tables.head.offset;
const unitsPerEm = u16(head + 18);
const bbox = { xMin: i16(head + 36), yMin: i16(head + 38), xMax: i16(head + 40), yMax: i16(head + 42) };
const longLoca = i16(head + 50) === 1;
const hhea = tables.hhea.offset;
const ascender = i16(hhea + 4);
const descender = i16(hhea + 6);
const numberOfHMetrics = u16(hhea + 34);
const numGlyphs = u16(tables.maxp.offset + 4);

const advanceOf = (g) => u16(tables.hmtx.offset + 4 * Math.min(g, numberOfHMetrics - 1));
const glyphRange = (g) => {
  const l = tables.loca.offset;
  const start = longLoca ? u32(l + 4 * g) : u16(l + 2 * g) * 2;
  const end = longLoca ? u32(l + 4 * (g + 1)) : u16(l + 2 * (g + 1)) * 2;
  return [tables.glyf.offset + start, end - start];
};

// cmap: format 4 (BMP) from the Windows Unicode subtable.
function buildCmap() {
  const c = tables.cmap.offset;
  const n = u16(c + 2);
  for (let i = 0; i < n; i++) {
    const platform = u16(c + 4 + i * 8);
    const encoding = u16(c + 6 + i * 8);
    const sub = c + u32(c + 8 + i * 8);
    if (platform === 3 && encoding === 1 && u16(sub) === 4) {
      const segX2 = u16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      return (code) => {
        for (let s = 0; s < segX2 / 2; s++) {
          const end = u16(ends + s * 2);
          if (code > end) continue;
          const start = u16(starts + s * 2);
          if (code < start) return 0;
          const delta = i16(deltas + s * 2);
          const rangeOffset = u16(ranges + s * 2);
          if (rangeOffset === 0) return (code + delta) & 0xffff;
          const at = ranges + s * 2 + rangeOffset + (code - start) * 2;
          const g = u16(at);
          return g === 0 ? 0 : (g + delta) & 0xffff;
        }
        return 0;
      };
    }
  }
  throw new Error('no Windows Unicode BMP cmap');
}
const glyphOf = buildCmap();

/** Contours of glyph `g` as arrays of { x, y, on }. */
function contoursOf(g, depth = 0) {
  if (g >= numGlyphs || depth > 8) return [];
  const [o, len] = glyphRange(g);
  if (len === 0) return [];
  const nContours = i16(o);
  if (nContours >= 0) {
    const endPts = [];
    for (let i = 0; i < nContours; i++) endPts.push(u16(o + 10 + i * 2));
    const nPts = nContours ? endPts[nContours - 1] + 1 : 0;
    let p = o + 10 + nContours * 2;
    p += 2 + u16(p); // instructions
    const flags = [];
    while (flags.length < nPts) {
      const f = buf[p++];
      flags.push(f);
      if (f & 8) {
        let r = buf[p++];
        while (r-- > 0) flags.push(f);
      }
    }
    const xs = [];
    let x = 0;
    for (const f of flags) {
      if (f & 2) {
        const d = buf[p++];
        x += f & 16 ? d : -d;
      } else if (!(f & 16)) {
        x += i16(p);
        p += 2;
      }
      xs.push(x);
    }
    const ys = [];
    let y = 0;
    for (const f of flags) {
      if (f & 4) {
        const d = buf[p++];
        y += f & 32 ? d : -d;
      } else if (!(f & 32)) {
        y += i16(p);
        p += 2;
      }
      ys.push(y);
    }
    const contours = [];
    let first = 0;
    for (const last of endPts) {
      const pts = [];
      for (let i = first; i <= last; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
      contours.push(pts);
      first = last + 1;
    }
    return contours;
  }
  // Composite: components offset (and optionally scaled) into this glyph.
  const out = [];
  let p = o + 10;
  for (;;) {
    const flags = u16(p);
    const component = u16(p + 2);
    p += 4;
    let dx = 0;
    let dy = 0;
    if (flags & 1) {
      dx = i16(p);
      dy = i16(p + 2);
      p += 4;
    } else {
      dx = view.getInt8(p);
      dy = view.getInt8(p + 1);
      p += 2;
    }
    let a = 1, b = 0, c = 0, d = 1;
    const f2 = (q) => i16(q) / 16384;
    if (flags & 8) {
      a = d = f2(p);
      p += 2;
    } else if (flags & 0x40) {
      a = f2(p);
      d = f2(p + 2);
      p += 4;
    } else if (flags & 0x80) {
      a = f2(p);
      b = f2(p + 2);
      c = f2(p + 4);
      d = f2(p + 6);
      p += 8;
    }
    if (!(flags & 2)) throw new Error(`glyph ${g}: point-matched components are not supported`);
    for (const contour of contoursOf(component, depth + 1)) {
      out.push(contour.map((pt) => ({ x: a * pt.x + c * pt.y + dx, y: b * pt.x + d * pt.y + dy, on: pt.on })));
    }
    if (!(flags & 0x20)) break;
  }
  return out;
}

/** One contour as typeface commands: `m x y`, `l x y`, `q x y cx cy` (end point first). */
function contourCommands(pts) {
  if (pts.length === 0) return '';
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, on: true });
  // Start on an on-curve point (or the implied midpoint of two off-curve ones).
  let startIndex = pts.findIndex((pt) => pt.on);
  let start;
  if (startIndex === -1) {
    start = mid(pts[0], pts[1 % pts.length]);
    startIndex = 0;
  } else start = pts[startIndex];
  const ordered = [];
  for (let i = 1; i <= pts.length; i++) ordered.push(pts[(startIndex + i) % pts.length]);
  if (!pts[startIndex].on) ordered.unshift(pts[startIndex]);
  const r = (v) => Math.round(v);
  const cmds = [`m ${r(start.x)} ${r(start.y)}`];
  let control = null;
  for (const pt of ordered) {
    if (pt.on) {
      cmds.push(control ? `q ${r(pt.x)} ${r(pt.y)} ${r(control.x)} ${r(control.y)}` : `l ${r(pt.x)} ${r(pt.y)}`);
      control = null;
    } else if (control) {
      const m = mid(control, pt);
      cmds.push(`q ${r(m.x)} ${r(m.y)} ${r(control.x)} ${r(control.y)}`);
      control = pt;
    } else control = pt;
  }
  if (control) cmds.push(`q ${r(start.x)} ${r(start.y)} ${r(control.x)} ${r(control.y)}`);
  return cmds.join(' ');
}

const glyphs = {};
for (const ch of chars) {
  const g = glyphOf(ch.codePointAt(0));
  if (g === 0 && ch !== ' ') {
    console.warn(`no glyph for ${JSON.stringify(ch)}`);
    continue;
  }
  const contours = contoursOf(g);
  const xsAll = contours.flat().map((pt) => pt.x);
  glyphs[ch] = {
    ha: advanceOf(g),
    x_min: xsAll.length ? Math.min(...xsAll) : 0,
    x_max: xsAll.length ? Math.max(...xsAll) : 0,
    o: contours.map(contourCommands).filter(Boolean).join(' ') + (contours.length ? ' ' : ''),
  };
}

const json = {
  glyphs,
  familyName: family,
  ascender,
  descender,
  underlinePosition: -100,
  underlineThickness: 50,
  boundingBox: bbox,
  resolution: unitsPerEm,
  original_font_information: {
    note: 'Subset and converted to the three.js typeface format; see README.md beside this file.',
  },
  cssFontWeight: 'bold',
  cssFontStyle: 'normal',
};
writeFileSync(output, JSON.stringify(json));
console.log(`${Object.keys(glyphs).length} glyphs, ${JSON.stringify(json).length} bytes -> ${output}`);
