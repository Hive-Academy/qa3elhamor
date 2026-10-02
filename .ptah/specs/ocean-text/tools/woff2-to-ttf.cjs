// Lossless WOFF2 -> TrueType (sfnt) decoder for single-font WOFF2 files with TrueType outlines.
// Uses only Node built-ins (zlib Brotli). Reconstructs the transformed glyf/loca tables per the
// W3C WOFF2 spec, section 5. troika-three-text reads .ttf/.otf/.woff but not .woff2.
//
// Usage: node woff2-to-ttf.cjs <in.woff2> <out.ttf>
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');

const KNOWN_TAGS = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];

class Reader {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.b.readUInt16BE(this.p); this.p += 2; return v; }
  i16() { const v = this.b.readInt16BE(this.p); this.p += 2; return v; }
  u32() { const v = this.b.readUInt32BE(this.p); this.p += 4; return v; }
  bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
  base128() {
    let acc = 0;
    for (let i = 0; i < 5; i++) {
      const d = this.u8();
      if (i === 0 && d === 0x80) throw new Error('UIntBase128 leading zero');
      acc = acc * 128 + (d & 0x7f);
      if (!(d & 0x80)) return acc;
    }
    throw new Error('UIntBase128 too long');
  }
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

function withSign(flag, v) { return flag & 1 ? v : -v; }

function decodeTriplet(flag, r) {
  let dx, dy;
  if (flag < 10) { dx = 0; dy = withSign(flag, ((flag & 14) << 7) + r.u8()); }
  else if (flag < 20) { dx = withSign(flag, (((flag - 10) & 14) << 7) + r.u8()); dy = 0; }
  else if (flag < 84) {
    const b0 = flag - 20, b1 = r.u8();
    dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
    dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
  } else if (flag < 120) {
    const b0 = flag - 84, x = r.u8(), y = r.u8();
    dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + x);
    dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + y);
  } else if (flag < 124) {
    const a = r.u8(), b = r.u8(), c = r.u8();
    dx = withSign(flag, (a << 4) + (b >> 4));
    dy = withSign(flag >> 1, ((b & 0x0f) << 8) + c);
  } else {
    const a = r.u8(), b = r.u8(), c = r.u8(), d = r.u8();
    dx = withSign(flag, (a << 8) + b);
    dy = withSign(flag >> 1, (c << 8) + d);
  }
  return [dx, dy];
}

function bitSet(bitmap, i) { return (bitmap[i >> 3] & (0x80 >> (i & 7))) !== 0; }

function rebuildGlyf(data, indexFormat) {
  const r = new Reader(data);
  r.u16(); // reserved
  const optionFlags = r.u16();
  const numGlyphs = r.u16();
  const fmt = r.u16();
  const sizes = [];
  for (let i = 0; i < 7; i++) sizes.push(r.u32());
  let off = r.p;
  const streams = sizes.map((s) => { const sub = new Reader(data, off); off += s; return sub; });
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxS, instrS] = streams;
  const bboxBitmapLen = ((numGlyphs + 31) >> 5) << 2;
  const bboxBitmap = bboxS.bytes(bboxBitmapLen);
  let overlapBitmap = null;
  if (optionFlags & 1) overlapBitmap = data.subarray(off, off + ((numGlyphs + 7) >> 3));
  if (fmt !== indexFormat) throw new Error('indexFormat mismatch');

  const glyphs = [];
  for (let g = 0; g < numGlyphs; g++) {
    const nContours = nContourS.i16();
    const hasBbox = bitSet(bboxBitmap, g);
    if (nContours === 0) { glyphs.push(Buffer.alloc(0)); continue; }
    if (nContours === -1) {
      const start = compositeS.p;
      let more = true, haveInstr = false;
      while (more) {
        const flags = compositeS.u16(); compositeS.u16();
        compositeS.p += flags & 0x0001 ? 4 : 2;
        if (flags & 0x0008) compositeS.p += 2;
        else if (flags & 0x0040) compositeS.p += 4;
        else if (flags & 0x0080) compositeS.p += 8;
        if (flags & 0x0100) haveInstr = true;
        more = (flags & 0x0020) !== 0;
      }
      const comp = data.subarray(start, compositeS.p);
      if (!hasBbox) throw new Error('composite glyph without bbox');
      const bbox = bboxS.bytes(8);
      const parts = [Buffer.from([0xff, 0xff]), bbox, comp];
      if (haveInstr) {
        const n = glyphS.u255();
        const len = Buffer.alloc(2); len.writeUInt16BE(n);
        parts.push(len, instrS.bytes(n));
      }
      glyphs.push(Buffer.concat(parts));
      continue;
    }
    const endPts = [];
    let total = 0;
    for (let c = 0; c < nContours; c++) { total += nPointsS.u255(); endPts.push(total - 1); }
    const pts = [];
    let x = 0, y = 0;
    for (let i = 0; i < total; i++) {
      const f = flagS.u8();
      const [dx, dy] = decodeTriplet(f & 0x7f, glyphS);
      x += dx; y += dy;
      pts.push({ dx, dy, x, y, on: (f & 0x80) === 0 });
    }
    const instrLen = glyphS.u255();
    const instr = instrS.bytes(instrLen);
    let bbox;
    if (hasBbox) bbox = bboxS.bytes(8);
    else {
      let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
      for (const p of pts) { xMin = Math.min(xMin, p.x); yMin = Math.min(yMin, p.y); xMax = Math.max(xMax, p.x); yMax = Math.max(yMax, p.y); }
      bbox = Buffer.alloc(8);
      bbox.writeInt16BE(xMin, 0); bbox.writeInt16BE(yMin, 2); bbox.writeInt16BE(xMax, 4); bbox.writeInt16BE(yMax, 6);
    }
    const head = Buffer.alloc(2 + 2 * nContours + 2);
    head.writeInt16BE(nContours, 0);
    endPts.forEach((e, i) => head.writeUInt16BE(e, 2 + 2 * i));
    head.writeUInt16BE(instrLen, 2 + 2 * nContours);
    const flags = [], xs = [], ys = [];
    pts.forEach((p, i) => {
      let f = p.on ? 0x01 : 0;
      if (i === 0 && overlapBitmap && bitSet(overlapBitmap, g)) f |= 0x40;
      if (p.dx === 0) f |= 0x10;
      else if (Math.abs(p.dx) < 256) { f |= 0x02 | (p.dx > 0 ? 0x10 : 0); xs.push(Math.abs(p.dx)); }
      else { xs.push((p.dx >> 8) & 0xff, p.dx & 0xff); }
      if (p.dy === 0) f |= 0x20;
      else if (Math.abs(p.dy) < 256) { f |= 0x04 | (p.dy > 0 ? 0x20 : 0); ys.push(Math.abs(p.dy)); }
      else { ys.push((p.dy >> 8) & 0xff, p.dy & 0xff); }
      flags.push(f);
    });
    const hdr = Buffer.concat([head.subarray(0, 2), bbox, head.subarray(2)]);
    glyphs.push(Buffer.concat([hdr, instr, Buffer.from(flags), Buffer.from(xs), Buffer.from(ys)]));
  }

  const align = indexFormat === 0 ? 2 : 4;
  const glyfParts = [];
  const offsets = [];
  let pos = 0;
  for (const g of glyphs) {
    offsets.push(pos);
    const pad = (align - (g.length % align)) % align;
    glyfParts.push(g, Buffer.alloc(pad));
    pos += g.length + pad;
  }
  offsets.push(pos);
  const loca = Buffer.alloc(offsets.length * (indexFormat === 0 ? 2 : 4));
  offsets.forEach((o, i) => {
    if (indexFormat === 0) loca.writeUInt16BE(o / 2, i * 2);
    else loca.writeUInt32BE(o, i * 4);
  });
  return { glyf: Buffer.concat(glyfParts), loca };
}

