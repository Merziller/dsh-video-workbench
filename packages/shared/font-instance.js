/**
 * Static instance of a TrueType variable font (one weight of `wght`), written from the OpenType specification
 * (fvar / avar / gvar chapters, https://learn.microsoft.com/typography/opentype/spec/).
 *
 * Why: the plugin's sans font is the Noto Sans SC variable font whose default master is Thin (wght 100). Browsers
 * pick any weight, but FFmpeg's libass / FreeType in the bundled FFmpeg only render the default master — burned-in
 * captions would come out hairline-thin. A static Bold copy (the same outlines the browser draws at wght 700) gives
 * every engine the same commercial-safe font.
 *
 * Scope: glyf-based fonts; simple glyphs (composite glyphs with variation data are refused with a clear error);
 * gvar tuples with shared / private point numbers, embedded or shared peaks, intermediate regions; IUP inference for
 * untouched points; phantom points → new advance widths / side bearings (hmtx, vmtx). Variation tables are dropped,
 * OS/2 / head / hhea / name are updated for the new weight.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSfnt, encodeSimpleGlyph, readSfntNames, readSfntTables } from './woff2-decode.js'

const f2dot14 = (buf, o) => buf.readInt16BE(o) / 16384
const quantize = (v) => Math.round(v * 16384) / 16384
const otRound = (v) => Math.floor(v + 0.5)

/** fvar axes: [{ tag, min, def, max }] */
export function readFvarAxes(fvar) {
  const axesOff = fvar.readUInt16BE(4)
  const axisCount = fvar.readUInt16BE(8)
  const axisSize = fvar.readUInt16BE(10)
  const axes = []
  for (let a = 0; a < axisCount; a++) {
    const p = axesOff + a * axisSize
    axes.push({ tag: fvar.toString('latin1', p, p + 4), min: fvar.readInt32BE(p + 4) / 65536, def: fvar.readInt32BE(p + 8) / 65536, max: fvar.readInt32BE(p + 12) / 65536 })
  }
  return axes
}

function readAvarMaps(avar, axisCount) {
  if (!avar) return null
  const n = avar.readUInt16BE(6)
  if (n !== axisCount) throw new Error('font: avar axis count does not match fvar')
  let p = 8
  const maps = []
  for (let a = 0; a < n; a++) {
    const cnt = avar.readUInt16BE(p)
    p += 2
    const m = []
    for (let k = 0; k < cnt; k++) {
      m.push([f2dot14(avar, p), f2dot14(avar, p + 2)])
      p += 4
    }
    maps.push(m)
  }
  return maps
}

function applyAvar(v, map) {
  if (!map || map.length < 2) return v
  for (let k = 0; k < map.length - 1; k++) {
    const [x0, y0] = map[k]
    const [x1, y1] = map[k + 1]
    if (v === x0) return y0
    if (v > x0 && v <= x1) return x1 === x0 ? y1 : y0 + ((v - x0) * (y1 - y0)) / (x1 - x0)
  }
  return v
}

/** Normalised (avar-mapped) coordinates for user values, e.g. { wght: 700 }. */
export function normalizeLocation(axes, avarMaps, user) {
  return axes.map((ax, a) => {
    const v0 = user[ax.tag] !== undefined ? Number(user[ax.tag]) : ax.def
    const v = Math.max(ax.min, Math.min(ax.max, v0))
    let n = 0
    if (v < ax.def) n = ax.def === ax.min ? 0 : (v - ax.def) / (ax.def - ax.min)
    else if (v > ax.def) n = ax.max === ax.def ? 0 : (v - ax.def) / (ax.max - ax.def)
    n = quantize(n)
    return quantize(applyAvar(n, avarMaps ? avarMaps[a] : null))
  })
}

/** Region scalar of one tuple at `coords` (spec: "Algorithm for calculating the scalar"). */
export function tupleScalar(coords, peak, start, end) {
  let scalar = 1
  for (let a = 0; a < peak.length; a++) {
    const p = peak[a]
    if (p === 0) continue
    const lo = start ? start[a] : Math.min(p, 0)
    const hi = end ? end[a] : Math.max(p, 0)
    if (lo > p || p > hi) continue
    if (lo < 0 && hi > 0) continue
    const v = coords[a]
    if (v === p) continue
    if (v <= lo || hi <= v) return 0
    scalar *= v < p ? (v - lo) / (p - lo) : (v - hi) / (p - hi)
  }
  return scalar
}

