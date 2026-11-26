#!/usr/bin/env node
/**
 * 看图能力 (vision capability) — offline checks against local mock model servers for all four wire protocols
 * (scripts/tests/mock-llm-server.mjs):
 *   - per-protocol picture encoding, read back from the JSON bodies the mocks receive;
 *   - one tiny probe when the capability is unknown, the verdict remembered per protocol + endpoint + model (the second
 *     call does not probe; saving the model settings forgets it; verdicts expire);
 *   - typical "this model cannot take pictures" answers (400 image_url is not supported / unknown variant `image_url` /
 *     Invalid content type… / an ambiguous 422) → 'image-rejected' with a plain-Chinese reason and fix; inconclusive
 *     failures (bad key, missing model) are never remembered;
 *   - the user's overrides (支持看图 / 不要发送图片) and a dedicated 看图模型 (same endpoint, or its own endpoint + key);
 *   - analyzeReferenceVideo looks when it can and, when it does not, records the precise reason (tiny ffmpeg test clip).
 *
 *   node scripts/tests/vision-capability.test.mjs
 *
 * Scratch data only (<repo>/.tmp/vision-capability/<stamp>); the real `.env`, llm-config.json and DSH client folder
 * are never read; every model call goes to a mock on 127.0.0.1 (https and other hosts are blocked).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODEL_ENV_VARS, startMockLlm } from './mock-llm-server.mjs'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'vision-capability', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), voices: join(SCR, 'voices'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of MODEL_ENV_VARS) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  VOICE_PACKS_DIR: dirs.voices,
  DSH_CLIENT_HOME: dirs.dshClient, // an empty folder: no DSH client on this "machine"
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})
// no real network: fetch and node:http only to 127.0.0.1, https never
const isLocal = (host) => host === '127.0.0.1' || host === 'localhost'
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error(`network blocked in tests: ${url}`)
  return realFetch(input, init)
}
const realHttpRequest = http.request
http.request = function guardedRequest(opts, ...rest) {
  const host = typeof opts === 'string' || opts instanceof URL ? new URL(opts).hostname : opts?.hostname || opts?.host
  if (!isLocal(String(host || ''))) throw new Error(`network blocked in tests: ${host}`)
  return realHttpRequest.call(this, opts, ...rest)
}
https.request = () => {
  throw new Error('https blocked in tests')
}
https.get = https.request

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? `  — ${detail}` : ''}`)
}
const cjk = (s) => /[一-鿿]/.test(String(s || ''))
const plainChinese = (o) => cjk(o?.short) && cjk(o?.reason)

const llm = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'llm-client.js')).href)
const vc = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'vision-capability.js')).href)

/* ------------------------------------------------------------------------------------------------- the mock models */
const BLUEPRINT = {
  title: '测试参考风格',
  genre: 'product-promo',
  genreLabel: '测试产品宣传动效',
  style: 'tech',
  narrationMode: 'tts',
  visualStyle: '冷色科技感、大面积留白、居中构图',
  colorPalette: { background: '#0B1020', primary: '#38BDF8', accent: '#F472B6', highlight: '#F8FAFC' },
  characterDesign: '产品主体居中，缓慢推近',
  vfxSignature: ['光点粒子', '扫光'],
  transitionSignature: ['zoom-punch', 'flash-cut'],
  subtitleStyle: 'pill',
  subtitleNotes: '底部胶囊字幕',
  shotFormula: [
    { phase: '开场', pctRange: '0%~20%', archetype: 'hero-stand', visualMotif: '产品亮相', transition: 'cut' },
    { phase: '卖点', pctRange: '20%~80%', archetype: 'freeform-stage', visualMotif: '功能演示', transition: 'zoom-punch' },
    { phase: '收尾', pctRange: '80%~100%', archetype: 'channel-end', visualMotif: '落版', transition: 'flash-cut' },
  ],
  replicationPrompt: '按测试参考风格复刻：冷色科技感，产品居中，缓推镜头，胶囊字幕。',
}
// typical answers of endpoints / models that cannot take pictures (only when the request carries one)
const REJECT = {
  'reject-400-not-supported': { status: 400, error: 'image_url is not supported' },
  'reject-400-variant': {
    status: 400,
    raw: 'Failed to deserialize the JSON body into the target type: messages[1].content: unknown variant `image_url`, expected `text` at line 1 column 212',
  },
  'reject-400-invalid-content': { status: 400, error: 'Invalid content type. image_url is only supported by certain models.' },
  // a validation error that does not mention pictures: only asking again without the picture tells the cases apart
  'reject-422': {
    status: 422,
    type: 'application/json',
    raw: JSON.stringify({ detail: [{ type: 'string_type', loc: ['body', 'messages', 1, 'content'], msg: 'Input should be a valid string' }] }),
  },
}
const MAIN_KEY = 'sk-test-main-0000000000001'
const VISION_KEY = 'sk-test-vision-000000000002'
const PROBE_Q = '这张图片是什么颜色'
const PROBE_CONTROL = '这条消息没有附带图片'