function checksum(buf) {
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function decode(input) {
  const r = new Reader(input);
  if (r.bytes(4).toString('latin1') !== 'wOF2') throw new Error('not a WOFF2 file');
  const flavor = r.u32();
  if (flavor === 0x74746366) throw new Error('font collections not supported');
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); r.u32(); // reserved, totalSfntSize
  const totalCompressed = r.u32();
  r.p = 48;
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const f = r.u8();
    const tag = (f & 63) === 63 ? r.bytes(4).toString('latin1') : KNOWN_TAGS[f & 63];
    const tv = (f >> 6) & 3;
    const origLength = r.base128();
    const isGL = tag === 'glyf' || tag === 'loca';
    const transformed = isGL ? tv === 0 : tv !== 0;
    const transformLength = transformed ? r.base128() : origLength;
    if (transformed && !isGL) throw new Error(`unsupported transform on ${tag}`);
    tables.push({ tag, transformed, origLength, length: transformLength });
  }
  const stream = zlib.brotliDecompressSync(input.subarray(r.p, r.p + totalCompressed));
  let off = 0;
  for (const t of tables) { t.data = stream.subarray(off, off + t.length); off += t.length; }
  const byTag = Object.fromEntries(tables.map((t) => [t.tag, t]));
  const glyf = byTag['glyf'];
  if (glyf && glyf.transformed) {
    const indexFormat = byTag['head'].data.readInt16BE(50);
    const rebuilt = rebuildGlyf(glyf.data, indexFormat);
    glyf.data = rebuilt.glyf;
    byTag['loca'].data = rebuilt.loca;
    if (rebuilt.loca.length !== byTag['loca'].origLength) throw new Error('loca length mismatch');
  }
  const head = Buffer.from(byTag['head'].data);
  head.writeUInt32BE(0, 8);
  byTag['head'].data = head;

  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const n = sorted.length;
  let es = 0; while ((1 << (es + 1)) <= n) es++;
  const searchRange = (1 << es) * 16;
  const header = Buffer.alloc(12 + 16 * n);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(n, 4); header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(es, 8); header.writeUInt16BE(n * 16 - searchRange, 10);
  const bodies = [];
  let dataOff = header.length;
  sorted.forEach((t, i) => {
    const rec = 12 + 16 * i;
    header.write(t.tag, rec, 4, 'latin1');
    header.writeUInt32BE(checksum(t.data), rec + 4);
    header.writeUInt32BE(dataOff, rec + 8);
    header.writeUInt32BE(t.data.length, rec + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    bodies.push(t.data, Buffer.alloc(pad));
    t.offset = dataOff;
    dataOff += t.data.length + pad;
  });
  const out = Buffer.concat([header, ...bodies]);
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  out.writeUInt32BE(adj, byTag['head'].offset + 8);
  return out;
}

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: woff2-to-ttf <in.woff2> <out.ttf>'); process.exit(2); }
const out = decode(fs.readFileSync(inPath));
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} bytes)`);