/** Packed point numbers (spec "Packed point numbers"); returns { points: number[] | null (= all), pos } */
function readPackedPoints(buf, pos) {
  let count = buf[pos++]
  if (count === 0) return { points: null, pos }
  if (count & 0x80) count = ((count & 0x7f) << 8) | buf[pos++]
  const points = []
  let last = 0
  while (points.length < count) {
    const ctl = buf[pos++]
    const words = ctl & 0x80
    const run = (ctl & 0x7f) + 1
    for (let k = 0; k < run && points.length < count; k++) {
      let d
      if (words) {
        d = buf.readUInt16BE(pos)
        pos += 2
      } else d = buf[pos++]
      last += d
      points.push(last)
    }
  }
  return { points, pos }
}

/** Packed deltas (spec "Packed deltas"); returns { deltas: number[], pos } */
function readPackedDeltas(buf, pos, count) {
  const deltas = []
  while (deltas.length < count) {
    const ctl = buf[pos++]
    const run = (ctl & 0x3f) + 1
    const kind = ctl & 0xc0
    for (let k = 0; k < run && deltas.length < count; k++) {
      if (kind === 0x80) deltas.push(0)
      else if (kind === 0xc0) {
        deltas.push(buf.readInt32BE(pos))
        pos += 4
      } else if (kind === 0x40) {
        deltas.push(buf.readInt16BE(pos))
        pos += 2
      } else deltas.push(buf.readInt8(pos++))
    }
  }
  return { deltas, pos }
}

/** Infer deltas of untouched points of one contour from the touched ones (IUP), one axis at a time. */
function iupContour(deltas, coords, touched) {
  const n = deltas.length
  const idx = []
  for (let i = 0; i < n; i++) if (touched[i]) idx.push(i)
  if (idx.length === n) return deltas
  if (!idx.length) return deltas.map(() => [0, 0])
  const out = deltas.slice()
  const segment = (from, to, r1, r2) => {
    // points from..to-1 (indices may wrap) between reference points r1 and r2
    for (let k = from; k !== to; k = (k + 1) % n) {
      const res = [0, 0]
      for (let j = 0; j < 2; j++) {
        let x1 = coords[r1][j]
        let x2 = coords[r2][j]
        let d1 = deltas[r1][j]
        let d2 = deltas[r2][j]
        const x = coords[k][j]
        if (x1 === x2) {
          res[j] = d1 === d2 ? d1 : 0
          continue
        }
        if (x1 > x2) {
          ;[x1, x2] = [x2, x1]
          ;[d1, d2] = [d2, d1]
        }
        if (x <= x1) res[j] = d1
        else if (x >= x2) res[j] = d2
        else res[j] = d1 + ((x - x1) * (d2 - d1)) / (x2 - x1)
      }
      out[k] = res
    }
  }
  for (let t = 0; t < idx.length; t++) {
    const a = idx[t]
    const b = idx[(t + 1) % idx.length]
    const from = (a + 1) % n
    if (from === b) continue
    segment(from, b, a, b)
  }
  return out
}

function parseSimpleGlyph(glyf, start, end) {
  if (end - start < 10) return null
  const nc = glyf.readInt16BE(start)
  if (nc < 0) return { composite: true }
  let o = start + 10
  const endPts = []
  for (let c = 0; c < nc; c++) {
    endPts.push(glyf.readUInt16BE(o))
    o += 2
  }
  const nPts = nc ? endPts[nc - 1] + 1 : 0
  const il = glyf.readUInt16BE(o)
  o += 2
  const instructions = Buffer.from(glyf.subarray(o, o + il))
  o += il
  const flags = []
  while (flags.length < nPts) {
    const fl = glyf[o++]
    flags.push(fl)
    if (fl & 8) {
      const rep = glyf[o++]
      for (let k = 0; k < rep; k++) flags.push(fl)
    }
  }
  const xs = []
  let x = 0
  for (const fl of flags) {
    if (fl & 2) {
      const d = glyf[o++]
      x += fl & 16 ? d : -d
    } else if (!(fl & 16)) {
      x += glyf.readInt16BE(o)
      o += 2
    }
    xs.push(x)
  }
  const pts = []
  let y = 0
  flags.forEach((fl, i) => {
    if (fl & 4) {
      const d = glyf[o++]
      y += fl & 32 ? d : -d
    } else if (!(fl & 32)) {
      y += glyf.readInt16BE(o)
      o += 2
    }
    pts.push({ x: xs[i], y, on: Boolean(fl & 1) })
  })
  return {
    endPts,
    points: pts,
    instructions,
    overlap: Boolean(flags.length && flags[0] & 0x40),
    bbox: [glyf.readInt16BE(start + 2), glyf.readInt16BE(start + 4), glyf.readInt16BE(start + 6), glyf.readInt16BE(start + 8)],
  }
}