function respond(rec) {
  const m = rec.model
  const hasImage = rec.images.length > 0
  const t = rec.text
  if (m === 'auth-fail') return { status: 401, error: 'Incorrect API key provided: sk-test-****0001.' }
  if (m === 'gone') return { status: 404, error: 'The model `gone` does not exist or you do not have access to it.' }
  if (REJECT[m] && hasImage) return REJECT[m]
  if (t.includes(PROBE_CONTROL)) return { text: '收到' }
  if (m === 'blind') return { text: '抱歉，我看不到图片，只能处理文字。' }
  if (m === 'thinker' && t.includes(PROBE_Q) && hasImage) {
    return { text: '<think>用户让我只回答一个颜色词。附件是一个尺寸很小的纯色方块，每个像素都相同，我需要先确认它的色相再作答，不要多说别的话。</think>\n红色' }
  }
  if (t.includes(PROBE_Q)) return { text: hasImage ? '红色' : '我没有收到图片' }
  if (/关键帧/.test(t)) return { text: m === 'no-json' ? '这张合图展示了一个产品宣传片的多个镜头。' : `\`\`\`json\n${JSON.stringify(BLUEPRINT)}\n\`\`\`` }
  return { text: hasImage ? '我看到了图片' : '好的' }
}
const mock = await startMockLlm(respond)
const PROTOCOLS = ['openai-completions', 'anthropic-messages', 'openai-responses', 'gemini-native']
const B64 = vc.VISION_PROBE_IMAGE.base64

/** the plugin's model settings: custom endpoint = the mock, speaking `protocol`, with `model`; 看图 settings reset */
function useMain(protocol, model, vision = undefined) {
  const cfg = { mode: 'custom', configVersion: 2, provider: 'custom', format: protocol, baseUrl: mock.url, apiKey: MAIN_KEY, model, maxTokens: 4096 }
  if (vision) cfg.vision = vision
  writeFileSync(llm.getLlmConfigPath(), JSON.stringify(cfg, null, 2))
  llm.clearVisionCapabilityCache()
  mock.reset()
}
const keyFor = (protocol, model, baseUrl = mock.url) => llm.visionCacheKey({ protocol, baseUrl, model })

