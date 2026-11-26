/**
 * WOFF2 → TrueType (sfnt) decoder, written from the W3C WOFF 2.0 specification (https://www.w3.org/TR/WOFF2/).
 *
 * Why: the plugin ships its OFL fonts as WOFF2 (browsers and Remotion read them directly), but FFmpeg's libass /
 * FreeType in the bundled FFmpeg cannot. Burned-in captions (长视频拆条) therefore use a TrueType copy decoded once
 * into a cache folder — the same glyphs, so every engine shows the same commercial-safe font.
 *
 * Supported: single fonts (not collections) with brotli-compressed tables, the transformed glyf / loca pair
 * (transform version 0, incl. the overlap-simple bitmap), the transformed hmtx table (version 1) and null transforms.
 * Output tables are 4-byte aligned, sorted by tag, with correct table checksums and head.checkSumAdjustment.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'

const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill']

class Reader {
  constructor(buf, offset = 0, end = buf.length) {
    this.buf = buf
    this.pos = offset
    this.end = end
  }
  need(n) {
    if (this.pos + n > this.end) throw new Error('WOFF2: unexpected end of data')
  }
  u8() {
    this.need(1)
    return this.buf[this.pos++]
  }
  u16() {
    this.need(2)
    const v = this.buf.readUInt16BE(this.pos)
    this.pos += 2
    return v
  }
  i16() {
    this.need(2)
    const v = this.buf.readInt16BE(this.pos)
    this.pos += 2
    return v
  }
  u32() {
    this.need(4)
    const v = this.buf.readUInt32BE(this.pos)
    this.pos += 4
    return v
  }
  bytes(n) {
    this.need(n)
    const b = this.buf.subarray(this.pos, this.pos + n)
    this.pos += n
    return b
  }
  base128() {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const b = this.u8()
      if (i === 0 && b === 0x80) throw new Error('WOFF2: UIntBase128 with leading zero')
      if (v & 0xfe000000) throw new Error('WOFF2: UIntBase128 overflow')
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) return v >>> 0
    }
    throw new Error('WOFF2: UIntBase128 too long')
  }
  /** 255UInt16 (spec §6.1.1) */
  u255() {
    const code = this.u8()
    if (code === 253) return this.u16()
    if (code === 255) return this.u8() + 253
    if (code === 254) return this.u8() + 253 * 2
    return code
  }
}

const withSign = (flag, base) => (flag & 1 ? base : -base)

/** Decode one point's (dx, dy) from the WOFF2 triplet encoding (spec §5.2, table "Triplet encoding"). */
function decodeTriplet(flag, r) {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + r.u8())]
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + r.u8()), 0]
  if (flag < 84) {
    const b0 = flag - 20
    const b1 = r.u8()
    return [withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))]
  }
  if (flag < 120) {
    const b0 = flag - 84
    const x = r.u8()
    const y = r.u8()
    return [withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + x), withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + y)]
  }
  if (flag < 124) {
    const a = r.u8()
    const b = r.u8()
    const c = r.u8()
    return [withSign(flag, (a << 4) + (b >> 4)), withSign(flag >> 1, ((b & 0x0f) << 8) + c)]
  }
  const a = r.u8()
  const b = r.u8()
  const c = r.u8()
  const d = r.u8()
  return [withSign(flag, (a << 8) + b), withSign(flag >> 1, (c << 8) + d)]
}