function readMetrics(table, numLong, numGlyphs) {
  const adv = new Array(numGlyphs)
  const side = new Array(numGlyphs)
  let o = 0
  let lastAdv = 0
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numLong) {
      lastAdv = table.readUInt16BE(o)
      side[i] = table.readInt16BE(o + 2)
      o += 4
    } else {
      side[i] = table.readInt16BE(o)
      o += 2
    }
    adv[i] = lastAdv
  }
  return { adv, side }
}

function writeMetrics(adv, side) {
  const n = adv.length
  // keep every glyph in the long section (simple and always valid)
  const out = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    out.writeUInt16BE(Math.max(0, Math.min(65535, adv[i])), i * 4)
    out.writeInt16BE(Math.max(-32768, Math.min(32767, side[i])), i * 4 + 2)
  }
  return out
}

/** New name table: original records, with the family / style names of the instance (Windows Unicode records). */
function rebuildName(name, { family, style, full, postscript }) {
  const count = name.readUInt16BE(2)
  const strOff = name.readUInt16BE(4)
  const replace = new Set([1, 2, 3, 4, 6, 16, 17])
  const recs = []
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12
    const platformId = name.readUInt16BE(r)
    const encodingId = name.readUInt16BE(r + 2)
    const languageId = name.readUInt16BE(r + 4)
    const nameId = name.readUInt16BE(r + 6)
    const len = name.readUInt16BE(r + 8)
    const off = name.readUInt16BE(r + 10)
    if (replace.has(nameId)) continue
    recs.push({ platformId, encodingId, languageId, nameId, data: Buffer.from(name.subarray(strOff + off, strOff + off + len)) })
  }
  const utf16 = (s) => {
    const b = Buffer.alloc(s.length * 2)
    for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2)
    return b
  }
  const add = [
    [1, family],
    [2, style],
    [3, `${postscript};instance`],
    [4, full],
    [6, postscript],
  ]
  for (const [id, s] of add) recs.push({ platformId: 3, encodingId: 1, languageId: 0x409, nameId: id, data: utf16(s) })
  recs.sort((a, b) => a.platformId - b.platformId || a.encodingId - b.encodingId || a.languageId - b.languageId || a.nameId - b.nameId)
  const header = 6 + recs.length * 12
  const store = []
  let pos = 0
  const out = Buffer.alloc(header)
  out.writeUInt16BE(0, 0)
  out.writeUInt16BE(recs.length, 2)
  out.writeUInt16BE(header, 4)
  recs.forEach((r, i) => {
    const o = 6 + i * 12
    out.writeUInt16BE(r.platformId, o)
    out.writeUInt16BE(r.encodingId, o + 2)
    out.writeUInt16BE(r.languageId, o + 4)
    out.writeUInt16BE(r.nameId, o + 6)
    out.writeUInt16BE(r.data.length, o + 8)
    out.writeUInt16BE(pos, o + 10)
    store.push(r.data)
    pos += r.data.length
  })
  return Buffer.concat([out, ...store])
}

/** A copy of a (static) font with new family / style names and weight class — glyphs untouched. */
export function renameFont(sfnt, names, { weightClass } = {}) {
  const tables = readSfntTables(sfnt)
  if (tables.get('name')) tables.set('name', rebuildName(tables.get('name'), names))
  if (weightClass && tables.get('OS/2')) {
    const o = tables.get('OS/2')
    o.writeUInt16BE(Math.round(weightClass), 4)
  }
  return buildSfnt(tables, sfnt.readUInt32BE(0))
}

