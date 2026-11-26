/**
 * Fonts for FFmpeg / libass (burned-in captions and titles of 长视频拆条): TrueType copies of the plugin's bundled OFL
 * fonts, prepared once on the user's computer (never shipped) in a folder that holds only these files, under family
 * names of their own so a same-named font installed on the computer is never picked instead:
 *   DSH Caption Sans   — Noto Sans SC at wght 700 (static instance of the variable font; captions)
 *   DSH Caption Black  — Noto Sans SC at wght 900 (keywords / bold titles)
 *   DSH Title Serif    — Source Han Serif SC Heavy (titles)
 * The browser engines keep using the WOFF2 originals; the glyphs are the same (verified pixel-identical in tests).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { BUNDLED_FONTS_DIR } from './compliance.js'
import { decodeWoff2, readSfntNames } from './woff2-decode.js'
import { instantiateVariableFont, renameFont } from './font-instance.js'

export const CAPTION_FONT_FAMILIES = Object.freeze({
  sans: 'DSH Caption Sans',
  black: 'DSH Caption Black',
  serif: 'DSH Title Serif',
})

const VERSION = 1

function writeAtomic(path, buf) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, buf)
  renameSync(tmp, path)
}

/**
 * Make sure the libass font folder exists under `cacheRoot` and return
 * `{ dir, families: { sans, black, serif }, files: [...] }`. Cheap when already prepared (hash-checked file names).
 */
export function ensureCaptionFonts(cacheRoot) {
  const sansSrc = readFileSync(join(BUNDLED_FONTS_DIR, 'NotoSansSC-VF.woff2'))
  const serifSrc = readFileSync(join(BUNDLED_FONTS_DIR, 'SourceHanSerifSC-Heavy.woff2'))
  const key = createHash('sha256').update(sansSrc).update(serifSrc).update(String(VERSION)).digest('hex').slice(0, 12)
  const dir = resolve(cacheRoot, `libass-fonts-${key}`)
  mkdirSync(dir, { recursive: true })
  const files = {
    sans: join(dir, 'DSHCaptionSans-Bold.ttf'),
    black: join(dir, 'DSHCaptionBlack-Black.ttf'),
    serif: join(dir, 'DSHTitleSerif-Heavy.ttf'),
  }
  const ok = (p) => existsSync(p) && statSync(p).size > 1024
  if (!ok(files.sans) || !ok(files.black)) {
    const vf = decodeWoff2(sansSrc)
    if (!ok(files.sans)) {
      writeAtomic(files.sans, instantiateVariableFont(vf, { wght: 700 }, { names: { family: CAPTION_FONT_FAMILIES.sans, style: 'Bold', full: `${CAPTION_FONT_FAMILIES.sans} Bold`, postscript: 'DSHCaptionSans-Bold' }, weightClass: 700 }))
    }
    if (!ok(files.black)) {
      writeAtomic(files.black, instantiateVariableFont(vf, { wght: 900 }, { names: { family: CAPTION_FONT_FAMILIES.black, style: 'Regular', full: CAPTION_FONT_FAMILIES.black, postscript: 'DSHCaptionBlack-Regular' }, weightClass: 400 }))
    }
  }
  if (!ok(files.serif)) {
    writeAtomic(files.serif, renameFont(decodeWoff2(serifSrc), { family: CAPTION_FONT_FAMILIES.serif, style: 'Regular', full: CAPTION_FONT_FAMILIES.serif, postscript: 'DSHTitleSerif-Regular' }, { weightClass: 400 }))
  }
  return { dir, families: { ...CAPTION_FONT_FAMILIES }, files: Object.values(files), names: Object.fromEntries(Object.entries(files).map(([k, p]) => [k, readSfntNames(readFileSync(p))])) }
}