/** A simple glyph in the standard compact glyf encoding (flags with repeats, short / same coordinates). */
export function encodeSimpleGlyph({ endPts, points, instructions, bbox, overlap }) {
  const flags = []
  const xs = []
  const ys = []
  let px = 0
  let py = 0
  points.forEach((p, i) => {
    let f = p.on ? 0x01 : 0
    if (i === 0 && overlap) f |= 0x40
    const dx = p.x - px
    const dy = p.y - py
    px = p.x
    py = p.y
    if (dx === 0) f |= 0x10
    else if (dx > -256 && dx < 256) {
      f |= 0x02
      if (dx > 0) f |= 0x10
      xs.push({ size: 1, v: Math.abs(dx) })
    } else xs.push({ size: 2, v: dx })
    if (dy === 0) f |= 0x20
    else if (dy > -256 && dy < 256) {
      f |= 0x04
      if (dy > 0) f |= 0x20
      ys.push({ size: 1, v: Math.abs(dy) })
    } else ys.push({ size: 2, v: dy })
    flags.push(f)
  })
  // repeat-compress the flags
  const flagBytes = []
  for (let i = 0; i < flags.length; ) {
    let run = 1
    while (i + run < flags.length && flags[i + run] === flags[i] && run < 256) run++
    if (run > 2) {
      flagBytes.push(flags[i] | 0x08, run - 1)
      i += run
    } else {
      flagBytes.push(flags[i])
      i++
    }
  }
  const coordBytes = (list) => list.reduce((n, c) => n + c.size, 0)
  const size = 10 + endPts.length * 2 + 2 + instructions.length + flagBytes.length + coordBytes(xs) + coordBytes(ys)
  const out = Buffer.alloc(size)
  let o = 0
  o = out.writeInt16BE(endPts.length, o)
  o = out.writeInt16BE(bbox[0], o)
  o = out.writeInt16BE(bbox[1], o)
  o = out.writeInt16BE(bbox[2], o)
  o = out.writeInt16BE(bbox[3], o)
  for (const e of endPts) o = out.writeUInt16BE(e, o)
  o = out.writeUInt16BE(instructions.length, o)
  instructions.copy(out, o)
  o += instructions.length
  for (const b of flagBytes) out[o++] = b
  for (const c of xs) o = c.size === 1 ? out.writeUInt8(c.v, o) : out.writeInt16BE(c.v, o)
  for (const c of ys) o = c.size === 1 ? out.writeUInt8(c.v, o) : out.writeInt16BE(c.v, o)
  return out
}

/** Copy one composite glyph's component records from the composite stream; returns { data, haveInstructions }. */
function readCompositeData(r) {
  const start = r.pos
  let haveInstructions = false
  for (;;) {
    const flags = r.u16()
    r.u16() // glyphIndex
    r.bytes(flags & 0x0001 ? 4 : 2) // ARG_1_AND_2_ARE_WORDS
    if (flags & 0x0008) r.bytes(2) // WE_HAVE_A_SCALE
    else if (flags & 0x0040) r.bytes(4) // WE_HAVE_AN_X_AND_Y_SCALE
    else if (flags & 0x0080) r.bytes(8) // WE_HAVE_A_TWO_BY_TWO
    if (flags & 0x0100) haveInstructions = true
    if (!(flags & 0x0020)) break // MORE_COMPONENTS
  }
  return { data: r.buf.subarray(start, r.pos), haveInstructions }
}

