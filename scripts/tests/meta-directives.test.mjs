#!/usr/bin/env node
/**
 * Standalone tests: motion / production directives must never be printed on screen as content. The meta-guard
 * removes short labels made only of effect / camera / motion / typography vocabulary (「竹节弹簧回弹」「书法笔画描边」
 * 「书法字逐字砸」「斜向刀光长尾」「推镜」「转场」…) from every on-screen text field it sanitises, drops bracketed stage
 * directions from spoken text, and keeps real content (「刀光剑影」 in a poem quote, 「封狼居胥」, 「书法」).
 *
 *   node scripts/tests/meta-directives.test.mjs
 *
 * Pure functions only: no files, no network, no `.env`.
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mg = await import(pathToFileURL(join(REPO, 'packages', 'shared', 'meta-guard.js')).href)

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`✔ ${name}`)
  } catch (err) {
    results.push({ name, ok: false })
    console.log(`✘ ${name}\n    ${String(err?.stack || err).split('\n').slice(0, 6).join('\n    ')}`)
  }
}

const DIRECTIVES = [
  // printed on the bamboo slips of a delivered film
  '竹节弹簧回弹',
  '书法笔画描边',
  '书法字逐字砸',
  '斜向刀光长尾',
  // short phrases made only of effect / camera / motion / typography vocabulary
  '回弹',
  '描边',
  '逐字',
  '刀光长尾',
  '推镜',
  '拉镜',
  '特写',
  '转场',
  '闪切',
  '竹节弹簧',
  '书法笔画',
  '砸字',
  '慢动作定格',
  '0.3秒回弹',
  '镜头缓缓推近',
  'Zoom In',
  'slow-mo',
]
const CONTENT = [
  '刀光剑影',
  '刀光剑影映山河',
  '十步杀一人，千里不留行',
  '封狼居胥',
  '书法',
  '竹简',
  '八百轻骑',
  '冠军封侯',
  '金色年华',
  '光影交错',
  '天下震动',
  '飞入寻常百姓家',
  '淡出江湖',
  '星光闪烁',
  '时间仿佛定格',
  '历史的镜头',
  '弹指一挥间',
  '匈奴未灭，何以家为',
  '长枪如龙',
  'SCENE 01',
  'Glory Road',
]

test('directive phrases are recognised', () => {
  for (const d of DIRECTIVES) assert.equal(mg.isDirectivePhrase(d), true, d)
})

test('real content is never a directive (counter-examples)', () => {
  for (const c of CONTENT) assert.equal(mg.isDirectivePhrase(c), false, c)
  assert.equal(mg.isDirectivePhrase(''), false)
  // long sentences are left to the sentence-level meta guard
  assert.equal(mg.isDirectivePhrase('镜头推近特写回弹转场闪切描边逐字砸字拖尾长尾光效粒子'), false)
})

test('labels: directive labels / segments are removed, content kept', () => {
  assert.equal(mg.stripDirectivePhrases('竹节弹簧回弹'), '')
  assert.equal(mg.stripDirectivePhrases('封狼居胥 · 书法字逐字砸'), '封狼居胥')
  assert.equal(mg.stripDirectivePhrases('河西大捷、斜向刀光长尾、冠军侯'), '河西大捷、冠军侯')
  assert.equal(mg.stripDirectivePhrases('封狼居胥（书法笔画描边）'), '封狼居胥')
  assert.equal(mg.stripDirectivePhrases('回弹 + 描边'), '')
  assert.equal(mg.stripDirectivePhrases('刀光剑影映山河'), '刀光剑影映山河')
  assert.equal(mg.stripDirectivePhrases('十步杀一人，千里不留行'), '十步杀一人，千里不留行')
  // unchanged text is returned as is (same string)
  const s = '饮马祁连 · 封狼居胥'
  assert.equal(mg.stripDirectivePhrases(s), s)
})

test('spoken text: only bracketed stage directions are removed', () => {
  assert.equal(mg.stripDirectivePhrases('（镜头缓缓推近）十七岁的少年', { bracketsOnly: true }), '十七岁的少年')
  assert.equal(mg.stripDirectivePhrases('[特写] 匈奴未灭', { bracketsOnly: true }), '匈奴未灭')
  // a bracketed aside that is content stays
  assert.equal(mg.stripDirectivePhrases('（公元前121年）河西之战', { bracketsOnly: true }), '（公元前121年）河西之战')
  // unbracketed narration is not touched
  assert.equal(mg.stripDirectivePhrases('历史，在这一刻定格', { bracketsOnly: true }), '历史，在这一刻定格')
})

const beatScript = () => ({
  title: '少年霍去病',
  topic: '霍去病',
  narrationMode: 'subtitle-mv',
  scenes: [
    {
      id: 'scene-01',
      title: '少年出征',
      narration: '（镜头缓缓推近）十七岁的霍去病，率八百轻骑',
      tag: '推镜',
      kicker: '转场',
      highlights: ['河西大捷', '斜向刀光长尾'],
      accentWords: ['冠军侯', '闪切'],
      subChunks: ['（特写）十七岁', '率八百轻骑'],
      subtitles: [{ text: '（特写）匈奴未灭', start: 0, end: 1 }, { text: '何以家为', start: 1, end: 2 }],
      cuts: [{ start: 0, end: 30, framing: 'wide', text: '（推镜）十七岁' }, { start: 30, end: 60, framing: 'close', text: '率八百轻骑' }],
      stageSpec: {
        archetype: 'bamboo-slips',
        headline: '书法字逐字砸',
        slips: ['竹节弹簧回弹', '封狼居胥', '书法字逐字砸', '书法笔画描边'],
        plaques: ['饮马祁连', '斜向刀光长尾'],
        calligraphy: ['刀光剑影映山河'],
        sealText: '回弹',
      },
    },
  ],
})

test('sanitizeScriptForRender removes directives from every on-screen field and keeps content', () => {
  const { script, removed } = mg.sanitizeScriptForRender(beatScript())
  const sc = script.scenes[0]
  assert.equal(sc.narration, '十七岁的霍去病，率八百轻骑')
  assert.equal(sc.tag, '')
  assert.equal(sc.kicker, '')
  assert.deepEqual(sc.highlights, ['河西大捷'])
  assert.deepEqual(sc.accentWords, ['冠军侯'])
  assert.deepEqual(sc.subChunks, ['十七岁', '率八百轻骑'])
  assert.deepEqual(sc.subtitles.map((c) => c.text), ['匈奴未灭', '何以家为'])
  assert.equal(sc.subtitles[0].start, 0)
  assert.deepEqual(sc.cuts.map((c) => [c.text, c.framing, c.end]), [['十七岁', 'wide', 30], ['率八百轻骑', 'close', 60]])
  assert.equal(sc.stageSpec.headline, '')
  assert.deepEqual(sc.stageSpec.slips, ['封狼居胥'])
  assert.deepEqual(sc.stageSpec.plaques, ['饮马祁连'])
  assert.deepEqual(sc.stageSpec.calligraphy, ['刀光剑影映山河'])
  assert.equal(sc.stageSpec.sealText, '')
  assert.equal(sc.title, '少年出征')
  assert.ok(removed.some((r) => r.field === 'stageSpec.slips' && r.before === '竹节弹簧回弹'))
  // idempotent: a second write removes nothing more
  assert.equal(mg.sanitizeScriptForRender(script).removed.length, 0)
})

test('text the user wrote by hand is kept, also when it is effect vocabulary', () => {
  const s = beatScript()
  s.userOverrides = { 'scene-01': { tag: '推镜', highlights: ['河西大捷', '斜向刀光长尾'] } }
  const sc = mg.sanitizeScriptForRender(s).script.scenes[0]
  assert.equal(sc.tag, '推镜')
  assert.deepEqual(sc.highlights, ['河西大捷', '斜向刀光长尾'])
  const trusted = new Set([mg.trustedSceneTextKey('scene-01', 'kicker')])
  assert.equal(mg.sanitizeScriptForRender(beatScript(), { trusted }).script.scenes[0].kicker, '转场')
})

test('films about video making keep effect words (an editing tutorial listing 转场 · 特效)', () => {
  const tut = { title: '剪映转场教程', genre: 'ui-tutorial', scenes: [{ id: 'scene-01', narration: '先看转场', highlights: ['转场', '特效', '关键帧'], tag: '特写' }] }
  const sc = mg.sanitizeScriptForRender(tut).script.scenes[0]
  assert.deepEqual(sc.highlights, ['转场', '特效', '关键帧'])
  assert.equal(sc.tag, '特写')
  const app = { title: '漫画客户端功能介绍', scenes: [{ id: 'scene-01', narration: '节奏转场', compareLeft: { label: '节奏转场' } }] }
  assert.equal(mg.sanitizeScriptForRender(app).script.scenes[0].compareLeft.label, '节奏转场')
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