try {
  /* ----------------------------------------------------------------------- 1. probe + encoding, every wire protocol */
  for (const p of PROTOCOLS) {
    useMain(p, 'vision-ok')
    const gate = await vc.prepareVisionCall({})
    const r = mock.requests
    check(`[${p}] unknown model → one probe, verdict supported`, gate.ok && gate.source === 'probe' && gate.code === 'supported' && r.length === 1, JSON.stringify({ ok: gate.ok, source: gate.source, code: gate.code, n: r.length }))
    check(`[${p}] probe hits the protocol's own path`, r[0]?.protocol === p, r[0]?.path)
    const img = r[0]?.images?.[0]
    let encOk = false
    if (p === 'openai-completions') encOk = img?.type === 'image_url' && img?.image_url?.url === `data:image/png;base64,${B64}`
    if (p === 'anthropic-messages') encOk = img?.type === 'image' && img?.source?.type === 'base64' && img?.source?.media_type === 'image/png' && img?.source?.data === B64
    if (p === 'openai-responses') encOk = img?.type === 'input_image' && img?.image_url === `data:image/png;base64,${B64}`
    if (p === 'gemini-native') encOk = img?.inlineData?.mimeType === 'image/png' && img?.inlineData?.data === B64
    check(`[${p}] probe picture encoded for the protocol`, encOk && r[0].images.length === 1, JSON.stringify(img || null).slice(0, 160))
    const h = r[0]?.headers || {}
    const keyOk =
      p === 'anthropic-messages' ? h['x-api-key'] === MAIN_KEY && Boolean(h['anthropic-version']) : p === 'gemini-native' ? h['x-goog-api-key'] === MAIN_KEY : h.authorization === `Bearer ${MAIN_KEY}`
    check(`[${p}] probe authenticates the protocol's way`, keyOk)
    if (p === 'gemini-native') check('[gemini-native] model in the path', /\/v1\/models\/vision-ok:generateContent$/.test(r[0]?.path || ''), r[0]?.path)
    if (p === 'openai-responses') check('[openai-responses] asks for a stream (answered as SSE)', r[0]?.body?.stream === true)
    check(`[${p}] verdict remembered for protocol + endpoint + model`, llm.getCachedVisionCapability(keyFor(p, 'vision-ok'))?.status === 'supported')
    mock.reset()
    const again = await vc.prepareVisionCall({})
    check(`[${p}] second call does not probe (remembered)`, again.ok && again.source === 'cache' && mock.requests.length === 0, `${again.source} n=${mock.requests.length}`)

    // pictures the features send: data-URL image_url parts (参考复刻 sends the contact sheet this way) and plain URLs
    mock.reset()
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')
    await llm.callLlmChat({
      overrideConfig: gate.config,
      system: 'test',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看图' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg}` } },
            { type: 'image_url', image_url: { url: 'https://example.invalid/pic.webp' } },
          ],
        },
      ],
    })
    const [a, b] = mock.requests[0]?.images || []
    let both = false
    if (p === 'openai-completions') both = a?.image_url?.url === `data:image/jpeg;base64,${jpeg}` && b?.image_url?.url === 'https://example.invalid/pic.webp'
    if (p === 'anthropic-messages') both = a?.source?.type === 'base64' && a?.source?.media_type === 'image/jpeg' && a?.source?.data === jpeg && b?.source?.type === 'url' && b?.source?.url === 'https://example.invalid/pic.webp'
    if (p === 'openai-responses') both = a?.type === 'input_image' && a?.image_url === `data:image/jpeg;base64,${jpeg}` && b?.image_url === 'https://example.invalid/pic.webp'
    if (p === 'gemini-native') both = a?.inlineData?.mimeType === 'image/jpeg' && a?.inlineData?.data === jpeg && b?.fileData?.fileUri === 'https://example.invalid/pic.webp' && b?.fileData?.mimeType === 'image/webp'
    check(`[${p}] data-URL and URL pictures encoded for the protocol`, both, JSON.stringify([a, b]).slice(0, 200))
  }

  /* ------------------------------------------------------------------- 2. "cannot take pictures" answers, plain Chinese */
  for (const p of PROTOCOLS) {
    for (const model of Object.keys(REJECT)) {
      useMain(p, model)
      const gate = await vc.prepareVisionCall({})
      const n = mock.requests.length
      check(
        `[${p}] ${model} → image-rejected (conclusive)`,
        !gate.ok && gate.code === 'image-rejected' && gate.conclusive === true,
        JSON.stringify({ code: gate.code, detail: gate.detail, n }),
      )
      check(`[${p}] ${model} → plain-Chinese short / reason / fix`, gate.short === `${model} 不支持图片输入` && plainChinese(gate) && /看图能力/.test(gate.fix), `${gate.short} | ${gate.fix}`)
      if (model === 'reject-422') {
        const [first, second] = mock.requests
        check(`[${p}] ambiguous 422 → asked again without the picture`, n === 2 && first?.images.length === 1 && second?.images.length === 0, `n=${n}`)
      } else {
        check(`[${p}] ${model} → the API's own words in the reason`, n === 1 && /image_url|unknown variant|Invalid content type/.test(gate.reason), gate.reason)
      }
      check(`[${p}] ${model} → remembered as unsupported`, llm.getCachedVisionCapability(keyFor(p, model))?.status === 'unsupported')
      mock.reset()
      const again = await vc.prepareVisionCall({})
      check(`[${p}] ${model} → next feature skips straight to the reason`, !again.ok && again.source === 'cache' && again.code === 'image-rejected' && mock.requests.length === 0)
    }
  }

  /* --------------------------------------------------------------- 3. answers that are not verdicts / not configured */
  useMain('openai-completions', 'blind')
  let g = await vc.prepareVisionCall({})
  check('blind model (takes the picture, says it cannot see) → not-looked, remembered', !g.ok && g.code === 'not-looked' && llm.getCachedVisionCapability(keyFor('openai-completions', 'blind'))?.status === 'unsupported', g.code)
  check('not-looked → plain Chinese mentions the red probe and its answer', plainChinese(g) && /红色方块/.test(g.reason) && /看不到图片/.test(g.reason), g.reason)

  useMain('openai-completions', 'thinker')
  g = await vc.prepareVisionCall({})
  check('reasoning model (thinking before the one-word answer) → supported', g.ok && g.code === 'supported' && g.answer === '红色', `${g.code} ${g.answer}`)
  check('probe leaves room for reasoning (maxTokens ≥ 2048)', Number(mock.requests[0]?.body?.max_tokens) >= 2048, String(mock.requests[0]?.body?.max_tokens))

  useMain('anthropic-messages', 'auth-fail')
  g = await vc.prepareVisionCall({})
  check('bad key → auth (not a verdict, not remembered)', !g.ok && g.code === 'auth' && g.conclusive === false && !llm.getCachedVisionCapability(keyFor('anthropic-messages', 'auth-fail')), g.code)
  check('bad key → plain Chinese + fix points at the key', plainChinese(g) && /API Key/.test(g.fix), g.fix)
  mock.reset()
  await vc.prepareVisionCall({})
  check('bad key → asked again next time (nothing remembered)', mock.requests.length === 1)

  useMain('gemini-native', 'gone')
  g = await vc.prepareVisionCall({})
  check('missing model → model-missing, not remembered', !g.ok && g.code === 'model-missing' && !llm.getCachedVisionCapability(keyFor('gemini-native', 'gone')), g.code)

  writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'custom', configVersion: 2, provider: 'custom', format: 'auto', baseUrl: '', apiKey: '', model: '' }))
  mock.reset()
  g = await vc.prepareVisionCall({})
  check('nothing configured → not-configured, no call', !g.ok && g.code === 'not-configured' && g.short === '未配置看图模型' && mock.requests.length === 0, g.code)
  const chk = await vc.checkVisionCapability({})
  check('「检测看图能力」 with nothing configured → plain-Chinese not-configured', !chk.ok && chk.code === 'not-configured' && plainChinese(chk) && /模型与密钥/.test(chk.fix))

  /* -------------------------------------------------------------- 4. remembered verdicts: config change + expiry */
  useMain('openai-completions', 'vision-ok')
  await vc.prepareVisionCall({})
  check('cache file lives under DSH_VIDEO_HOME', existsSync(llm.getVisionCapabilityCachePath()) && llm.getVisionCapabilityCachePath().startsWith(dirs.home))
  mock.reset()
  llm.saveLlmConfig({ mode: 'custom', format: 'openai-completions', baseUrl: mock.url, apiKey: 'KEEP_EXISTING', model: 'vision-ok', temperature: 0.2 })
  check('saving the model settings forgets the verdicts', !llm.getCachedVisionCapability(keyFor('openai-completions', 'vision-ok')))
  g = await vc.prepareVisionCall({})
  check('… so the next feature probes again', g.ok && g.source === 'probe' && mock.requests.length === 1)
  mock.reset()
  llm.saveLlmConfig({ mode: 'custom', format: 'openai-completions', baseUrl: mock.url, model: 'reject-400-variant' })
  g = await vc.prepareVisionCall({})
  check('another model → its own verdict (probed, rejected)', !g.ok && g.source === 'probe' && g.code === 'image-rejected' && mock.requests.length === 1)
  const k = keyFor('openai-completions', 'reject-400-variant')
  const DAY = 86_400_000
  check('a "cannot see" verdict expires (3 days)', Boolean(llm.getCachedVisionCapability(k, Date.now() + 2 * DAY)) && !llm.getCachedVisionCapability(k, Date.now() + 4 * DAY))
  llm.rememberVisionCapability('x | y | z', { status: 'supported', code: 'supported', model: 'z' })
  check('a "can see" verdict expires (7 days)', Boolean(llm.getCachedVisionCapability('x | y | z', Date.now() + 6 * DAY)) && !llm.getCachedVisionCapability('x | y | z', Date.now() + 8 * DAY))
  check('verdict keys tell endpoints apart', keyFor('openai-completions', 'm', 'http://a/v1') !== keyFor('openai-completions', 'm', 'http://b/v1') && keyFor('openai-completions', 'm') !== keyFor('anthropic-messages', 'm'))

  // real calls refine the knowledge (probe: false = do not probe an unknown model, let the real call teach it)
  useMain('openai-completions', 'reject-400-not-supported')
  g = await vc.prepareVisionCall({ probe: false })
  check('probe:false on an unknown model → allowed, source unknown, no call', g.ok && g.source === 'unknown' && mock.requests.length === 0)
  let realErr = null
  try {
    await llm.callLlmChat({ overrideConfig: g.config, messages: [{ role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', ...vc.VISION_PROBE_IMAGE }] }] })
  } catch (err) {
    realErr = err
  }
  const learned = vc.noteVisionOutcome(g, { error: realErr })
  check('a rejected real call is classified and remembered', learned.code === 'image-rejected' && llm.getCachedVisionCapability(keyFor('openai-completions', 'reject-400-not-supported'))?.status === 'unsupported', learned.code)
  const tmo = vc.noteVisionOutcome(g, { error: new Error(llm.llmTimeoutMessage(600000)) })
  check('a timed-out real call → timeout in plain Chinese (10 分钟), not a verdict', tmo.code === 'timeout' && tmo.conclusive === false && /10 分钟/.test(tmo.reason), tmo.reason)
  const tmo90 = vc.classifyVisionError(new Error(llm.llmTimeoutMessage(90000)), { model: 'm', timeoutMs: 90000 })
  check('timeout wording follows the limit (1 分 30 秒)', tmo90.code === 'timeout' && /1 分 30 秒/.test(tmo90.reason), tmo90.reason)
  const net = vc.classifyVisionError(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), { model: 'm' })
  check('connection refused → network in plain Chinese', net.code === 'network' && plainChinese(net) && net.conclusive === false, net.code)
  const local = vc.classifyVisionError(new Error('ENOENT: no such file or directory, open image.png'), { model: 'm' })
  check('a local file error that mentions "image" is not a picture verdict', local.conclusive === false && local.code !== 'image-rejected', local.code)
  const stripped = vc.stripImagesFromMessages([{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image', base64: 'x' }, { type: 'image_url', image_url: { url: 'y' } }] }, { role: 'assistant', content: 'b' }])
  check('stripImagesFromMessages keeps text, drops pictures', stripped[0].content.length === 1 && stripped[0].content[0].text === 'a' && stripped[1].content === 'b')

  /* --------------------------------------------------------------------------------- 5. the user's overrides */
  useMain('openai-completions', 'reject-400-variant')
  llm.saveVisionSettings({ support: 'yes' })
  mock.reset()
  g = await vc.prepareVisionCall({})
  check('「这个模型支持看图」 → pictures go out without a probe', g.ok && g.source === 'user' && g.code === 'user-on' && mock.requests.length === 0, `${g.code} n=${mock.requests.length}`)
  useMain('openai-completions', 'vision-ok', { support: 'no' })
  g = await vc.prepareVisionCall({})
  check('「不要发送图片」 → no picture, no probe, plain-Chinese reason', !g.ok && g.code === 'user-off' && g.short === '已设为不看图' && mock.requests.length === 0 && plainChinese(g) && /自动检测/.test(g.fix), g.fix)
  const sumOff = llm.getSafeLlmConfigSummary().vision
  check('settings summary reports the choice', sumOff.support === 'no' && sumOff.code === 'user-off' && sumOff.short === '已设为不看图')

  // 宿主智能体代写: the agent opens the pictures itself — no probe, no queued task, its own wording
  writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'host-agent', configVersion: 2 }))
  llm.clearVisionCapabilityCache()
  mock.reset()
  g = await vc.prepareVisionCall({})
  check('host-agent mode → pictures go to the agent, no probe', g.ok && g.code === 'host-agent' && g.source === 'host-agent' && mock.requests.length === 0 && plainChinese(g), `${g.code} ${g.source}`)
  const hc = await vc.checkVisionCapability({})
  check('host-agent mode → 「检测看图能力」 answers at once (no task queued for the agent)', hc.ok && hc.code === 'host-agent' && hc.latencyMs === 0 && mock.requests.length === 0, hc.code)
  check('host-agent mode → settings summary says the agent looks', llm.getSafeLlmConfigSummary().vision.code === 'host-agent')
  writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'host-agent', configVersion: 2, vision: { support: 'no' } }))
  g = await vc.prepareVisionCall({})
  check('host-agent mode + 「不要发送图片」 → no pictures', !g.ok && g.code === 'user-off')

  /* ------------------------------------------------------------------------------ 6. a dedicated 看图模型 */
  useMain('openai-completions', 'reject-400-variant', { support: 'auto', model: 'vision-ok' })
  g = await vc.prepareVisionCall({})
  const pr = mock.requests[0]
  check('dedicated model (same endpoint) → probe goes to it with the main key', g.ok && g.dedicated && pr?.model === 'vision-ok' && pr?.headers?.authorization === `Bearer ${MAIN_KEY}` && g.config?.model === 'vision-ok', `${pr?.model}`)
  mock.reset()
  await llm.callLlmChat({ overrideConfig: g.config, messages: [{ role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', ...vc.VISION_PROBE_IMAGE }] }] })
  check('… and the real picture call is routed to the 看图模型', mock.requests[0]?.model === 'vision-ok')
  check('the text model stays the text model', llm.resolveLlmConfig({}).model === 'reject-400-variant')

  useMain('openai-completions', 'reject-400-variant')
  llm.saveVisionSettings({ support: 'auto', model: 'vision-ok', baseUrl: `${mock.url}/`, format: 'anthropic-messages', apiKey: VISION_KEY, provider: 'custom' })
  mock.reset()
  g = await vc.prepareVisionCall({})
  const own = mock.requests[0]
  check(
    'dedicated model on its own endpoint → its protocol, its key, never the main key',
    g.ok && g.protocol === 'anthropic-messages' && own?.protocol === 'anthropic-messages' && own?.headers?.['x-api-key'] === VISION_KEY && !JSON.stringify(own?.headers || {}).includes(MAIN_KEY),
    `${own?.protocol} ${g.protocol}`,
  )
  const summary = llm.getSafeLlmConfigSummary()
  const sumText = JSON.stringify(summary)
  check('settings summary never contains a key (main or 看图)', !sumText.includes(VISION_KEY) && !sumText.includes(MAIN_KEY))
  check('settings summary shows a masked 看图 key + own endpoint', summary.vision.hasApiKey && summary.vision.maskedApiKey && summary.vision.maskedApiKey !== VISION_KEY && summary.vision.ownEndpoint && summary.vision.dedicated)
  check('settings summary shows the remembered verdict in words', summary.vision.status === 'supported' && summary.vision.code === 'supported' && /能看图/.test(summary.vision.short) && Boolean(summary.vision.checkedAt))
  check('settings summary carries the shared model time limit', summary.timeoutMs === 600000)
  llm.saveVisionSettings({ apiKey: summary.vision.maskedApiKey })
  check('saving the masked key back keeps the real key', llm.getVisionSettings().apiKey === VISION_KEY)
  llm.saveVisionSettings({ clearApiKey: true, model: '', baseUrl: '' })
  check('clearing the 看图 key / model works', !llm.getVisionSettings().apiKey && !llm.getVisionSettings().model)
  check('saving 看图 settings forgets the verdicts', !llm.getCachedVisionCapability(keyFor('anthropic-messages', 'vision-ok')))
  check('saving the text model keeps the 看图 settings', (() => {
    llm.saveVisionSettings({ support: 'no' })
    llm.saveLlmConfig({ mode: 'custom', format: 'openai-completions', baseUrl: mock.url, model: 'vision-ok' })
    return llm.getVisionSettings().support === 'no'
  })())

  /* --------------------------------------------------------------------- 7. reference analysis (参考复刻) end to end */
  const { resolveBinaries } = await import(pathToFileURL(join(ROOT, 'packages', 'shared', 'index.js')).href)
  const { ffmpeg } = resolveBinaries()
  const clip = join(SCR, 'clip.mp4')
  const mk = spawnSync(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=192x108:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=22050', '-t', '2.5', '-shortest', '-pix_fmt', 'yuv420p', clip],
    { encoding: 'utf8', timeout: 60000 },
  )
  check('tiny test clip generated with the plugin ffmpeg', mk.status === 0 && existsSync(clip), String(mk.stderr || mk.error || '').slice(0, 200))
  const { analyzeReferenceVideo } = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'reference-analyzer.js')).href)
  const analyze = async (tag) => {
    const projectDir = join(SCR, `proj-${tag}`)
    mkdirSync(projectDir, { recursive: true })
    const notes = []
    const res = await analyzeReferenceVideo({ projectDir, videoPath: clip, applyToScript: false, onProgress: (p) => notes.push(String(p?.message || '')) })
    return { res, rs: res.referenceStyle, vs: res.referenceStyle?.visionStatus || {}, notes, projectDir }
  }
  const t0 = Date.now()
  useMain('openai-completions', 'vision-ok')
  let a = await analyze('looks')
  const sheetReq = mock.requests.find((r) => /关键帧/.test(r.text))
  const sheetUrl = sheetReq?.images?.[0]?.image_url?.url || ''
  check('参考复刻: capable model → probe, then the contact sheet', mock.requests.length === 2 && mock.requests[0].text.includes(PROBE_Q) && Boolean(sheetReq), `n=${mock.requests.length}`)
  check('参考复刻: contact sheet sent as a JPEG data URL', sheetUrl.startsWith('data:image/jpeg;base64,/9j/'))
  check('参考复刻: AI 看图 result used', a.rs.visionAnalyzed === true && a.rs.title === BLUEPRINT.title && a.rs.style === 'tech')
  check('参考复刻: visionStatus = used + model', a.vs.used === true && a.vs.ok === true && a.vs.code === 'used' && a.vs.model === 'vision-ok' && a.vs.source === 'probe' && Boolean(a.vs.checkedAt), JSON.stringify(a.vs))
  const saved = readFileSync(join(a.projectDir, 'reference', 'reference-analysis.json'), 'utf8')
  check('参考复刻: saved analysis carries visionStatus, no key', saved.includes('"visionStatus"') && !saved.includes(MAIN_KEY))
  mock.reset()
  a = await analyze('looks-again')
  check('参考复刻: second analysis does not probe again', mock.requests.length === 1 && /关键帧/.test(mock.requests[0].text) && a.vs.source === 'cache' && a.vs.code === 'used', `n=${mock.requests.length} ${a.vs.source}`)

  useMain('openai-completions', 'reject-400-variant')
  a = await analyze('text-only')
  check('参考复刻: text-only model → not used, precise reason', a.rs.visionAnalyzed === false && a.vs.used === false && a.vs.code === 'image-rejected' && a.vs.short === 'reject-400-variant 不支持图片输入' && /unknown variant/.test(a.vs.reason) && /看图能力/.test(a.vs.fix), JSON.stringify(a.vs).slice(0, 300))
  check('参考复刻: only the probe was sent (no full-size picture to a text model)', mock.requests.length === 1 && mock.requests[0].text.includes(PROBE_Q))
  check('参考复刻: the progress log says why in plain Chinese', a.notes.some((n) => n.startsWith('没有用 AI 看图：') && cjk(n)))

  useMain('openai-completions', 'vision-ok', { support: 'no' })
  a = await analyze('user-off')
  check('参考复刻: 「不要发送图片」 → no call, user-off reason', mock.requests.length === 0 && a.vs.used === false && a.vs.code === 'user-off' && a.rs.visionAnalyzed === false)

  useMain('openai-completions', 'no-json')
  a = await analyze('no-json')
  check('参考复刻: looked but no JSON → bad-json, local measurement kept', a.vs.used === true && a.vs.ok === false && a.vs.code === 'bad-json' && a.rs.visionAnalyzed === false && plainChinese(a.vs) && a.rs.shotCount >= 1, a.vs.code)
  console.log(`   (reference analyses took ${((Date.now() - t0) / 1000).toFixed(1)} s)`)
} catch (err) {
  check('test run threw', false, err?.stack || String(err))
} finally {
  await mock.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `, ${failed.length} failed` : ''}`)
try {
  if (!failed.length) rmSync(SCR, { recursive: true, force: true })
} catch {}
process.exit(failed.length ? 1 : 0)