/** Rebuild glyf + loca from the transformed glyf table (spec §5.1 / §5.3). */
function reconstructGlyfLoca(data, { headIndexFormat = null } = {}) {
  const h = new Reader(data)
  h.u16() // reserved
  const optionFlags = h.u16()
  const numGlyphs = h.u16()
  const indexFormat = h.u16()
  const sizes = Array.from({ length: 7 }, () => h.u32())
  let off = h.pos
  const streams = sizes.map((n) => {
    const s = new Reader(data, off, off + n)
    off += n
    if (off > data.length) throw new Error('WOFF2: glyf stream exceeds the table')
    return s
  })
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxS, instrS] = streams
  const bitmapBytes = 4 * Math.floor((numGlyphs + 31) / 32)
  const bboxBitmap = bboxS.bytes(bitmapBytes)
  let overlapBitmap = null
  if (optionFlags & 1) {
    if (off + bitmapBytes > data.length) throw new Error('WOFF2: missing overlapSimpleBitmap')
    overlapBitmap = data.subarray(off, off + bitmapBytes)
  }
  const bit = (bm, i) => Boolean(bm[i >> 3] & (0x80 >> (i & 7)))
  const glyphs = []
  for (let i = 0; i < numGlyphs; i++) {
    const nContours = nContourS.i16()
    const hasBbox = bit(bboxBitmap, i)
    if (nContours === 0) {
      if (hasBbox) throw new Error(`WOFF2: empty glyph ${i} has a bounding box`)
      glyphs.push(Buffer.alloc(0))
      continue
    }
    if (nContours === -1) {
      if (!hasBbox) throw new Error(`WOFF2: composite glyph ${i} without a bounding box`)
      const { data: comp, haveInstructions } = readCompositeData(compositeS)
      const bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()]
      let instructions = Buffer.alloc(0)
      if (haveInstructions) {
        const n = glyphS.u255()
        instructions = instrS.bytes(n)
      }
      const out = Buffer.alloc(10 + comp.length + (haveInstructions ? 2 + instructions.length : 0))
      let o = out.writeInt16BE(-1, 0)
      for (const v of bbox) o = out.writeInt16BE(v, o)
      comp.copy(out, o)
      o += comp.length
      if (haveInstructions) {
        o = out.writeUInt16BE(instructions.length, o)
        instructions.copy(out, o)
      }
      glyphs.push(out)
      continue
    }
    if (nContours < 0) throw new Error(`WOFF2: glyph ${i} has an invalid contour count ${nContours}`)
    const endPts = []
    let total = 0
    for (let c = 0; c < nContours; c++) {
      total += nPointsS.u255()
      endPts.push(total - 1)
    }
    const points = []
    let x = 0
    let y = 0
    for (let p = 0; p < total; p++) {
      const fb = flagS.u8()
      const [dx, dy] = decodeTriplet(fb & 0x7f, glyphS)
      x += dx
      y += dy
      points.push({ x, y, on: !(fb >> 7) })
    }
    const instructions = instrS.bytes(glyphS.u255())
    let bbox
    if (hasBbox) bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()]
    else {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const p of points) {
        if (p.x < x0) x0 = p.x
        if (p.y < y0) y0 = p.y
        if (p.x > x1) x1 = p.x
        if (p.y > y1) y1 = p.y
      }
      bbox = total ? [x0, y0, x1, y1] : [0, 0, 0, 0]
    }
    glyphs.push(encodeSimpleGlyph({ endPts, points, instructions, bbox, overlap: overlapBitmap ? bit(overlapBitmap, i) : false }))
  }
  // glyf with 4-byte aligned glyphs; loca in the encoder's format
  const longLoca = (headIndexFormat ?? indexFormat) === 1
  const padded = glyphs.map((g) => (g.length % 4 ? Buffer.concat([g, Buffer.alloc(4 - (g.length % 4))]) : g))
  const glyf = Buffer.concat(padded)
  const loca = Buffer.alloc((numGlyphs + 1) * (longLoca ? 4 : 2))
  let pos = 0
  for (let i = 0; i <= numGlyphs; i++) {
    if (longLoca) loca.writeUInt32BE(pos, i * 4)
    else {
      if (pos / 2 > 0xffff) throw new Error('WOFF2: glyf too large for the short loca format')
      loca.writeUInt16BE(pos / 2, i * 2)
    }
    if (i < numGlyphs) pos += padded[i].length
  }
  return { glyf, loca, numGlyphs, glyphs: padded }
}

/** Rebuild hmtx from its transformed form (spec §5.4), using the reconstructed glyph x-minimums. */
function reconstructHmtx(data, { numHMetrics, numGlyphs, glyphs }) {
  const r = new Reader(data)
  const flags = r.u8()
  const advances = Array.from({ length: numHMetrics }, () => r.u16())
  const xMin = (i) => (glyphs[i] && glyphs[i].length >= 10 ? glyphs[i].readInt16BE(2) : 0)
  const lsbs = []
  for (let i = 0; i < numHMetrics; i++) lsbs.push(flags & 1 ? xMin(i) : r.i16())
  for (let i = numHMetrics; i < numGlyphs; i++) lsbs.push(flags & 2 ? xMin(i) : r.i16())
  const out = Buffer.alloc(numHMetrics * 4 + (numGlyphs - numHMetrics) * 2)
  let o = 0
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numHMetrics) o = out.writeUInt16BE(advances[i], o)
    o = out.writeInt16BE(lsbs[i], o)
  }
  return out
}

export function tableChecksum(buf) {
  let sum = 0
  const n = Math.ceil(buf.length / 4)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const word = ((buf[o] || 0) << 24) | ((buf[o + 1] || 0) << 16) | ((buf[o + 2] || 0) << 8) | (buf[o + 3] || 0)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum >>> 0
}

