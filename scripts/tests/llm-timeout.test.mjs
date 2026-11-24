#!/usr/bin/env node
/**
 * One time limit for every model call the user starts (AI 润色 / AI 立即改 / AI 精修 / AI 协助 / 参考拆解 / 画面自检 /
 * 封面提示词 / 提词稿 …): 10 minutes by default, `DSH_LLM_TIMEOUT_MS` overrides it, and nobody passes a shorter limit.
 *   - getLlmTimeoutMs / formatLlmWait / llmTimeoutMessage;
 *   - against a local mock (scripts/tests/mock-llm-server.mjs): a reply slower than a scaled-down limit fails with the
 *     plain-Chinese timeout message, one within the limit succeeds, the env override is the default limit, `onWait`
 *     heartbeats fire (on the fetch path and on the >240 s node:http path the real default uses);
 *   - static checks: model call sites pass no short limits of their own, LLM-backed MCP tools and panels wait for the
 *     shared limit, and no panel text promises a fixed short wait for a model.
 *
 *   node scripts/tests/llm-timeout.test.mjs
 *
 * Scratch data only (<repo>/.tmp/llm-timeout/<stamp>); no network beyond 127.0.0.1; no keys; the real `.env` and
 * llm-config.json are never read.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODEL_ENV_VARS, startMockLlm } from './mock-llm-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'llm-timeout', new Date().toISOString().replace(/[:.]/g, '-'))
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
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})
const realFetch = globalThis.fetch
let guardedFetchCalls = 0
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error(`network blocked in tests: ${url}`)
  guardedFetchCalls++
  return realFetch(input, init)
}
https.request = () => {
  throw new Error('https blocked in tests')
}
// a fetch that is not globalThis.fetch: callLlmChat then uses fetch (not node:http) and test-sized retry back-offs
const localFetch = (input, init) => realFetch(input, init)

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? `  — ${detail}` : ''}`)
}
const cjk = (s) => /[一-鿿]/.test(String(s || ''))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const llm = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'llm-client.js')).href)

const mock = await startMockLlm((rec) => {
  const ms = Number(/延迟(\d+)/.exec(rec.text)?.[1] || 0)
  return { delayMs: ms, text: '好的' }
})
const useMock = () =>
  writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'custom', configVersion: 2, provider: 'custom', format: 'openai-completions', baseUrl: mock.url, apiKey: 'sk-test-timeout-00000001', model: 'mock-model' }))
const ask = (delayMs, opts = {}) => llm.callLlmChat({ messages: [{ role: 'user', content: `延迟${delayMs}` }], ...opts })
const elapsed = async (fn) => {
  const t = Date.now()
  let err = null
  let out = null
  try {
    out = await fn()
  } catch (e) {
    err = e
  }
  return { ms: Date.now() - t, err, out }
}

try {
  /* ------------------------------------------------------------------------------------------ the shared limit */
  check('default limit is 10 minutes', llm.DEFAULT_LLM_TIMEOUT_MS === 600000 && llm.getLlmTimeoutMs() === 600000)
  process.env.DSH_LLM_TIMEOUT_MS = '900000'
  check('DSH_LLM_TIMEOUT_MS overrides it', llm.getLlmTimeoutMs() === 900000)
  process.env.DSH_LLM_TIMEOUT_MS = 'abc'
  check('a non-number override is ignored', llm.getLlmTimeoutMs() === 600000)
  process.env.DSH_LLM_TIMEOUT_MS = '0'
  check('a zero override is ignored', llm.getLlmTimeoutMs() === 600000)
  process.env.DSH_LLM_TIMEOUT_MS = '10'
  check('a tiny override is clamped to 1 s', llm.getLlmTimeoutMs() === 1000)
  process.env.DSH_LLM_TIMEOUT_MS = '99999999'
  check('a huge override is clamped to 2 hours', llm.getLlmTimeoutMs() === 7200000)
  delete process.env.DSH_LLM_TIMEOUT_MS
  check('formatLlmWait speaks plain Chinese', llm.formatLlmWait(600000) === '10 分钟' && llm.formatLlmWait(90000) === '1 分 30 秒' && llm.formatLlmWait(45000) === '45 秒')
  const msg = llm.llmTimeoutMessage(600000)
  check('timeout message: plain Chinese, the limit, and the old log tag', cjk(msg) && msg.includes('10 分钟') && msg.includes('LLM 请求超时 (600s)') && msg.includes('模型与密钥'), msg)
  check('settings summary reports the limit to the panels', llm.getSafeLlmConfigSummary().timeoutMs === 600000)

  /* ------------------------------------------------------------------------------------ against the mock model */
  useMock()
  let r = await elapsed(() => ask(3000, { timeoutMs: 1000, fetchImpl: localFetch }))
  check('slower than the limit → fails with the plain-Chinese timeout message', r.err && r.err.message === llm.llmTimeoutMessage(1000) && r.err.message.includes('1 秒'), r.err?.message || 'no error')
  check('… and does not wait for the slow reply', r.ms < 2900, `${r.ms} ms`)
  r = await elapsed(() => ask(300, { timeoutMs: 3000, fetchImpl: localFetch }))
  check('within the limit → succeeds', !r.err && r.out?.text === '好的', r.err?.message)

  process.env.DSH_LLM_TIMEOUT_MS = '1000'
  r = await elapsed(() => ask(3000, { fetchImpl: localFetch }))
  check('no timeoutMs passed → DSH_LLM_TIMEOUT_MS is the limit', r.err && r.err.message === llm.llmTimeoutMessage(1000), r.err?.message || 'no error')
  delete process.env.DSH_LLM_TIMEOUT_MS

  const beats = []
  r = await elapsed(() => ask(1100, { fetchImpl: localFetch, waitTickMs: 250, onWait: (b) => beats.push(b) }))
  check('onWait heartbeats fire while the model works', !r.err && beats.length >= 3, `${beats.length} beats`)
  check('heartbeat carries elapsed time, the limit (default 10 min) and the attempt', beats.length > 0 && beats.every((b, i) => b.timeoutMs === 600000 && b.attempt === 1 && (i === 0 || b.elapsedMs >= beats[i - 1].elapsedMs)), JSON.stringify(beats[0]))
  process.env.DSH_LLM_TIMEOUT_MS = '900000'
  const beats15 = []
  await ask(400, { fetchImpl: localFetch, waitTickMs: 250, onWait: (b) => beats15.push(b) })
  check('heartbeat reports the overridden limit', beats15.length > 0 && beats15[0].timeoutMs === 900000, JSON.stringify(beats15[0]))
  delete process.env.DSH_LLM_TIMEOUT_MS

  // the real default (10 min > 240 s) with the runtime's own fetch goes through node:http (undici would cut it at 300 s)
  const guard = globalThis.fetch
  let httpCalls = 0
  const realHttpRequest = http.request
  http.request = function countingRequest(opts, ...rest) {
    const host = typeof opts === 'string' || opts instanceof URL ? new URL(opts).hostname : opts?.hostname || opts?.host
    if (host !== '127.0.0.1') throw new Error(`network blocked in tests: ${host}`)
    httpCalls++
    return realHttpRequest.call(this, opts, ...rest)
  }
  globalThis.fetch = realFetch
  const longBeats = []
  try {
    r = await elapsed(() => ask(800, { waitTickMs: 250, onWait: (b) => longBeats.push(b) }))
  } finally {
    globalThis.fetch = guard
  }
  check('default limit + built-in fetch → node:http long-request path', !r.err && r.out?.text === '好的' && httpCalls === 1, `${r.err?.message || ''} http=${httpCalls}`)
  check('… with heartbeats too', longBeats.length >= 2 && longBeats[0].timeoutMs === 600000, `${longBeats.length}`)
  // a fetch installed on globalThis (a host wrapper, a test mock) keeps handling the long default calls
  guardedFetchCalls = 0
  httpCalls = 0
  r = await elapsed(() => ask(0))
  check('default limit + an installed global fetch → that fetch is used (mocks keep working)', !r.err && guardedFetchCalls === 1 && httpCalls === 0, `fetch=${guardedFetchCalls} http=${httpCalls}`)
  http.request = realHttpRequest

  const ac = new AbortController()
  setTimeout(() => ac.abort(), 200)
  r = await elapsed(() => ask(3000, { timeoutMs: 5000, fetchImpl: localFetch, signal: ac.signal }))
  check('cancel → stops at once, not reported as a timeout', r.err && r.ms < 2000 && !String(r.err.message).includes('超时'), `${r.ms} ms ${r.err?.message}`)

  /* ------------------------------------------------------------------------------------------- static checks */
  // every model call in the plugin: no limit of its own unless it is the shared one
  const CALL = /\b(callLlmChat|callLlmChatFn|invokeLlm|invoker|invoke|guardedLlm|llmCall|callLlm)\s*\(/g
  const argsAt = (src, open) => {
    let depth = 0
    for (let i = open; i < src.length && i < open + 8000; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1)
    }
    return src.slice(open, open + 8000)
  }
  const SHARED = /^(getLlmTimeoutMs\(\)|llmTimeoutMs|tmo|timeoutOpt|timeoutMs)$/
  const offenders = []
  let callSites = 0
  for (const dir of ['packages/dsh-tool-media', 'packages/dsh-tool-local-tts', 'packages/dsh-web-video-workbench/lib']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => /\.(m?js|cjs)$/.test(x))) {
      const src = read(`${dir}/${f}`)
      CALL.lastIndex = 0
      let m
      while ((m = CALL.exec(src))) {
        callSites++
        const t = /timeoutMs\s*:\s*([^,}\n]+)/.exec(argsAt(src, m.index + m[0].length - 1))
        if (t && !SHARED.test(t[1].trim())) offenders.push(`${dir}/${f}:${src.slice(0, m.index).split('\n').length} ${t[1].trim()}`)
      }
    }
  }
  check(`no model call passes its own short limit (${callSites} call sites)`, callSites > 20 && offenders.length === 0, offenders.join(' | '))
  for (const f of ['plan-schema.js', 'cloud-media.js', 'voice-master.js', 'audio-coder.js', 'cover-studio.js']) {
    const src = read(`packages/dsh-tool-media/${f}`)
    check(`${f}: no 180 s / 120 s / 90 s / 45 s model limits`, !/timeoutMs\s*:\s*(180|120|90|45)_?000\b[^\n]*\n?[^\n]*(callLlm|invoke)/.test(src) && !/(callLlm\w*|invoke\w*)\s*\(\s*\{[^}]*timeoutMs\s*:\s*\d/.test(src))
  }
  const vm = read('packages/dsh-tool-local-tts/voice-manager.js')
  check('voice-manager.js: the injected model call gets no own limit', /callLlmChatFn\(\{/.test(vm) && !/callLlmChatFn\(\{[^}]*timeoutMs/.test(vm))
  const lc = read('packages/dsh-tool-media/llm-client.js')
  check('callLlmChat defaults to the shared limit', /const timeoutMs = Number\(timeoutOpt\) > 0 \? Number\(timeoutOpt\) : getLlmTimeoutMs\(\)/.test(lc))
  check('connection test uses the shared limit', /export async function testLlmConnection[\s\S]{0,1600}getLlmTimeoutMs\(\)/.test(lc))
  check('vision probe uses the shared limit', /getLlmTimeoutMs\(\)/.test(read('packages/dsh-tool-media/vision-capability.js')))

  // MCP tools that wrap model calls wait at least for the shared limit
  const idx = read('packages/dsh-tool-media/index.js')
  for (const tool of ['configure_llm_model', 'ai_master_voice', 'ai_create_video', 'ai_refine_scene', 'run_agent_pipeline', 'analyze_reference_video']) {
    const at = idx.indexOf(`name: '${tool}'`)
    const next = at >= 0 ? idx.indexOf("\n    name: '", at + 10) : -1
    const block = at >= 0 ? idx.slice(at, next > at ? next : idx.length) : ''
    const tm = /\n {4}timeoutMs:\s*([^\n]+)/.exec(block)?.[1] || ''
    check(`MCP ${tool} waits for the shared limit`, /getLlmTimeoutMs\(\)/.test(tm), tm)
  }

  // panels: requests that wrap model calls wait for PK.llmTimeout (the server limit + margin), never a short default
  const kit = (f) => read(`packages/dsh-web-video-workbench/lib/warroom/kit/src/${f}`)
  const core = kit('00-core.js')
  check('PK.llmTimeout follows the server limit (llmConfig.timeoutMs) per model call', /PK\.llmTimeout = \(calls = 1\)[\s\S]{0,300}llmConfig\.timeoutMs[\s\S]{0,200}\* Math\.max\(1/.test(core))
  const jobMax = /const maxMs = U\.num\(opts\.maxMs, Math\.max\((\d+), PK\.llmTimeout\((\d+)\)\)\)/.exec(core)
  const refineServerMs = Math.max(3_600_000, 600000 * 4 + 900_000) // MCP ai_refine_scene's allowance at the default limit
  check('PK.job never gives up before the server limit (≥ an AI 精修 job)', jobMax && Math.max(Number(jobMax[1]), 600000 * Number(jobMax[2]) + 120000) >= refineServerMs, jobMax && jobMax[0])
  const KIT_LLM_CALLS = [
    ['30-router.js', /'polishTopic'[^\n]*PK\.llmTimeout\(/],
    ['60-studio-assets.js', /'polishTopic'[^\n]*PK\.llmTimeout\(/],
    ['60-studio-assets.js', /'audio\/llm-compose'[^\n]*PK\.llmTimeout\(/],
    ['70-settings.js', /'llm-test'[^\n]*PK\.llmTimeout\(/],
    ['70-settings.js', /'llm-vision'[\s\S]{0,200}PK\.llmTimeout\(/],
    ['80-ops.js', /'teleprompter\/generate'[\s\S]{0,300}PK\.llmTimeout\(/],
    ['81-project-tools.js', /action: 'ai-prompt'[\s\S]{0,400}PK\.llmTimeout\(/],
  ]
  for (const [f, re] of KIT_LLM_CALLS) check(`kit ${f}: ${re.source.split("'")[1]} waits for PK.llmTimeout`, re.test(kit(f)))
  const built = read('packages/dsh-web-video-workbench/lib/warroom/kit.js')
  check('built kit.js carries the shared-limit helpers (rebuilt after the sources changed)', built.includes('PK.llmTimeout = (calls = 1)') && built.includes("'teleprompter/generate'") && /teleprompter\/generate'[^\n]*PK\.llmTimeout\(/.test(built))
  const texts = ['10-ui.js', '30-router.js', '60-studio-assets.js', '61-studio-scenes.js', '70-settings.js', '80-ops.js', '81-project-tools.js'].map((f) => [f, kit(f)])
  texts.push(['lib/index.js', read('packages/dsh-web-video-workbench/lib/index.js')], ['lib/client.js', read('packages/dsh-web-video-workbench/lib/client.js')])
  const promises = []
  for (const [f, src] of texts) {
    for (const line of src.split('\n')) {
      if (!/大模型|模型|AI|润色|精修|协助|提词/.test(line)) continue
      const m = /(等待|超时|最长|最多|最久)[^'"`\n]{0,12}(180 ?秒|120 ?秒|3 ?分钟|2 ?分钟)|LLM 请求超时 \((180|120)s\)/.exec(line)
      if (m) promises.push(`${f}: ${m[0]}`)
    }
  }
  check('no panel text promises a fixed short wait for a model', promises.length === 0, promises.join(' | '))
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