/**
 * Instantiate a TrueType variable font at `location` (user units, e.g. { wght: 700 }).
 * `names`: { family, style, full, postscript } for the instance; `weightClass` for OS/2.
 */
export function instantiateVariableFont(sfnt, location, { names, weightClass } = {}) {
  const tables = readSfntTables(sfnt)
  const fvar = tables.get('fvar')
  const gvar = tables.get('gvar')
  if (!fvar || !gvar) throw new Error('font: not a TrueType variable font (fvar / gvar missing)')
  const glyf = tables.get('glyf')
  const loca = tables.get('loca')
  const head = tables.get('head')
  const maxp = tables.get('maxp')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const vhea = tables.get('vhea')
  const vmtx = tables.get('vmtx')
  if (!glyf || !loca) throw new Error('font: only glyf-based variable fonts are supported')
  const axes = readFvarAxes(fvar)
  const coords = normalizeLocation(axes, readAvarMaps(tables.get('avar'), axes.length), location)
  const numGlyphs = maxp.readUInt16BE(4)
  const longLoca = head.readInt16BE(50) === 1
  const locaAt = (i) => (longLoca ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2)
  const hm = readMetrics(hmtx, hhea.readUInt16BE(34), numGlyphs)
  const vm = vhea && vmtx ? readMetrics(vmtx, vhea.readUInt16BE(34), numGlyphs) : null

  // gvar header + shared tuples
  const axisCount = gvar.readUInt16BE(4)
  if (axisCount !== axes.length) throw new Error('font: gvar axis count does not match fvar')
  const sharedCount = gvar.readUInt16BE(6)
  const sharedOff = gvar.readUInt32BE(8)
  if (gvar.readUInt16BE(12) !== numGlyphs) throw new Error('font: gvar glyph count does not match maxp')
  const longOffsets = gvar.readUInt16BE(14) & 1
  const dataArrayOff = gvar.readUInt32BE(16)
  const varOffset = (i) => (longOffsets ? gvar.readUInt32BE(20 + i * 4) : gvar.readUInt16BE(20 + i * 2) * 2)
  const shared = []
  for (let s = 0; s < sharedCount; s++) {
    const t = []
    for (let a = 0; a < axisCount; a++) t.push(f2dot14(gvar, sharedOff + (s * axisCount + a) * 2))
    shared.push(t)
  }

  const glyphsOut = []
  const advOut = hm.adv.slice()
  const lsbOut = hm.side.slice()
  const vadvOut = vm ? vm.adv.slice() : null
  const tsbOut = vm ? vm.side.slice() : null
  let gxMin = Infinity
  let gyMin = Infinity
  let gxMax = -Infinity
  let gyMax = -Infinity
  for (let i = 0; i < numGlyphs; i++) {
    const gs = locaAt(i)
    const ge = locaAt(i + 1)
    const g = ge > gs ? parseSimpleGlyph(glyf, gs, ge) : null
    const vs = varOffset(i)
    const ve = varOffset(i + 1)
    const hasVar = ve > vs
    if (g && g.composite) {
      if (hasVar) throw new Error(`font: composite glyph ${i} has variations (unsupported)`)
      glyphsOut.push(Buffer.from(glyf.subarray(gs, ge)))
      continue
    }
    const pts = g ? g.points : []
    const nPts = pts.length
    const xMin0 = g ? g.bbox[0] : 0
    const yMax0 = g ? g.bbox[3] : 0
    // phantom points: horizontal origin / advance, vertical origin / advance
    const pp1x = xMin0 - hm.side[i]
    const pp3y = vm ? yMax0 + vm.side[i] : 0
    const all = pts.map((p) => [p.x, p.y])
    all.push([pp1x, 0], [pp1x + hm.adv[i], 0], [0, pp3y], [0, pp3y - (vm ? vm.adv[i] : 0)])
    const total = all.map(() => [0, 0])
    if (hasVar) {
      const base = dataArrayOff + vs
      const tvc = gvar.readUInt16BE(base)
      const sharedPointsFlag = tvc & 0x8000
      const tupleCount = tvc & 0x0fff
      let dataPos = base + gvar.readUInt16BE(base + 2)
      let hp = base + 4
      let sharedPoints = null
      if (sharedPointsFlag) {
        const r = readPackedPoints(gvar, dataPos)
        sharedPoints = r.points
        dataPos = r.pos
      }
      for (let t = 0; t < tupleCount; t++) {
        const size = gvar.readUInt16BE(hp)
        const tupleIndex = gvar.readUInt16BE(hp + 2)
        hp += 4
        let peak
        if (tupleIndex & 0x8000) {
          peak = []
          for (let a = 0; a < axisCount; a++) peak.push(f2dot14(gvar, hp + a * 2))
          hp += axisCount * 2
        } else peak = shared[tupleIndex & 0x0fff]
        let start = null
        let end = null
        if (tupleIndex & 0x4000) {
          start = []
          end = []
          for (let a = 0; a < axisCount; a++) start.push(f2dot14(gvar, hp + a * 2))
          hp += axisCount * 2
          for (let a = 0; a < axisCount; a++) end.push(f2dot14(gvar, hp + a * 2))
          hp += axisCount * 2
        }
        const tupleData = dataPos
        dataPos += size
        if (!peak) throw new Error(`font: glyph ${i} references a missing shared tuple`)
        const scalar = tupleScalar(coords, peak, start, end)
        if (scalar === 0) continue
        let p = tupleData
        let points = sharedPoints
        if (tupleIndex & 0x2000) {
          const r = readPackedPoints(gvar, p)
          points = r.points
          p = r.pos
        }
        const n = points ? points.length : all.length
        const dx = readPackedDeltas(gvar, p, n)
        const dy = readPackedDeltas(gvar, dx.pos, n)
        if (dy.pos > tupleData + size) throw new Error(`font: glyph ${i} variation data overruns its tuple`)
        if (!points) {
          for (let k = 0; k < all.length; k++) {
            total[k][0] += dx.deltas[k] * scalar
            total[k][1] += dy.deltas[k] * scalar
          }
          continue
        }
        // sparse: explicit points get their deltas, contour points without one are inferred (IUP); phantoms stay 0
        const d = all.map(() => [0, 0])
        const touched = new Array(all.length).fill(false)
        points.forEach((pt, k) => {
          if (pt >= all.length) return
          d[pt] = [dx.deltas[k], dy.deltas[k]]
          touched[pt] = true
        })
        let cs = 0
        for (const ep of g ? g.endPts : []) {
          const idx = []
          for (let k = cs; k <= ep; k++) idx.push(k)
          const inferred = iupContour(idx.map((k) => d[k]), idx.map((k) => all[k]), idx.map((k) => touched[k]))
          idx.forEach((k, j) => (d[k] = inferred[j]))
          cs = ep + 1
        }
        for (let k = 0; k < all.length; k++) {
          total[k][0] += d[k][0] * scalar
          total[k][1] += d[k][1] * scalar
        }
      }
    }
    const moved = all.map(([x, y], k) => [otRound(x + total[k][0]), otRound(y + total[k][1])])
    const [pp1, pp2, pp3, pp4] = moved.slice(nPts)
    if (!g || !nPts) {
      glyphsOut.push(g ? Buffer.from(glyf.subarray(gs, ge)) : Buffer.alloc(0))
      advOut[i] = Math.max(0, pp2[0] - pp1[0])
      if (vadvOut) vadvOut[i] = Math.max(0, pp3[1] - pp4[1])
      continue
    }
    const newPts = pts.map((p, k) => ({ x: moved[k][0], y: moved[k][1], on: p.on }))
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of newPts) {
      if (p.x < x0) x0 = p.x
      if (p.y < y0) y0 = p.y
      if (p.x > x1) x1 = p.x
      if (p.y > y1) y1 = p.y
    }
    gxMin = Math.min(gxMin, x0)
    gyMin = Math.min(gyMin, y0)
    gxMax = Math.max(gxMax, x1)
    gyMax = Math.max(gyMax, y1)
    const enc = encodeSimpleGlyph({ endPts: g.endPts, points: newPts, instructions: g.instructions, bbox: [x0, y0, x1, y1], overlap: g.overlap })
    glyphsOut.push(enc.length % 4 ? Buffer.concat([enc, Buffer.alloc(4 - (enc.length % 4))]) : enc)
    advOut[i] = Math.max(0, pp2[0] - pp1[0])
    lsbOut[i] = x0 - pp1[0]
    if (vadvOut) {
      vadvOut[i] = Math.max(0, pp3[1] - pp4[1])
      tsbOut[i] = pp3[1] - y1
    }
  }

  // glyf + long loca
  const glyfOut = Buffer.concat(glyphsOut)
  const locaOut = Buffer.alloc((numGlyphs + 1) * 4)
  let pos = 0
  for (let i = 0; i <= numGlyphs; i++) {
    locaOut.writeUInt32BE(pos, i * 4)
    if (i < numGlyphs) pos += glyphsOut[i].length
  }
  const out = new Map()
  for (const [tag, data] of tables) {
    if (['fvar', 'gvar', 'avar', 'HVAR', 'VVAR', 'MVAR', 'STAT', 'cvar'].includes(tag)) continue
    out.set(tag, data)
  }
  out.set('glyf', glyfOut)
  out.set('loca', locaOut)
  const headOut = Buffer.from(head)
  headOut.writeInt16BE(1, 50) // long loca
  if (Number.isFinite(gxMin)) {
    headOut.writeInt16BE(gxMin, 36)
    headOut.writeInt16BE(gyMin, 38)
    headOut.writeInt16BE(gxMax, 40)
    headOut.writeInt16BE(gyMax, 42)
  }
  const weight = Math.round(Number(weightClass) || Number(location.wght) || 400)
  let macStyle = headOut.readUInt16BE(44) & ~1
  if (weight >= 600) macStyle |= 1
  headOut.writeUInt16BE(macStyle, 44)
  out.set('head', headOut)
  out.set('hmtx', writeMetrics(advOut, lsbOut))
  const hheaOut = Buffer.from(hhea)
  hheaOut.writeUInt16BE(numGlyphs, 34)
  hheaOut.writeUInt16BE(Math.max(...advOut), 10)
  out.set('hhea', hheaOut)
  if (vadvOut) {
    out.set('vmtx', writeMetrics(vadvOut, tsbOut))
    const vheaOut = Buffer.from(vhea)
    vheaOut.writeUInt16BE(numGlyphs, 34)
    vheaOut.writeUInt16BE(Math.max(...vadvOut), 10)
    out.set('vhea', vheaOut)
  }
  const os2 = tables.get('OS/2')
  if (os2) {
    const o = Buffer.from(os2)
    o.writeUInt16BE(weight, 4)
    let sel = o.readUInt16BE(62) & ~((1 << 5) | (1 << 6))
    sel |= weight >= 600 ? 1 << 5 : weight === 400 ? 1 << 6 : 0
    o.writeUInt16BE(sel, 62)
    out.set('OS/2', o)
  }
  if (names && tables.get('name')) out.set('name', rebuildName(tables.get('name'), names))
  return buildSfnt(out, sfnt.readUInt32BE(0))
}

/**
 * Cached static instance of a variable TTF (e.g. Noto Sans SC Bold from the VF). The cache file name carries a hash
 * of the source font and the location, so a changed font or weight is instantiated again.
 */
export function ensureFontInstance(vfPath, cacheDir, { wght = 700, names, weightClass } = {}) {
  const src = readFileSync(vfPath)
  const key = createHash('sha256').update(src).update(JSON.stringify({ wght, names, v: 1 })).digest('hex').slice(0, 12)
  mkdirSync(cacheDir, { recursive: true })
  const base = (names?.postscript || 'Instance').replace(/[^A-Za-z0-9-]+/g, '')
  const outPath = join(cacheDir, `${base}-${key}.ttf`)
  if (!existsSync(outPath) || statSync(outPath).size < 1024) {
    const inst = instantiateVariableFont(src, { wght }, { names, weightClass: weightClass ?? wght })
    const tmp = `${outPath}.${process.pid}.tmp`
    writeFileSync(tmp, inst)
    renameSync(tmp, outPath)
  }
  const n = readSfntNames(readFileSync(outPath))
  return { path: outPath, family: n.family, subfamily: n.subfamily, full: n.full }
}