/**
 * Assemble an sfnt from `tables` (Map tag → Buffer): offset table + records sorted by tag, tables 4-byte aligned,
 * table checksums and head.checkSumAdjustment. `flavor` is the sfnt version (0x00010000 for TrueType).
 */
export function buildSfnt(tables, flavor = 0x00010000) {
  const tags = [...tables.keys()].sort()
  const n = tags.length
  let p2 = 1
  let log2 = 0
  while (p2 * 2 <= n) {
    p2 *= 2
    log2++
  }
  const headerSize = 12 + n * 16
  let total = headerSize
  for (const tag of tags) total += Math.ceil(tables.get(tag).length / 4) * 4
  const out = Buffer.alloc(total)
  out.writeUInt32BE(flavor >>> 0, 0)
  out.writeUInt16BE(n, 4)
  out.writeUInt16BE(p2 * 16, 6)
  out.writeUInt16BE(log2, 8)
  out.writeUInt16BE(n * 16 - p2 * 16, 10)
  let offset = headerSize
  let headOffset = -1
  tags.forEach((tag, i) => {
    const data = tables.get(tag)
    if (tag === 'head' && data.length >= 12) data.writeUInt32BE(0, 8) // checkSumAdjustment computed below
    const rec = 12 + i * 16
    out.write(tag, rec, 4, 'latin1')
    out.writeUInt32BE(tableChecksum(data), rec + 4)
    out.writeUInt32BE(offset, rec + 8)
    out.writeUInt32BE(data.length, rec + 12)
    data.copy(out, offset)
    if (tag === 'head') headOffset = offset
    offset += Math.ceil(data.length / 4) * 4
  })
  if (headOffset >= 0) out.writeUInt32BE((0xb1b0afba - tableChecksum(out)) >>> 0, headOffset + 8)
  return out
}

/** The tables of an sfnt as Map tag → Buffer (copies). */
export function readSfntTables(sfnt) {
  const n = sfnt.readUInt16BE(4)
  const map = new Map()
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16
    const tag = sfnt.toString('latin1', rec, rec + 4)
    const off = sfnt.readUInt32BE(rec + 8)
    const len = sfnt.readUInt32BE(rec + 12)
    if (off + len > sfnt.length) throw new Error(`font: table ${tag} runs past the end of the file`)
    map.set(tag, Buffer.from(sfnt.subarray(off, off + len)))
  }
  return map
}

/**
 * Decode a WOFF2 font into a TrueType / OpenType sfnt Buffer.
 * @param {Buffer} input WOFF2 bytes
 */
