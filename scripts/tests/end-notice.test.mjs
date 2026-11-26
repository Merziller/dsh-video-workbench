#!/usr/bin/env node
/**
 * 片尾声明 / 片尾署名 switches — the last line of a film is off by default and never credits the plugin unless the user
 * turns both switches on. No network, no LLM, scratch data only:
 *   - defaults and texts (AI film, 口播剪辑): the default disclosure has no plugin credit; the credit only with both switches
 *   - generated compositions: HTML engine element hidden while off / shown with the chosen text; Remotion composition
 *     carries both texts and renders the line only when script.json switches it on; strict TypeScript check
 *   - compositions written by earlier versions (both engines, LF and CRLF) and pages written by the model follow the
 *     switch without regenerating; patching is idempotent; files without our markers are left alone
 *   - the model's HTML coding prompt asks for no end line while off and for the exact text while on
 *   - publish pack disclosure follows the same switches
 *   - project settings: the studio save route keeps the switches on script.json and re-syncs the files
 *
 *   node scripts/tests/end-notice.test.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'end-notice-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}
// the product short name the credited line uses (packages/shared/brand.js) and the old credit of earlier versions
const NAME = '禾杨视频工坊'
const CREDIT = /Merziller|DSH Video Workbench|禾杨视频工坊/

const shared = await imp('packages/shared/index.js')

await section('defaults and texts', async () => {
  const off = shared.buildComplianceNoticeText({})
  check('default: no end line, no credit', off.endNoticeVisible === false && off.endNoticeCredit === false)
  check('default disclosure text names AI content but not the plugin', off.endNoticeBody.startsWith('本视频含 AI 生成内容：') && !CREDIT.test(off.endNoticeBody) && !CREDIT.test(off.endNoticeAiBody), off.endNoticeBody)
  check('credit text is kept for when the user asks for it', off.endNoticeCreditBody.includes(`本视频由${NAME}创作`) && shared.BRAND.productName === NAME && shared.END_NOTICE_CREDIT_NAME === NAME)
  const creditOnly = shared.buildComplianceNoticeText({ endNoticeCredit: true })
  check('the credit switch alone shows nothing and credits nothing', creditOnly.endNoticeVisible === false && creditOnly.endNoticeCredit === false && !CREDIT.test(creditOnly.endNoticeBody))
  const on = shared.buildComplianceNoticeText({ endNotice: true })
  check('end line on: AI disclosure without credit', on.endNoticeVisible === true && on.endNoticeCredit === false && !CREDIT.test(on.endNoticeBody))
  const both = shared.buildComplianceNoticeText({ endNotice: true, endNoticeCredit: true })
  check('both switches: the line credits the plugin', both.endNoticeVisible && both.endNoticeCredit && both.endNoticeBody.includes(`本视频由${NAME}创作：`) && !both.endNoticeBody.includes('Merziller'))
  const truthy = shared.buildComplianceNoticeText({ endNotice: 'yes', endNoticeCredit: 1 })
  check('only a real true turns a switch on (strings / numbers from old data stay off)', truthy.endNoticeVisible === false && truthy.endNoticeCredit === false)
  const talk = shared.buildComplianceNoticeText({ productionType: 'talk-edit', bgm: { enabled: true } })
  check('口播剪辑 default: no credit, the person\'s own voice, no speech synthesis claimed', !CREDIT.test(talk.endNoticeBody) && talk.endNoticeBody.includes('真人出镜原声') && !talk.endNoticeBody.includes('语音合成') && talk.badgeText === 'AI 辅助剪辑')
  const talkCredit = shared.buildComplianceNoticeText({ productionType: 'talk-edit', endNotice: true, endNoticeCredit: true })
  check('口播剪辑 with both switches credits the plugin as the editor', talkCredit.endNoticeBody.includes(`本视频由${NAME}剪辑：`))
  const mv = shared.buildComplianceNoticeText({ endNotice: true, narrationMode: 'subtitle-mv', bgmMode: 'uploaded' })
  check('disclosure still reflects how the film was made', mv.endNoticeBody.includes('纯音乐节拍卡点') && mv.endNoticeBody.includes('用户授权背景音乐') && !mv.endNoticeBody.includes('语音合成'))
})

await section('HTML engine', async () => {
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const base = { title: '测试', engine: 'html', fps: 30, width: 1920, height: 1080, totalDurationInFrames: 90, scenes: [{ id: 'scene-01', startFrame: 0, durationInFrames: 90, durationSec: 3, title: '你好', narration: '你好' }] }
  const htmlOff = buildRichHtmlVideo(base)
  check('generated page, default: element present but hidden, no credit anywhere in the page', htmlOff.includes('<div id="end-notice-wrap" data-end-notice="off" style="display:none">') && !CREDIT.test(htmlOff.replace(/<script id="dsh-script-data"[\s\S]*?<\/script>/, '')))
  const htmlOn = buildRichHtmlVideo({ ...base, endNotice: true })
  check('generated page, end line on: shown, AI text only', htmlOn.includes('data-end-notice="ai">') && htmlOn.includes('本视频含 AI 生成内容') && !htmlOn.includes(`由${NAME}`))
  const htmlCredit = buildRichHtmlVideo({ ...base, endNotice: true, endNoticeCredit: true })
  check('generated page, both switches: credit line shown', htmlCredit.includes('data-end-notice="credit">') && htmlCredit.includes(`本视频由${NAME}创作`))
  check('the runtime still fades the element in at the end', htmlOn.includes("const endNoticeWrap = document.getElementById('end-notice-wrap');") && htmlOn.includes('endNoticeWrap.style.opacity'))

  // a page written by an earlier version (credit baked in, always shown)
  const legacy = htmlOn.replace(/<div id="end-notice-wrap"[^>]*>\s*<div id="end-notice">[\s\S]*?<\/div>\s*<\/div>/, '<div id="end-notice-wrap"><div id="end-notice">本视频由 DSH Video Workbench (by Merziller) 创作：AI 大模型编码驱动视觉合成</div></div>')
  check('fixture: legacy page shows the credit', legacy.includes('<div id="end-notice-wrap"><div id="end-notice">本视频由 DSH Video Workbench (by Merziller)'))
  const patchedOff = shared.patchEndNoticeHtml(legacy, shared.buildComplianceNoticeText({}))
  check('legacy page, switch off: hidden and the credit is gone', patchedOff.includes('data-end-notice="off" style="display:none"') && !patchedOff.includes('by Merziller'))
  check('patching is idempotent (same string back)', shared.patchEndNoticeHtml(patchedOff, shared.buildComplianceNoticeText({})) === patchedOff)
  const patchedCredit = shared.patchEndNoticeHtml(patchedOff, shared.buildComplianceNoticeText({ endNotice: true, endNoticeCredit: true }))
  check('switching back on restores the credit line', patchedCredit.includes(`<div id="end-notice-wrap" data-end-notice="credit"><div id="end-notice">本视频由${NAME}创作`) && !patchedCredit.includes('by Merziller'))

  // a page written by the model itself (own markup and own seek code)
  const model = [
    '<!doctype html><html><head><style>#end-notice{position:absolute;bottom:40px}</style></head><body>',
    '<div id="stage"></div><div id="end-notice" class="x">本片由 AI 辅助创作</div>',
    "<script>window.__seekToFrame=function(f){document.getElementById('end-notice').style.display=f>80?'block':'none'}</script>",
    '</body></html>',
  ].join('\n')
  const mOff = shared.patchEndNoticeHtml(model, shared.buildComplianceNoticeText({}))
  check('model page, switch off: a style rule hides #end-notice over its own inline display', mOff.includes('<style id="dsh-end-notice-switch">#end-notice-wrap,#end-notice{display:none !important}</style>') && mOff.indexOf('dsh-end-notice-switch') < mOff.indexOf('</head>'))
  check('model page: idempotent', shared.patchEndNoticeHtml(mOff, shared.buildComplianceNoticeText({})) === mOff)
  const mOn = shared.patchEndNoticeHtml(mOff, shared.buildComplianceNoticeText({ endNotice: true, endNoticeCredit: true }))
  check('model page, switched on: hide rule removed, the chosen text is put in', !mOn.includes('dsh-end-notice-switch') && mOn.includes('<script id="dsh-end-notice-text">') && mOn.includes(`本视频由${NAME}创作`) && mOn.indexOf('dsh-end-notice-text') < mOn.indexOf('</body>'))
  const mBack = shared.patchEndNoticeHtml(mOn, shared.buildComplianceNoticeText({}))
  check('model page, off again: back to the hidden state exactly', mBack === mOff)
  const evil = shared.patchEndNoticeHtml(model, shared.buildComplianceNoticeText({ endNotice: true, ttsEngine: '</script><script>alert(1)</script>' }))
  check('text injected into the page cannot close the script tag', !/<\/script><script>alert/.test(evil) && evil.includes('\\u003c/script>'))
  const plain = '<html><body><div id="stage"></div></body></html>'
  check('a page without any end notice is left untouched', shared.patchEndNoticeHtml(plain, shared.buildComplianceNoticeText({})) === plain)
})

await section('Remotion engine', async () => {
  const { writeRemotionProjectFiles } = await imp('packages/dsh-tool-media/remotion-generator.js')
  const proj = join(dirs.ws, 'remotion-endnotice')
  mkdirSync(proj, { recursive: true })
  const sc = { title: 't', engine: 'remotion', fps: 30, width: 1080, height: 1920, totalDurationInFrames: 90, scenes: [{ id: 'scene-01', startFrame: 0, durationInFrames: 90, durationSec: 3, title: '你好', narration: '你好', subtitles: [] }] }
  writeFileSync(join(proj, 'script.json'), JSON.stringify(sc, null, 2))
  writeRemotionProjectFiles(proj, sc, {})
  const vc = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  check('composition carries both texts; the default constant is the AI text', /^const END_NOTICE_AI = "本视频含 AI 生成内容：[^"]*";$/m.test(vc) && new RegExp(`^const END_NOTICE_CREDIT = "本视频由${NAME}创作：[^"]*";$`, 'm').test(vc) && vc.includes('const DEFAULT_END_NOTICE = END_NOTICE_AI;'))
  check('the line renders only when script.json switches it on', vc.includes('{(scriptData as any)?.endNotice === true ? (') && vc.includes('text={(scriptData as any)?.endNoticeCredit === true ? END_NOTICE_CREDIT : END_NOTICE_AI}') && (vc.match(/<EndNotice\b/g) || []).length === 1)
  check('the composition imports script.json (the switch is read at render time)', vc.includes("import scriptData from '../script.json';"))
  check('re-patching a fresh composition changes nothing', shared.patchEndNoticeTsx(vc, shared.buildComplianceNoticeText(sc)) === vc)
  const suite = await imp('packages/dsh-tool-video-suite/index.js')
  const tc = await suite.runTypecheckOnProject(proj)
  check('generated composition passes the strict TypeScript check', tc?.ok === true && !tc?.skipped, JSON.stringify((tc?.errors || []).slice(0, 3)) + (tc?.skipped ? ' (skipped: no tsc)' : ''))

  // a composition written by an earlier version: constant + unconditional element (LF and CRLF)
  const legacyLines = [
    "import scriptData from '../script.json';",
    'const DEFAULT_BADGE_TEXT = "AI 辅助创作";',
    'const DEFAULT_END_NOTICE = "本视频由 DSH Video Workbench (by Merziller) 创作：AI 大模型编码驱动视觉合成 · \\"引号\\"";',
    'export const X = () => (',
    '  <AbsoluteFill>',
    '      <EndNotice',
    '        text={DEFAULT_END_NOTICE}',
    '        accentColor={PALETTE.accent}',
    '      />',
    '  </AbsoluteFill>',
    ');',
  ]
  for (const [label, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    const legacy = legacyLines.join(eol)
    const out = shared.patchEndNoticeTsx(legacy, shared.buildComplianceNoticeText({}))
    check(`legacy composition (${label}): constants replaced, element made conditional, no baked-in credit`, out.includes('const END_NOTICE_AI = "本视频含 AI 生成内容：') && out.includes('{(scriptData as any)?.endNotice === true ? (') && !out.includes('text={DEFAULT_END_NOTICE}') && !/DEFAULT_END_NOTICE = "本视频由/.test(out))
    check(`legacy composition (${label}): idempotent`, shared.patchEndNoticeTsx(out, shared.buildComplianceNoticeText({})) === out)
    check(`legacy composition (${label}): the rest of the file is untouched`, out.includes('const DEFAULT_BADGE_TEXT = "AI 辅助创作";') && out.includes('<AbsoluteFill>'))
  }
  const foreign = "import React from 'react';\nexport const Y = () => <div>hi</div>;\n"
  check('a composition without our markers is left untouched', shared.patchEndNoticeTsx(foreign, shared.buildComplianceNoticeText({})) === foreign)
  const dollar = shared.patchEndNoticeTsx(legacyLines.join('\n'), shared.buildComplianceNoticeText({ endNotice: true, ttsEngine: "$& $' $1" }))
  check('replacement text with $ characters is inserted literally', dollar.includes("+ $& $' $1 语音合成"))
})

await section('files on disk follow the switch', async () => {
  const proj = join(dirs.ws, 'sync-endnotice')
  mkdirSync(join(proj, 'src'), { recursive: true })
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const sc = { title: 't', engine: 'html', fps: 30, width: 1280, height: 720, totalDurationInFrames: 60, scenes: [{ id: 'scene-01', startFrame: 0, durationInFrames: 60, durationSec: 2, title: 'a', narration: 'a' }] }
  writeFileSync(join(proj, 'index.html'), buildRichHtmlVideo({ ...sc, endNotice: true, endNoticeCredit: true }))
  writeFileSync(join(proj, 'src', 'VideoComposition.tsx'), "import scriptData from '../script.json';\nconst DEFAULT_END_NOTICE = \"本视频由 DSH Video Workbench (by Merziller) 创作：x\";\n<EndNotice text={DEFAULT_END_NOTICE} accentColor={PALETTE.accent} />\n")
  const r1 = shared.syncEndNoticeFiles(proj, sc)
  check('first sync updates both files', r1.html === 'updated' && r1.remotion === 'updated' && r1.visible === false, JSON.stringify(r1))
  const html = readFileSync(join(proj, 'index.html'), 'utf8')
  const tsx = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  check('after sync: no credit shown in either engine', html.includes('data-end-notice="off" style="display:none"') && !/END_NOTICE_AI = "本视频由/.test(tsx) && tsx.includes('?.endNotice === true ?'))
  const r2 = shared.syncEndNoticeFiles(proj, sc)
  check('second sync writes nothing', r2.html === 'unchanged' && r2.remotion === 'unchanged', JSON.stringify(r2))
  const empty = join(dirs.ws, 'sync-empty')
  mkdirSync(empty, { recursive: true })
  const r3 = shared.syncEndNoticeFiles(empty, sc)
  check('a project without compositions is fine', r3.html === 'absent' && r3.remotion === 'absent')
})

await section('model prompt and publish pack', async () => {
  const { buildHtmlCoderSkillsPrompt } = await imp('packages/dsh-tool-media/shotcraft-lib.js')
  const contract = { fps: 30, totalDurationInFrames: 90, scenes: [{ id: 'scene-01', index: 0, title: 'a', startFrame: 0, durationInFrames: 90, durationSec: 3 }] }
  const pOff = buildHtmlCoderSkillsPrompt({ plan: { scenes: [] }, timingContract: contract, width: 1920, height: 1080, aspectRatio: '16:9' })
  check('coding prompt, default: asks for no end line and names no credit', pOff.system.includes('不要添加任何片尾声明文字（不要写 #end-notice）') && !pOff.system.includes('Merziller'))
  const pOn = buildHtmlCoderSkillsPrompt({ plan: { scenes: [] }, timingContract: { ...contract, endNotice: true }, width: 1920, height: 1080, aspectRatio: '16:9' })
  check('coding prompt, end line on: exact AI text, still no credit', pOn.system.includes('片尾最后 2 秒展示 #end-notice（文字固定为「本视频含 AI 生成内容：') && !pOn.system.includes('Merziller'))
  const pack = await imp('packages/dsh-tool-media/publish-pack.js')
  const src = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'publish-pack.js'), 'utf8')
  check('publish pack uses the same disclosure function', src.includes('const notice = buildComplianceNoticeText(script)') && typeof pack === 'object')
  const n = shared.buildComplianceNoticeText({ title: 'x' })
  check('publish pack disclosure is credit-free by default', !CREDIT.test(n.endNoticeBody))
  // the copy only uses the film's own words
  const copy = pack.buildPublishCopy({ title: '长视频怎么剪', topic: '把直播回放剪成短视频', scenes: [{ title: '先找观点', narration: '第一个方法是先找观点最鲜明的那一段。' }, { title: '看评论' }] }, { platform: 'xiaohongshu', durationSec: 42 })
  check('publish copy: titles / topics / description from the film only', copy.titles[0] === '长视频怎么剪' && copy.hashtags.includes('#先找观点') && copy.description.startsWith('第一个方法') && !/DeepSeek|MotionGraphics|AI视频创作|科技视觉大片|爆款|帧级/.test(JSON.stringify(copy)), JSON.stringify(copy))
  check('publish copy: title cut to the platform length (小红书 20)', pack.buildPublishCopy({ title: '一'.repeat(40) }, { platform: 'xiaohongshu' }).titles.every((t) => Array.from(t).length <= 20))
  check('publish copy: an empty project gets a neutral title and no topics', JSON.stringify(pack.buildPublishCopy({}, {})) === '{"titleBase":"我的视频","titles":["我的视频"],"hashtags":[],"description":"我的视频"}')
  // a real pack: the text follows the switches
  const { resolveBinaries } = shared
  const { spawnSync } = await import('node:child_process')
  const proj = join(SCR, 'pack-proj')
  mkdirSync(join(proj, 'output'), { recursive: true })
  spawnSync(resolveBinaries().ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x223344:s=320x180:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(proj, 'output', 'final.mp4')])
  const writeScript = (extra) => writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: '我的测试片', topic: '测试主题', width: 320, height: 180, fps: 30, totalDurationSec: 1, scenes: [{ id: 'scene-01', title: '开场', narration: '这是开场的一句话。', durationSec: 1 }], ...extra }))
  writeScript({})
  const p1 = await pack.exportPublishPack({ projectDir: proj, mp4Path: 'output/final.mp4', platform: 'douyin' })
  check('publish pack (defaults): no slogans, no credit, says the end line is off, badge on', !/DeepSeek|爆款|帧级|强制挂载|Merziller/.test(p1.metaMarkdown) && p1.metaMarkdown.includes('已带画面角标') && !p1.metaMarkdown.includes('片尾声明」') && p1.metaMarkdown.includes('我的测试片') && p1.metaMarkdown.includes('#开场'), p1.metaMarkdown.split('\n').filter((l) => /标识|标题|#/.test(l)).join(' / '))
  writeScript({ aiBadgeEnabled: false })
  const p2 = await pack.exportPublishPack({ projectDir: proj, mp4Path: 'output/final.mp4', platform: 'douyin' })
  check('publish pack: badge and end line off → says so', p2.metaMarkdown.includes('画面里没有 AI 角标和片尾声明'))
  writeScript({ endNotice: true, endNoticeCredit: true })
  const p3 = await pack.exportPublishPack({ projectDir: proj, mp4Path: 'output/final.mp4', platform: 'douyin' })
  check('publish pack: end line on → listed; the AI note never carries the credit', p3.metaMarkdown.includes('画面角标「AI 辅助创作」和片尾声明') && !CREDIT.test(p3.metaMarkdown))
})

await section('settings travel with the project', async () => {
  const web = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'index.js'), 'utf8')
  check('studio save route stores both switches and re-syncs the compositions', web.includes("...(body.endNotice !== undefined ? { endNotice: body.endNotice === true } : {}),") && web.includes("...(body.endNoticeCredit !== undefined ? { endNoticeCredit: body.endNoticeCredit === true } : {}),") && web.includes('syncEndNoticeFiles(projectDir, updated.data)'))
  const kit = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit', 'src', '60-studio-assets.js'), 'utf8')
  check('画面规格 panel: 片尾声明 toggle, 片尾署名插件 only while it is on', kit.includes("label: '片尾声明（最后一行字）'") && kit.includes("label: '片尾署名插件'") && kit.includes("endOn\n        ? ui.toggle({"))
  const built = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit.js'), 'utf8')
  check('the built kit contains the new toggles (kit rebuilt)', built.includes('片尾声明（最后一行字）') && built.includes('片尾署名插件'))
  const host = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js'), 'utf8')
  check('host page: defaults off, loaded from script.json, accepted by setDirector', host.includes('endNotice: false,') && host.includes('endNotice: ap.script?.endNotice === true,') && host.includes("else if (k === 'endNotice') sync.endNotice = v === true"))
  for (const f of ['talk-edit.js', 'template-fill.js', 'highlight-reel.js']) {
    const s = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', f), 'utf8')
    check(`${f} keeps the switches when it rewrites the project`, s.includes("'endNotice', 'endNoticeCredit'"))
  }
  const media = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'index.js'), 'utf8')
  check('MCP tools describe both switches', (media.match(/endNotice: \{ type: 'boolean'/g) || []).length >= 4 && (media.match(/endNoticeCredit: \{ type: 'boolean'/g) || []).length >= 4)
  const suiteSrc = readFileSync(join(ROOT, 'packages', 'dsh-tool-video-suite', 'index.js'), 'utf8')
  check('render and snapshot sync the compositions first', (suiteSrc.match(/syncEndNoticeFiles\(targetDir, script\)/g) || []).length === 2)
})

try {
  rmSync(SCR, { recursive: true, force: true })
} catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\nend-notice: ${results.length - failed.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
