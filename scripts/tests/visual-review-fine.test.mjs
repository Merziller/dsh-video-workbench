#!/usr/bin/env node
/**
 * 「逐个机位看图」 (fine visual self-review) and the 大模型用量 ledger. No network, no paid model: every model reply is
 * canned; the end-to-end part renders real keyframes of a tiny Remotion project (needs the bundled Remotion runtime and a
 * headless browser; run it alone, one browser at a time).
 *   - scene-keyframes.js planSceneReviewFrames: the classic 35% / 80% pair (stills inside a sub-shot say which 机位), one
 *     still per sub-shot or about every 4 s in fine mode, per-scene cap
 *   - visual-review.js: the fine prompt (机位 labels, crop, shot numbers), parsing of `shot`, loosenCroppedCuts (one step
 *     looser, never twice, nothing to loosen at 远景), the summary line with the re-check
 *   - llm-client.js: normalizeLlmUsage for the 4 wire protocols, the usage ledger (purpose / stage groups, pictures,
 *     parallel calls, calls outside a run, replies without usage), the plain-Chinese summary
 *   - ai-coder.js end to end: a crop finding is fixed by a looser framing (script.json on disk, left out of the rewrite),
 *     the other shot is rewritten with its screenshots, the re-check either reverts a batch the rewrite made worse or
 *     keeps a better one and reports what was resolved
 *
 *   node scripts/tests/visual-review-fine.test.mjs [--no-render]
 *
 * Scratch data only (<repo>/.tmp/visual-review-fine-test/<stamp>); the real `.env` / DSH client are never read.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'visual-review-fine-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'DSH_VIDEO_HOST_AGENT']) delete process.env[v]
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
const NO_RENDER = process.argv.includes('--no-render')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const section = async (name, fn) => {
  console.log(`\n== ${name}`)
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 800))
  }
}

const kf = await imp('packages/dsh-tool-video-suite/scene-keyframes.js')
const vr = await imp('packages/dsh-tool-media/visual-review.js')
const ba = await imp('packages/dsh-tool-media/beat-analyzer.js')
const llm = await imp('packages/dsh-tool-media/llm-client.js')

const cut = (start, end, framing) => ({ start, end, framing, focus: { ...ba.CUT_FRAMING_SPEC[framing].focus }, text: '' })
const sampleScenes = () => [
  { id: 'scene-01', startFrame: 0, durationInFrames: 240, cuts: [cut(0, 80, 'wide'), cut(80, 160, 'close'), cut(160, 240, 'medium')] },
  { id: 'scene-02', startFrame: 240, durationInFrames: 90 },
  { id: 'scene-03', startFrame: 330, durationInFrames: 600 },
]

await section('planSceneReviewFrames: which pictures are looked at', () => {
  const scenes = sampleScenes()
  const std = kf.planSceneReviewFrames(scenes, 30)
  check('standard: the 35% / 80% pair for every shot', std.length === 6 && std.filter((f) => f.sceneId === 'scene-03').map((f) => f.fraction).join() === '0.35,0.8')
  const s1 = std.filter((f) => f.sceneId === 'scene-01')
  check('standard: a still inside a sub-shot says which 机位 it shows', s1[0].cut?.index === 1 && s1[0].cut?.framing === 'close' && s1[1].cut?.index === 2 && s1[1].cut?.count === 3, JSON.stringify(s1.map((f) => f.cut)))
  check('standard: shots without sub-shots carry no 机位', !std.some((f) => f.sceneId !== 'scene-01' && f.cut))

  const fine = kf.planSceneReviewFrames(scenes, 30, { fine: true })
  const f1 = fine.filter((f) => f.sceneId === 'scene-01')
  check('fine: one still in the middle of every sub-shot', f1.map((f) => f.frame).join() === '40,120,200' && f1.map((f) => f.cut.index).join() === '0,1,2' && f1[1].cut.framing === 'close', JSON.stringify(f1))
  const f2 = fine.filter((f) => f.sceneId === 'scene-02')
  check('fine: a short shot keeps the 35% / 80% pair', f2.map((f) => f.fraction).join() === '0.35,0.8')
  const f3 = fine.filter((f) => f.sceneId === 'scene-03')
  check('fine: a 20 s shot without sub-shots gets a still about every 4 s', f3.length === 5 && f3[0].fraction === 0.2 && f3[4].fraction === 0.85, f3.map((f) => f.fraction).join())
  const many = [{ id: 'scene-09', startFrame: 0, durationInFrames: 400, cuts: Array.from({ length: 10 }, (_, k) => cut(k * 40, k * 40 + 40, k % 2 ? 'close' : 'wide')) }]
  const capped = kf.planSceneReviewFrames(many, 30, { fine: true, maxPerScene: 6 })
  check('fine: at most maxPerScene stills, the first and last sub-shot kept', capped.length === 6 && capped[0].cut.index === 0 && capped[5].cut.index === 9, capped.map((f) => f.cut.index).join())
})

await section('review request and reply: 机位 labels, crop, shot numbers', () => {
  const scenes = sampleScenes().map((s) => ({ ...s, title: s.id, visualBlueprint: '外卖骑手在雨夜里看手机订单' }))
  const frames = kf.planSceneReviewFrames(scenes, 30, { fine: true }).map((f) => ({ ...f, base64: 'AAAA' }))
  const req = vr.buildVisualReviewRequest({ batchScenes: scenes, frames, genreLabel: '理论学习卡点动画', fine: true })
  const texts = req.messages[0].content.filter((p) => p.type === 'text').map((p) => p.text)
  const images = req.messages[0].content.filter((p) => p.type === 'image')
  check('fine prompt explains 机位 and asks for crop findings with a shot number', req.system.includes('机位') && req.system.includes('crop（') && req.system.includes('"shot":1') && req.system.includes('大约每 4 秒一张'))
  check('every picture is announced with its 机位 right before it', images.length === frames.length && texts.some((t) => t === 'scene-01 机位2·近景：') && texts.some((t) => t.includes('截图 机位1·远景、机位2·近景、机位3·中景')))
  const plain = vr.buildVisualReviewRequest({ batchScenes: [scenes[1]], frames: frames.filter((f) => f.sceneId === 'scene-02') })
  check('standard prompt without sub-shots is unchanged in substance (35% / 80%, no crop, no shot field)', plain.system.includes('35% 与 80%') && !plain.system.includes('crop（') && !plain.system.includes('"shot"'))
  const reply = JSON.stringify({
    scenes: [
      { id: 'scene-01', seen: '雨夜街口，骑手的头在特写里被切掉', severity: 'major', issues: [{ kind: 'crop', shot: '机位2', detail: '特写机位里骑手的头被裁出画面', fix: '放宽景别' }, { kind: 'text', shot: 99, detail: '标题压住订单', fix: '挪开' }] },
    ],
  })
  const parsed = vr.parseVisualReview(reply, ['scene-01'])
  const is = parsed.scenes['scene-01'].issues
  check('a 机位 written as 「机位2」 is read as shot 2; an impossible number is dropped', is[0].kind === 'crop' && is[0].shot === 2 && is[1].shot === undefined, JSON.stringify(is))
})

await section('loosenCroppedCuts: a cut-off title or face gets a looser framing (no model call)', () => {
  const scenes = sampleScenes()
  const review = {
    'scene-01': { severity: 'major', issues: [{ kind: 'crop', shot: 2, detail: '头被裁' }, { kind: 'crop', shot: 2, detail: '标题也被裁' }, { kind: 'empty', detail: '空' }] },
    'scene-03': { severity: 'major', issues: [{ kind: 'crop', detail: '没有机位的镜头' }] },
  }
  const r = vr.loosenCroppedCuts(scenes, review)
  const c = scenes[0].cuts[1]
  check('近景 → 中景 with the framing’s own centre', c.framing === 'medium' && c.focus.x === ba.CUT_FRAMING_SPEC.medium.focus.x && c.focus.y === ba.CUT_FRAMING_SPEC.medium.focus.y, JSON.stringify(c))
  check('two findings on the same 机位 loosen it once', r.loosened.length === 1 && r.loosened[0].shot === 2 && r.loosened[0].from === 'close')
  check('both crop findings are marked fixed locally; the other problem stays for the rewrite', review['scene-01'].issues[0].resolvedLocally && review['scene-01'].issues[1].resolvedLocally && !review['scene-01'].issues[2].resolvedLocally)
  check('a crop in a shot without sub-shots is left for the rewrite', !review['scene-03'].issues[0].resolvedLocally && !r.resolved['scene-03'])
  const tight = [{ id: 'scene-04', startFrame: 0, durationInFrames: 180, cuts: [cut(0, 60, 'wide'), cut(60, 120, 'detail'), cut(120, 180, 'high')] }]
  const rv2 = { 'scene-04': { severity: 'major', issues: [{ kind: 'crop', detail: '没说是哪个机位' }] } }
  vr.loosenCroppedCuts(tight, rv2)
  check('a crop without a 机位 number loosens every tight sub-shot of the shot', tight[0].cuts.map((x) => x.framing).join() === 'wide,medium,medium' && rv2['scene-04'].issues[0].resolvedLocally)
  const wideOnly = [{ id: 'scene-05', startFrame: 0, durationInFrames: 120, cuts: [cut(0, 60, 'wide'), cut(60, 120, 'wide')] }]
  const rv3 = { 'scene-05': { severity: 'major', issues: [{ kind: 'crop', shot: 1, detail: '远景也出画' }] } }
  const r3 = vr.loosenCroppedCuts(wideOnly, rv3)
  check('a crop at 远景 has nothing to loosen and goes to the rewrite', r3.loosened.length === 0 && !rv3['scene-05'].issues[0].resolvedLocally)
})

await section('summary line', () => {
  const line = vr.summarizeVisualReview({
    detail: 'fine',
    reviewedScenes: 12,
    frameCount: 31,
    majorScenes: 3,
    fixedScenes: 2,
    failedBatches: 0,
    loosenedCuts: [{ sceneId: 'scene-04', shot: 2, from: 'close', to: 'medium' }],
    scenes: { 'scene-04': { severity: 'major', issues: [{ kind: 'crop' }] }, 'scene-07': { severity: 'major', issues: [{ kind: 'empty' }] } },
    recheck: { reviewedScenes: 5, resolvedScenes: ['scene-04', 'scene-07'], remainingScenes: ['scene-09'], revertedBatches: ['src/scenes/Batch03.tsx'] },
  })
  check('says fine mode, stills, local re-framing, re-check results and the revert', line.includes('逐个机位看图') && line.includes('31 张截图') && line.includes('已改成更宽的景别') && line.includes('返工后复查 5 个镜头：2 个问题已解决，1 个仍有问题（scene-09）') && line.includes('1 批返工后更差'), line)
  check('kind names include 推近后被裁切', line.includes('推近后被裁切'))
})

await section('大模型用量: token usage of the 4 wire protocols', () => {
  const n = llm.normalizeLlmUsage
  const j = (x) => JSON.stringify(x)
  check('openai chat (cached part of the prompt)', j(n({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } })) === j({ input: 1000, output: 200, cached: 400 }))
  check('openai responses', j(n({ input_tokens: 500, output_tokens: 90, input_tokens_details: { cached_tokens: 0 } })) === j({ input: 500, output: 90, cached: 0 }))
  check('anthropic (cache tokens are added to the input)', j(n({ input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: 7 })) === j({ input: 115, output: 7, cached: 100 }))
  check('gemini (thinking tokens count as output)', j(n({ promptTokenCount: 300, candidatesTokenCount: 40, thoughtsTokenCount: 60, cachedContentTokenCount: 100 })) === j({ input: 300, output: 100, cached: 100 }))
  check('nothing usable → null', n(null) === null && n({}) === null && n({ foo: 1 }) === null)
})

await section('大模型用量: the ledger of a run', async () => {
  const cfg = { mode: 'custom', provider: 'openai', format: 'openai-completions', baseUrl: 'https://mock-usage.invalid/v1', apiKey: 'mock-key', model: 'mock-model' }
  let n = 0
  const fetchImpl = async (url, opts) => {
    n++
    const body = JSON.parse(opts.body)
    const noUsage = JSON.stringify(body).includes('NO-USAGE')
    return new Response(JSON.stringify({ id: `r${n}`, model: 'mock-model', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], ...(noUsage ? {} : { usage: { prompt_tokens: 1000, completion_tokens: 100 } }) }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const ledger = llm.createLlmUsageLedger()
  await llm.runWithLlmUsage(ledger, async () => {
    ledger.stage = '策划分镜'
    await Promise.all([
      llm.callLlmChat({ overrideConfig: cfg, fetchImpl, purpose: '画面自检看图', messages: [{ role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', mimeType: 'image/jpeg', base64: 'AAAA' }, { type: 'image', mimeType: 'image/jpeg', base64: 'BBBB' }] }] }),
      llm.callLlmChat({ overrideConfig: cfg, fetchImpl, messages: [{ role: 'user', content: '写分镜' }] }),
      (async () => {
        await new Promise((r) => setTimeout(r, 5))
        return llm.callLlmChat({ overrideConfig: cfg, fetchImpl, messages: [{ role: 'user', content: 'NO-USAGE' }] })
      })(),
    ])
  })
  await llm.callLlmChat({ overrideConfig: cfg, fetchImpl, messages: [{ role: 'user', content: 'outside the run' }] })
  const s = ledger.summary()
  check('every call inside the run is counted (parallel and after an await), the one outside is not', s.calls === 3 && n === 4, JSON.stringify(s))
  check('tokens of the calls that reported usage; pictures; one call without usage', s.input === 2000 && s.output === 200 && s.images === 2 && s.counted === 2 && s.uncounted === 1)
  const labels = s.groups.map((g) => g.label)
  check('grouped by purpose, else by the stage label', labels.includes('画面自检看图') && labels.includes('策划分镜'), labels.join())
  const lines = llm.formatLlmUsageSummary(s)
  check('plain-Chinese summary with pictures, the uncounted call and the 账单 note', lines[0].includes('本次大模型用量：调用 3 次') && lines[0].includes('含 2 张图片') && lines[0].includes('1 次接口没有返回用量') && lines[0].includes('账单'), lines.join(' | '))
  check('nothing called → no lines', llm.formatLlmUsageSummary(llm.createLlmUsageLedger().summary()).length === 0)
})

// ------------------------------------------------------------------------------------------- end to end (renders)
const e2e = async (variant) => {
  const { normalizeCast, enrichScenesForVisuals } = await imp('packages/dsh-tool-media/figure-kit.js')
  const { writeRemotionProjectFiles } = await imp('packages/dsh-tool-media/remotion-generator.js')
  const { authorBatchedRemotionScenes } = await imp('packages/dsh-tool-media/ai-coder.js')
  llm.saveVisionSettings({ support: 'yes' })
  const DIR = join(dirs.ws, `fine-${variant}`)
  mkdirSync(DIR, { recursive: true })
  const fps = 30
  const script = {
    title: '雨夜骑手',
    displayTitle: '雨夜骑手',
    engine: 'remotion',
    authoringMode: 'ai-coded',
    genre: 'knowledge',
    genreLabel: '理论学习卡点动画',
    style: 'warm',
    narrationMode: 'subtitle-mv',
    fps,
    width: 1280,
    height: 720,
    aspectRatio: '16:9',
    cast: normalizeCast([{ id: 'rider', name: '骑手小李', look: '黄色雨衣，蓝色头盔', figure: { gender: 'male', outfit: 'coat', colors: { top: '#F2C230' } } }]),
    scenes: [
      { id: 'scene-01', startFrame: 0, durationInFrames: 180, durationSec: 6, startSec: 0, transition: 'cut', layout: 'freeform', title: '雨夜接单', castIds: ['rider'], visualBlueprint: '雨夜街口，骑手停车看手机订单', subtitle: '雨夜里的一单', cuts: [cut(0, 60, 'wide'), cut(60, 120, 'close'), cut(120, 180, 'medium')] },
      { id: 'scene-02', startFrame: 180, durationInFrames: 90, durationSec: 3, startSec: 6, transition: 'cut', layout: 'freeform', title: '催单', castIds: ['rider'], visualBlueprint: '手机屏幕弹出催单提示，骑手加速', subtitle: '系统在催' },
    ],
  }
  script.totalDurationInFrames = 270
  script.totalDurationSec = 9
  enrichScenesForVisuals(script)
  writeFileSync(join(DIR, 'script.json'), JSON.stringify(script, null, 2))
  writeRemotionProjectFiles(DIR, script, { rebuildTemplate: true })

  const head = `import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { Figure, castLook } from '../lib/figure-kit';
export interface CustomSceneProps { scene: any; idx: number; total: number; beats: any[]; }
const Street: React.FC<{ frame: number }> = ({ frame }) => (
  <g>
    <rect x={0} y={0} width={1920} height={1080} fill="#1E2A3A" />
    <rect x={0} y={760} width={1920} height={320} fill="#2C3A4C" />
    <rect x={180} y={240} width={420} height={520} fill="#3B4A60" opacity={0.9 + 0.08 * Math.sin(frame / 15)} />
    <text x={960} y={150} textAnchor="middle" fontSize={96} fill="#F2C230">雨夜里的一单</text>
  </g>
);
const Scene_scene_01: React.FC<CustomSceneProps> = ({ scene }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <Street frame={frame} />
        <Figure look={castLook(scene, 'rider')} style="flat" x={1300} y={905} height={560} facing={-1} script={[{ action: 'walk', from: 0, dur: 60, dx: -300 }, { action: 'present', from: 60, dur: 40 }]} />
      </svg>
    </AbsoluteFill>
  );
};
`
  const emptyShot = `const Scene_scene_02: React.FC<CustomSceneProps> = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#22303F', opacity: interpolate(frame, [0, 20], [0.9, 1], { extrapolateRight: 'clamp' }) }} />;
};
`
  const fixedShot = `const Scene_scene_02: React.FC<CustomSceneProps> = ({ scene }) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 20], [0.6, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <rect x={0} y={0} width={1920} height={1080} fill="#26364A" />
        <rect x={760} y={220} width={400} height={640} rx={40} fill="#0F1620" />
        <text x={960} y={520} textAnchor="middle" fontSize={64} fill="#FF6B5B" opacity={pop}>快点送达！</text>
        <Figure look={castLook(scene, 'rider')} style="flat" x={1500} y={905} height={560} facing={-1} action="run" start={0} />
      </svg>
    </AbsoluteFill>
  );
};
`
  const tail = `export const BATCH_01_SCENES: Record<string, React.FC<CustomSceneProps>> = {
  'scene-01': Scene_scene_01,
  'scene-02': Scene_scene_02,
};
`
  const files = (code) => JSON.stringify({ files: { 'src/scenes/Batch01.tsx': code } })
  const calls = []
  const callLlmChatFn = async ({ messages = [], purpose = '' }) => {
    const content = messages[0]?.content
    const parts = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }]
    const images = parts.filter((p) => p.type === 'image' && String(p.base64 || '').length > 1000).length
    const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    calls.push({ purpose, images, text })
    if (purpose === '画面自检看图') {
      return {
        text: JSON.stringify({
          scenes: [
            { id: 'scene-01', seen: '雨夜街口，近景里标题被切掉一半', severity: 'major', issues: [{ kind: 'crop', shot: 2, detail: '机位2 推近后顶部标题被裁出画面', fix: '放宽景别' }] },
            { id: 'scene-02', seen: '一整块深蓝背景，什么都没有', severity: 'major', issues: [{ kind: 'empty', detail: '画面只有纯色背景，没有手机和骑手', fix: '画出手机催单和骑手' }] },
          ],
        }),
      }
    }
    if (purpose === '返工后复查') {
      return variant === 'worse'
        ? { text: JSON.stringify({ scenes: [
            { id: 'scene-01', seen: '骑手画成了几个方块', severity: 'major', issues: [{ kind: 'figure', detail: '人物变成纸片人', fix: '重画' }] },
            { id: 'scene-02', seen: '手机和文字重叠成一团', severity: 'major', issues: [{ kind: 'text', detail: '文字压在手机上', fix: '挪开' }] },
          ] }) }
        : { text: JSON.stringify({ scenes: [
            { id: 'scene-01', seen: '雨夜街口，中景里标题完整', severity: 'none', issues: [] },
            { id: 'scene-02', seen: '手机弹出催单，骑手在跑', severity: 'none', issues: [] },
          ] }) }
    }
    if (purpose === '画面自检返工') return { text: files(head + fixedShot + tail) }
    return { text: files(head + emptyShot + tail) }
  }
  const progress = []
  const res = await authorBatchedRemotionScenes({
    absDir: DIR,
    lockedScript: script,
    llmConfig: { mode: 'custom', provider: 'openai', format: 'openai-completions', baseUrl: 'https://mock-vision.invalid/v1', apiKey: 'mock-key', model: 'mock-vision' },
    callLlmChatFn,
    batchSize: 4,
    maxRepairRounds: 2,
    visualReview: true,
    visualReviewFine: true,
    onProgress: (_s, _p, msg) => progress.push(String(msg || '')),
  })
  const code = readFileSync(join(DIR, 'src', 'scenes', 'Batch01.tsx'), 'utf8')
  const disk = JSON.parse(readFileSync(join(DIR, 'script.json'), 'utf8'))
  const kfDir = join(DIR, 'output', 'visual-review')
  return { res, calls, code, disk, progress, kfFiles: existsSync(kfDir) ? readdirSync(kfDir) : [], recheckFiles: existsSync(join(kfDir, 'recheck')) ? readdirSync(join(kfDir, 'recheck')) : [] }
}

if (NO_RENDER) {
  console.log('\n(--no-render: end-to-end review skipped)')
} else {
  await section('end to end: crop fixed locally, rewrite of the empty shot, re-check reverts a worse rewrite', async () => {
    const t0 = Date.now()
    const { res, calls, code, disk, kfFiles, recheckFiles } = await e2e('worse')
    console.log(`   (${Math.round((Date.now() - t0) / 1000)} s · calls ${calls.map((c) => `${c.purpose}:${c.images}`).join(', ')})`)
    const vrep = res.visualReview || {}
    // (a 工具返工 pass of the canned code may come first: the coder's tool audit, unrelated to the review)
    const seq = calls.map((c) => c.purpose).filter((p) => p !== '工具返工')
    const by = (p) => calls.find((c) => c.purpose === p) || { images: -1, text: '' }
    const [review, fix, recheck] = ['画面自检看图', '画面自检返工', '返工后复查'].map(by)
    check('the coder ran, then one fine review with a still per 机位 (3 + 2), one rewrite, one re-check of the whole batch', seq.join() === '编写镜头代码,画面自检看图,画面自检返工,返工后复查' && review.images === 5 && recheck.images === 5, calls.map((c) => `${c.purpose}:${c.images}`).join())
    check('the review prompt named the 机位 of each still', review.text.includes('scene-01 机位2·近景'))
    check('the crop was fixed by a looser framing on disk (近景 → 中景), not by the rewrite', disk.scenes[0].cuts[1].framing === 'medium' && (vrep.loosenedCuts || []).length === 1 && !fix.text.includes('机位2 推近后顶部标题') && fix.text.includes('scene-02'), JSON.stringify(disk.scenes[0].cuts.map((c) => c.framing)))
    check('the rewrite got only the empty shot’s screenshots', fix.images === 2)
    check('the re-check found the rewrite worse and went back to the code before it', res.ok && code.includes("background: '#22303F'") && !code.includes('快点送达') && (vrep.recheck?.revertedBatches || []).join() === 'src/scenes/Batch01.tsx', JSON.stringify(vrep.recheck))
    check('what is still wrong is reported (the empty shot)', vrep.remainingMajor === 1 && (vrep.recheck?.remainingScenes || []).includes('scene-02'), `remainingMajor ${vrep.remainingMajor}`)
    check('stills of both looks are kept for the user (机位 in the file names)', kfFiles.some((f) => /^scene-01-c2-/.test(f)) && recheckFiles.length === 5, `${kfFiles.join(' ')} | ${recheckFiles.join(' ')}`)
    const line = vr.summarizeVisualReview(vrep)
    check('the log line tells the whole story', line.includes('逐个机位看图') && line.includes('已改成更宽的景别') && line.includes('已退回返工前的画面'), line)
  })
  await section('end to end: the re-check keeps a better rewrite and reports what was resolved', async () => {
    const t0 = Date.now()
    const { res, calls, code } = await e2e('better')
    console.log(`   (${Math.round((Date.now() - t0) / 1000)} s · calls ${calls.map((c) => `${c.purpose}:${c.images}`).join(', ')})`)
    const vrep = res.visualReview || {}
    check('the rewrite is kept', res.ok && code.includes('快点送达') && !(vrep.recheck?.revertedBatches || []).length)
    check('both problems count as resolved (the re-framed crop and the rewritten shot), nothing remains', (vrep.recheck?.resolvedScenes || []).sort().join() === 'scene-01,scene-02' && vrep.remainingMajor === 0, JSON.stringify(vrep.recheck))
  })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` · FAILED: ${failed.map((f) => f.name).join(' | ')}` : ''} · scratch ${SCR}`)
process.exitCode = failed.length ? 1 : 0
setTimeout(() => process.exit(process.exitCode), 1500).unref()