export function decodeWoff2(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const r = new Reader(buf)
  if (r.u32() !== 0x774f4632) throw new Error('WOFF2: not a WOFF2 file')
  const flavor = r.u32()
  if (flavor === 0x74746366) throw new Error('WOFF2: font collections are not supported')
  const length = r.u32()
  if (length !== buf.length) throw new Error('WOFF2: length field does not match the file size')
  const numTables = r.u16()
  r.u16() // reserved
  r.u32() // totalSfntSize
  const totalCompressedSize = r.u32()
  r.u16() // majorVersion
  r.u16() // minorVersion
  r.u32() // metaOffset
  r.u32() // metaLength
  r.u32() // metaOrigLength
  r.u32() // privOffset
  r.u32() // privLength
  if (!numTables) throw new Error('WOFF2: no tables')
  const dir = []
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8()
    const known = flags & 0x3f
    const tag = known === 63 ? r.bytes(4).toString('latin1') : KNOWN_TAGS[known]
    if (!tag) throw new Error(`WOFF2: unknown table index ${known}`)
    const version = (flags >> 6) & 3
    const origLength = r.base128()
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    const transformLength = transformed ? r.base128() : origLength
    dir.push({ tag, version, transformed, origLength, transformLength })
  }
  const compressed = buf.subarray(r.pos, r.pos + totalCompressedSize)
  if (compressed.length !== totalCompressedSize) throw new Error('WOFF2: compressed data is truncated')
  const stream = brotliDecompressSync(compressed)
  const expected = dir.reduce((n, t) => n + t.transformLength, 0)
  if (stream.length !== expected) throw new Error(`WOFF2: decompressed ${stream.length} bytes, expected ${expected}`)
  let so = 0
  for (const t of dir) {
    t.data = stream.subarray(so, so + t.transformLength)
    so += t.transformLength
  }
  const byTag = new Map(dir.map((t) => [t.tag, t]))
  const tables = new Map()
  const head = byTag.get('head')
  const headIndexFormat = head && head.data.length >= 52 ? head.data.readInt16BE(50) : null
  let glyphInfo = null
  const glyfT = byTag.get('glyf')
  const locaT = byTag.get('loca')
  if (glyfT && glyfT.transformed) {
    if (!locaT || !locaT.transformed) throw new Error('WOFF2: transformed glyf needs a transformed loca')
    glyphInfo = reconstructGlyfLoca(glyfT.data, { headIndexFormat })
    if (glyphInfo.loca.length !== locaT.origLength) throw new Error(`WOFF2: rebuilt loca is ${glyphInfo.loca.length} bytes, expected ${locaT.origLength}`)
    tables.set('glyf', glyphInfo.glyf)
    tables.set('loca', glyphInfo.loca)
  }
  for (const t of dir) {
    if (tables.has(t.tag)) continue
    if (!t.transformed) {
      tables.set(t.tag, Buffer.from(t.data))
      continue
    }
    if (t.tag === 'hmtx' && t.version === 1) {
      if (!glyphInfo) throw new Error('WOFF2: transformed hmtx needs the transformed glyf table')
      const hhea = byTag.get('hhea')
      const numHMetrics = hhea.data.readUInt16BE(34)
      tables.set('hmtx', reconstructHmtx(t.data, { numHMetrics, numGlyphs: glyphInfo.numGlyphs, glyphs: glyphInfo.glyphs }))
      continue
    }
    throw new Error(`WOFF2: unsupported transform ${t.version} on table ${t.tag}`)
  }
  return buildSfnt(tables, flavor)
}

/** Family / subfamily names (name IDs 1, 2, 4, 16) of an sfnt, for matching fonts by name (libass, FreeType). */
export function readSfntNames(sfnt) {
  const n = sfnt.readUInt16BE(4)
  let nameOff = -1
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16
    if (sfnt.toString('latin1', rec, rec + 4) === 'name') nameOff = sfnt.readUInt32BE(rec + 8)
  }
  const out = {}
  if (nameOff < 0) return out
  const count = sfnt.readUInt16BE(nameOff + 2)
  const strOff = nameOff + sfnt.readUInt16BE(nameOff + 4)
  for (let i = 0; i < count; i++) {
    const rec = nameOff + 6 + i * 12
    const platformId = sfnt.readUInt16BE(rec)
    const nameId = sfnt.readUInt16BE(rec + 6)
    const len = sfnt.readUInt16BE(rec + 8)
    const o = strOff + sfnt.readUInt16BE(rec + 10)
    if (![1, 2, 4, 16, 17].includes(nameId) || platformId !== 3 || out[nameId]) continue
    const raw = sfnt.subarray(o, o + len)
    let s = ''
    for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k))
    out[nameId] = s
  }
  return { family: out[16] || out[1] || '', subfamily: out[17] || out[2] || '', full: out[4] || '' }
}

/**
 * The TrueType copy of a bundled WOFF2 font, decoded once into `cacheDir` (file name carries a hash of the source, so
 * a changed font is decoded again). Returns { path, family, subfamily }.
 */
export function ensureTtfFromWoff2(woff2Path, cacheDir) {
  const src = readFileSync(woff2Path)
  const hash = createHash('sha256').update(src).digest('hex').slice(0, 12)
  const base = woff2Path.replace(/\\/g, '/').split('/').pop().replace(/\.woff2$/i, '')
  mkdirSync(cacheDir, { recursive: true })
  const out = join(cacheDir, `${base}-${hash}.ttf`)
  if (!existsSync(out) || statSync(out).size < 1024) {
    const sfnt = decodeWoff2(src)
    const tmp = `${out}.${process.pid}.tmp`
    writeFileSync(tmp, sfnt)
    renameSync(tmp, out)
  }
  const names = readSfntNames(readFileSync(out))
  return { path: out, family: names.family, subfamily: names.subfamily }
}
