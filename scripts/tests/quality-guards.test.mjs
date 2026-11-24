#!/usr/bin/env node
/**
 * Quality guards from the 「项羽生平」 plugin-only test runs (backend, no network, no LLM, no render):
 *   - LLM rate limits: Retry-After parsing, a 429 reported through onRetry and retried, balance errors never retried
 *   - storyboard when the model stays unavailable: one extra Tier-1 attempt, Tier 2/3 skipped, the rule engine
 *     follows the brief's own key points (no generic filler)
 *   - duration: decimals / per-shot wording are no target, a template recipe never sets the duration, a reference
 *     keeps its cut density instead of its absolute shot count
 *   - beat quantisation: spans add up to the planned total (largest remainder), beat counts planned at another tempo
 *     are converted, a target duration is met exactly
 *   - photosensitivity: the shared flash budget (≥ 0.5 s apart, ≤ 7 luminance steps per second), the Remotion
 *     composition gate (lib copy + gated flashes) and the HTML runtime plan
 *   - plaza template: the 霍去病同款 recipe is subject-neutral, applied as a delimited block and stripped by parsers
 *   - delivery true peak: AAC overshoot above −1 dBTP is trimmed by re-encoding only the audio (video copied bit for
 *     bit, frames / A/V sync verified), compliant files are untouched, a failed re-encode restores the original
 *     (a few 3-second FFmpeg encodes; no frame rendering)
 *   - music bed: the AI composer retries an unusable reply once, a silent render (JS or SuperCollider) never becomes
 *     audio/bgm-llm.wav, the mixer replaces a silent bed with the procedural one (the 4th 项羽 run had no music)
 *   - cut accents: in epic genres a clean shot's cut on a downbeat gets one beat-locked epic hit (drum / swish / sweep),
 *     off-beat cuts and the opening shot stay silent, no chimes, spaced ≥ CUT_ACCENT_MIN_GAP_SEC; a history film without
 *     fighting gets an unpitched whoosh / low boom instead of war drums and blades
 *
 *   node scripts/tests/quality-guards.test.mjs
 *
 * Scratch data only (<repo>/.tmp/quality-test/<stamp>); network is blocked; the real `.env` / DSH client are never read.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'quality-test', new Date().toISOString().replace(/[:.]/g, '-'))
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

const BRIEF = '做一个项羽生平的历史动画，以第二人称“你”讲述西楚霸王项羽的一生：会稽起兵、破釜沉舟、巨鹿之战、鸿门宴、自立西楚霸王、楚汉相争，直到垓下之围、霸王别姬、乌江自刎。'
const BRIEF_BEATS = ['会稽起兵', '破釜沉舟', '巨鹿之战', '鸿门宴', '自立西楚霸王', '楚汉相争', '垓下之围', '霸王别姬', '乌江自刎']
const MOCK_LLM = { mode: 'custom', baseUrl: 'https://llm.mock.test/v1', apiKey: 'sk-test', model: 'mock-model', format: 'openai-completions', maxRepairRounds: 1 }
const jsonResp = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

/* ------------------------------------------------------------------------------------------- LLM rate limits */
await section('llm rate limits', async () => {
  const llm = await imp('packages/dsh-tool-media/llm-client.js')
  const hdr = (h) => ({ headers: { get: (k) => h[String(k).toLowerCase()] ?? null } })
  check('Retry-After in seconds', llm.parseRetryAfterMs(hdr({ 'retry-after': '7' })) === 7000)
  check('retry-after-ms wins over Retry-After', llm.parseRetryAfterMs(hdr({ 'retry-after-ms': '1500', 'retry-after': '9' })) === 1500)
  const inFuture = llm.parseRetryAfterMs(hdr({ 'retry-after': new Date(Date.now() + 20_000).toUTCString() }))
  check('Retry-After as an HTTP date', inFuture > 15_000 && inFuture <= 21_000, String(inFuture))
  check('no Retry-After header → 0', llm.parseRetryAfterMs(hdr({})) === 0)

  let calls = 0
  const retries = []
  const flaky = async () => {
    calls++
    if (calls === 1) return jsonResp({ error: { message: 'Upstream rate limit exceeded, please retry later' } }, 429, { 'retry-after': '1' })
    return jsonResp({ choices: [{ message: { role: 'assistant', content: '限流后重试成功' } }] })
  }
  const res = await llm.callLlmChat({ overrideConfig: MOCK_LLM, fetchImpl: flaky, messages: [{ role: 'user', content: 'hi' }], onRetry: (r) => retries.push(r) })
  const text = typeof res === 'string' ? res : res?.text || res?.content || ''
  check('a 429 is retried and the reply comes through', calls === 2 && String(text).includes('限流后重试成功'), `calls=${calls}`)
  check('onRetry reports the rate limit (attempt, wait, status)', retries.length === 1 && retries[0].status === 429 && retries[0].reason === 'rate-limit' && retries[0].attempt === 1 && Number(retries[0].waitMs) >= 0, JSON.stringify(retries))

  calls = 0
  const quota = async () => {
    calls++
    return jsonResp({ error: { message: 'You exceeded your current quota', code: 'insufficient_quota', type: 'insufficient_quota' } }, 429)
  }
  const quotaErr = await llm.callLlmChat({ overrideConfig: MOCK_LLM, fetchImpl: quota, messages: [{ role: 'user', content: 'hi' }] }).then(() => null, (e) => e)
  check('a balance / quota 429 is never retried', quotaErr && calls === 1, `calls=${calls}`)
})

/* ----------------------------------------------------------------------------- brief key points + Tier 4 */
await section('brief fallback', async () => {
  const { extractBriefBeats, MAX_BRIEF_BEAT_CHARS } = await imp('packages/dsh-tool-media/brief-beats.js')
  const { buildPlazaGuidanceBlock } = await imp('packages/dsh-tool-media/plaza-guidance.js')
  check('key points come from the brief\'s enumeration', JSON.stringify(extractBriefBeats({ texts: [BRIEF] })) === JSON.stringify(BRIEF_BEATS), extractBriefBeats({ texts: [BRIEF] }).join('/'))
  const withRecipe = `项羽生平\n\n${buildPlazaGuidanceBlock('模板', '风格：赭红夕照、巨大日轮、斩切、亮闪、短促推近；地图、灭国、追击、称帝、长城、巡行。')}\n${BRIEF}`
  check('a template recipe never contributes key points', JSON.stringify(extractBriefBeats({ texts: [withRecipe] })) === JSON.stringify(BRIEF_BEATS))
  check('an explicit outline wins (headings of "标题：说明")', JSON.stringify(extractBriefBeats({ contentOutline: ['开篇：少年立志', '首战：破釜沉舟渡河', '高潮：巨鹿之战'], texts: [BRIEF] })) === JSON.stringify(['开篇', '首战', '高潮']))
  check('a brief without a list → no key points (generic rules apply)', extractBriefBeats({ texts: ['为社区咖啡馆做一支温暖的秋季新品宣传片'] }).length === 0)
  check('every key point fits under the brief-leak window', extractBriefBeats({ texts: [BRIEF] }).every((b) => b.length <= MAX_BRIEF_BEAT_CHARS))

  const ps = await imp('packages/dsh-tool-media/plan-schema.js')
  check('rate limit / gateway / timeout are transient, balance errors are not', ps.isTransientLlmFailure({ status: 429, message: 'x' }) && ps.isTransientLlmFailure(new Error('大模型接口 (openai) 返回错误 (503): busy')) && ps.isTransientLlmFailure(new Error('请求超时')) && !ps.isTransientLlmFailure(Object.assign(new Error('返回错误 (402): 余额不足'), { status: 402 })) && !ps.isTransientLlmFailure(new Error('JSON parse failed')))

  let calls = 0
  const waits = []
  const rateLimited = async () => {
    calls++
    throw Object.assign(new Error('大模型接口 (openai-responses) 返回错误 (429): Upstream rate limit exceeded, please retry later'), { status: 429 })
  }
  const r = await ps.runSchemaDirectorWithDegradation({
    topic: '项羽生平',
    directorNotes: BRIEF,
    genre: 'history-theater',
    genreLabel: '历史剪影高燃卡点动画',
    style: 'cinematic',
    narrationMode: 'subtitle-mv',
    pacingMode: 'dynamic',
    scriptData: { title: '项羽生平', scenes: [] },
    assetsManifest: { items: [] },
    callLlmChatFn: rateLimited,
    transientRetryDelayMs: 0,
    onLlmWait: (w) => waits.push(w.waitMs),
  })
  check('rate-limited Tier 1 gets exactly one extra attempt, Tier 2/3 are skipped', calls === 2 && waits.length === 1 && Boolean(r.llmOutage), `calls=${calls} waits=${waits.length}`)
  check('the trace names the skipped tiers', r.trace.some((t) => t.tier === 2 && /已跳过/.test(String(t.reason || ''))) && r.trace.some((t) => t.tier === 3 && /已跳过/.test(String(t.reason || ''))))
  const titles = (r.plan?.shots || []).map((s) => String(s.title || ''))
  check('Tier 4 storyboard follows the brief\'s key points', r.degradationTier === 4 && r.briefBeatCount === 9 && BRIEF_BEATS.every((b) => titles.includes(b)), titles.join('/'))

  calls = 0
  const r2 = await ps.runSchemaDirectorWithDegradation({
    topic: '温情家庭故事',
    style: 'warm',
    scriptData: { title: 'x', scenes: [] },
    assetsManifest: { items: [] },
    callLlmChatFn: async () => {
      calls++
      throw new Error('provider down')
    },
    transientRetryDelayMs: 0,
  })
  check('a non-transient failure is not retried and never marked as an outage', r2.degradationTier === 4 && !r2.llmOutage && calls >= 1 && r2.briefBeatCount === 0, `calls=${calls}`)
})

/* --------------------------------------------------------------------------- storyboard completeness */
// Field reports: a 135 s 高燃卡点 film delivered as 13 shots of 10–15 s (the reply was cut off at the output limit and
// accepted as 「Tier 1 · 完整 JSON Schema」); extra shots appended after the closing shot; a 90 s film from a 2-shot plan.
await section('storyboard completeness', async () => {
  const llm = await imp('packages/dsh-tool-media/llm-client.js')
  const ps = await imp('packages/dsh-tool-media/plan-schema.js')
  const ba = await imp('packages/dsh-tool-media/beat-analyzer.js')

  // --- the model client reports cut-off replies and asks for JSON mode (fake fetch, request bodies inspected)
  const bodies = []
  const run = async (format, baseUrl, replies, extra = {}) => {
    let i = 0
    bodies.length = 0
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return replies[Math.min(i++, replies.length - 1)]()
    }
    const r = await llm.callLlmChat({ overrideConfig: { ...MOCK_LLM, format, baseUrl }, fetchImpl, messages: [{ role: 'user', content: 'json please' }], ...extra })
    return { r, calls: i }
  }
  const sse = (lines) => () => new Response(lines.map((l) => `data: ${typeof l === 'string' ? l : JSON.stringify(l)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const chatCut = await run('openai-completions', 'https://llm.mock.test/v1', [() => jsonResp({ choices: [{ message: { content: '{"shots":[' }, finish_reason: 'length' }] })], { responseFormat: 'json' })
  check('openai chat: finish_reason "length" → truncated, JSON mode sent as response_format json_object', chatCut.r.truncated === true && chatCut.r.finishReason === 'length' && bodies[0].response_format?.type === 'json_object')
  const chatOk = await run('openai-completions', 'https://llm.mock.test/v1', [() => jsonResp({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] })])
  check('openai chat: a normal stop is not truncated and no JSON mode unless asked', chatOk.r.truncated === false && chatOk.r.finishReason === 'stop' && !('response_format' in bodies[0]))
  const chatStream = await run('openai-completions', 'https://llm.mock.test/v1', [sse([{ model: 'm', choices: [{ delta: { content: '{"a":' } }] }, { model: 'm', choices: [{ delta: {}, finish_reason: 'length' }] }, { model: 'm', choices: [], usage: { total_tokens: 9 } }, '[DONE]'])])
  check('openai chat stream: the finish_reason chunk is read even when a usage chunk follows', chatStream.r.truncated === true && chatStream.r.finishReason === 'length')
  const retry400 = await run('openai-completions', 'https://llm.mock.test/v1', [() => jsonResp({ error: { message: "Invalid parameter: 'response_format' of type 'json_object' is not supported with this model." } }, 400), () => jsonResp({ choices: [{ message: { content: '{"ok":1}' }, finish_reason: 'stop' }] })], { responseFormat: 'json' })
  check('a 400 that rejects response_format is retried once without it', retry400.calls === 2 && retry400.r.text === '{"ok":1}' && bodies[0].response_format && !('response_format' in bodies[1]))
  const other400 = await run('openai-completions', 'https://llm.mock.test/v1', [() => jsonResp({ error: { message: 'model not found' } }, 400)], { responseFormat: 'json' }).then(() => null, (e) => e)
  check('any other 400 is not retried', other400 && /400/.test(other400.message) && bodies.length === 1)
  const anth = await run('anthropic-messages', 'https://anthropic.mock.test/v1/messages', [() => jsonResp({ type: 'message', content: [{ type: 'text', text: '{"shots":[' }], stop_reason: 'max_tokens' })], { responseFormat: 'json' })
  check('anthropic: stop_reason "max_tokens" → truncated; no JSON-mode field (anthropic has none)', anth.r.truncated === true && anth.r.finishReason === 'max_tokens' && !('response_format' in bodies[0]) && !('text' in bodies[0]))
  const anthStream = await run('anthropic-messages', 'https://anthropic.mock.test/v1/messages', [sse([{ type: 'message_start', message: { stop_reason: null } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"a":' } }, { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }])])
  check('anthropic stream: message_delta stop_reason max_tokens → truncated', anthStream.r.truncated === true)
  const resp = await run('openai-responses', 'https://llm.mock.test/v1/responses', [sse([{ type: 'response.output_text.delta', delta: '{"shots":[' }, { type: 'response.incomplete', response: { object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] } }])], { responseFormat: 'json' })
  check('openai responses: status incomplete → truncated (reason kept); JSON mode as text.format json_object', resp.r.truncated === true && resp.r.finishReason === 'max_output_tokens' && bodies[0].text?.format?.type === 'json_object')
  const gem = await run('gemini-native', 'https://gemini.mock.test/v1beta', [() => jsonResp({ candidates: [{ content: { parts: [{ text: '{"shots":[' }] }, finishReason: 'MAX_TOKENS' }] })], { responseFormat: 'json' })
  check('gemini: finishReason MAX_TOKENS → truncated; JSON mode as generationConfig.responseMimeType', gem.r.truncated === true && gem.r.finishReason === 'MAX_TOKENS' && bodies[0].generationConfig?.responseMimeType === 'application/json')
  const gem400 = await run('gemini-native', 'https://gemini.mock.test/v1beta', [() => jsonResp({ error: { message: 'Invalid JSON payload received. Unknown name "responseMimeType" at generation_config' } }, 400), () => jsonResp({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] })], { responseFormat: 'json' })
  check('gemini: a relay that rejects responseMimeType is asked once more without it', gem400.calls === 2 && gem400.r.truncated === false && !('responseMimeType' in (bodies[1].generationConfig || {})))

  // --- the director: shared fakes
  const grid = (bpm, dur) => {
    const beats = []
    for (let i = 0, t = 0; t <= dur; i++, t += 60 / bpm) beats.push({ time: Number(t.toFixed(4)), strong: i % 4 === 0, index: i })
    return { analyzed: true, bpm, beatSec: 60 / bpm, phaseSec: 0, barOffset: 0, durationSec: dur, beats, downbeats: [], drops: [] }
  }
  const STORY = ['公元前140年 河东平阳', '你在长安长大', '18岁 你率800轻骑', '斩获2028人 封冠军侯', '你回到河东 认父归宗', '越焉支山', '孤军进祁连', '渡河受降', '深入漠北', '70443级', '封狼居胥', '匈奴未灭 何以家为', '你葬于茂陵附近']
  const mvShot = (title, i, extra = {}) => ({ id: `scene-${String(i + 1).padStart(2, '0')}`, title, narration: title, emotion: '激昂有力', actionMode: 'clean', layout: 'narrative-diorama', beatCount: 2, durationSec: 1.33, transition: i ? 'slash-wipe' : 'cut', visualBlueprint: `${title}：剪影人物与地图推进`, stageSpec: { mood: 'dawn-amber', setting: 'vast-plain', archetype: 'hero-stand' }, cast: ['hero'], ...extra })
  const header = { version: 'promo-plan/1', genre: 'history-theater', mode: 'narrative-mv', beatSync: true, title: '霍去病：从少年到封狼居胥', bpm: 90, cast: [{ id: 'hero', name: '霍去病', aliases: ['你'], figure: { outfit: 'armor' } }] }
  const bgm135 = grid(90, 142.6)
  const direct = (extra) =>
    ps.runSchemaDirectorWithDegradation({
      topic: '霍去病：从少年到封狼居胥',
      genre: 'history-theater',
      genreLabel: '历史剪影高燃卡点动画',
      style: 'cinematic',
      scriptData: { fps: 30, width: 1920, height: 1080, narrationMode: 'subtitle-mv', scenes: [] },
      assetsManifest: { items: [] },
      bgmMeta: bgm135,
      narrationMode: 'subtitle-mv',
      pacingMode: 'dynamic',
      durationMode: 'custom',
      targetDurationSec: 135,
      transientRetryDelayMs: 0,
      ...extra,
    })
  const filmSpans = (res, bgm, target) =>
    ba.quantizeScenesToBeatGrid(res.resolved.resolvedShots, bgm, { mode: 'subtitle-mv', fps: 30, targetDurationSec: target, genre: 'history-theater', narrationMode: 'subtitle-mv', pacingMode: 'dynamic' }).map((s) => s.durationSec)

  // (1) a weak model answers every call with the same storyboard cut off after 13 shots (valid JSON; only the
  //     provider's finish_reason says it was cut off) → detected, continued (nothing new comes back), densified locally
  const cut13 = JSON.stringify({ ...header, shots: STORY.map((t, i) => mvShot(t, i)) })
  const cutArgs = []
  const weak = await direct({ callLlmChatFn: async (a) => (cutArgs.push(a), { text: cut13, truncated: true, finishReason: 'length' }) })
  const weakTitles = weak.plan.shots.map((s) => s.title)
  check('a cut-off 13-shot reply is detected from finish_reason (not accepted as complete)', weak.planCheck.truncated === true && weak.trace.some((t) => t.tier === '1-cutoff' && t.finishReason === 'length'), JSON.stringify(weak.trace.slice(0, 3)))
  check('every planning call asks for JSON mode', cutArgs.length >= 2 && cutArgs.every((a) => a.responseFormat === 'json'), `${cutArgs.length} calls`)
  check('…and densified locally to at least 85 % of the minimum (46–62 shots for 135 s)', weak.plan.shots.length >= Math.round(46 * 0.85) && weak.planCheck.densified && weak.plan.densified?.fromShots === 13, `${weak.plan.shots.length} shots`)
  check('a rebuilt / densified plan is never labelled 「Tier 1 · 完整 JSON Schema」', weak.degradationTier === 1 && weak.tierLabel !== 'Tier 1 · 完整 JSON Schema' && /截断/.test(weak.tierLabel) && /本地加密补镜/.test(weak.tierLabel), weak.tierLabel)
  check('the planning log line says 「计划 N 镜 / 需要 X–Y 镜」', weak.shotPlanLine === `计划 ${weak.plan.shots.length} 镜 / 需要 46–62 镜`, weak.shotPlanLine)
  check('plain-Chinese warnings name the cut-off and the local densifying', weak.planWarnings.some((w) => /被截断/.test(w)) && weak.planWarnings.some((w) => /拆成/.test(w) && /13 镜/.test(w)), JSON.stringify(weak.planWarnings))
  check('story order kept: the first and the closing shot stay first and last', weakTitles[0] === STORY[0] && weakTitles[weakTitles.length - 1] === STORY[12] && weakTitles.indexOf('封狼居胥') < weakTitles.lastIndexOf('你葬于茂陵附近'))
  const weakSpans = filmSpans(weak, bgm135, 135)
  check('no picture of the delivered film is held for 10 s or more (was 10.7–15 s)', Math.max(...weakSpans) < 6, `max ${Math.max(...weakSpans).toFixed(2)} s over ${weakSpans.length} shots`)

  // (2) a model that ignores the outline step, runs out of tokens after 13 shots and then continues from the cut
  const contCalls = []
  const contFake = async ({ system = '', messages = [] } = {}) => {
    if (/【续写分镜】/.test(system)) {
      const from = Number((system.match(/接着写第 (\d+)~(\d+) 镜/) || [])[1])
      const to = Number((system.match(/接着写第 (\d+)~(\d+) 镜/) || [])[2])
      contCalls.push(`${from}-${to}`)
      const last = 50
      const shots = []
      for (let n = from; n <= Math.min(to, last); n++) shots.push(mvShot(n === last ? '终章：长河落日' : `征战第${n}镜`, n - 1, n === last ? { stageSpec: { archetype: 'channel-end' } } : {}))
      return { text: JSON.stringify({ shots, done: to >= last }), finishReason: 'stop' }
    }
    contCalls.push(/分页规划 · 第 1 步/.test(system) ? 'outline' : 'other')
    return { text: cut13, truncated: true, finishReason: 'length' }
  }
  const cont = await direct({ callLlmChatFn: contFake })
  const contTitles = cont.plan.shots.map((s) => s.title)
  check('a cut-off reply is continued from the cut, page by page, in story order', cont.planCheck.recovered === 'continue' && contCalls[1] === '14-21' && contTitles[13] === '征战第14镜' && contTitles.slice(0, 13).join() === STORY.join(), contCalls.join(','))
  check('…until the model writes the closing shot (which stays last); no local densifying needed', contTitles[contTitles.length - 1] === '终章：长河落日' && cont.plan.shots.length === 50 && !cont.planCheck.densified && cont.planCheck.storyFinished === true, `${cont.plan.shots.length} shots`)
  check('…labelled honestly and warned about', cont.tierLabel === 'Tier 1 · 回复被截断，已续写补全' && cont.planWarnings.some((w) => /续写到 50 镜/.test(w)), cont.tierLabel)

  // (3) a long film is planned in pages by a fast model: outline first, then ≤ 8 shots per call
  const SEG = ['少年长安', '初出茅庐', '河西大战', '祁连孤军', '漠北决战', '封狼居胥', '英年早逝']
  const pageCalls = []
  const pagedFake = async ({ system = '', messages = [], maxTokens } = {}) => {
    if (/分页规划 · 第 1 步/.test(system)) {
      pageCalls.push({ kind: 'outline', maxTokens })
      return { text: JSON.stringify({ ...header, segments: SEG.map((t, i) => ({ title: t, summary: `${t}的故事`, shots: i === 6 ? 4 : 8, cast: ['hero'] })) }) }
    }
    const m = system.match(/只写第 (\d+)~(\d+) 镜/)
    const body = JSON.parse(messages[0].content)
    pageCalls.push({ kind: 'page', from: Number(m[1]), to: Number(m[2]), maxTokens })
    const shots = []
    let n = Number(m[1])
    for (const it of body.pagedPlan.thisPage) for (let k = 0; k < it.shots; k++, n++) shots.push({ ...mvShot(`${SEG[it.n - 1]}·${n}`, n - 1), segment: it.n })
    return { text: JSON.stringify({ shots }) }
  }
  const paged = await direct({ callLlmChatFn: pagedFake })
  const pages = pageCalls.filter((c) => c.kind === 'page')
  check('a 135 s 高燃 film is planned as outline + pages of ≤ 8 shots', pageCalls[0]?.kind === 'outline' && pages.length === 7 && pages.every((p) => p.to - p.from + 1 <= ps.PLAN_PAGE_SHOTS), pageCalls.map((c) => c.kind === 'page' ? `${c.from}-${c.to}` : c.kind).join(','))
  check('every paged call stays well under a 8k output cap', pageCalls.every((c) => Number(c.maxTokens) <= 8000), pageCalls.map((c) => c.maxTokens).join(','))
  check('the paged plan has the shots the film needs, in story order, closing shot last', paged.plan.shots.length === 54 && paged.plan.shots[0].title === '少年长安·1' && paged.plan.shots[53].title === '英年早逝·54' && paged.planCheck.complete === true && paged.planWarnings.length === 0, `${paged.plan.shots.length} shots`)
  check('a paged plan says so in its label', /分页 JSON 分镜/.test(paged.tierLabel) && paged.tierLabel !== 'Tier 1 · 完整 JSON Schema', paged.tierLabel)

  // (4) the 90 s 毛选 film: a 2-shot plan → at least 31 shots (nothing more comes from the model)
  const twoShot = JSON.stringify({ version: 'promo-plan/1', genre: 'other', mode: 'narrative-mv', title: '读毛选解难题', bpm: 96, shots: [
    { id: 'scene-01', title: '读毛选解难题', narration: '一本书，一套方法。分清处境，才能找到出路。看清谁是朋友，谁在制造难题。', beatCount: 4, durationSec: 2.5, visualBlueprint: '书页翻开，关键词浮现', highlights: ['分清处境', '找到出路'] },
    { id: 'scene-02', title: '团结起来', narration: '外卖骑手、工厂工人、小店主。处境相通，命运相连。团结起来，才有力量。', beatCount: 4, durationSec: 2.5, visualBlueprint: '三个劳动者在晨光中并肩', highlights: ['团结起来'] },
  ] })
  const bgm90 = grid(96, 96)
  const two = await ps.runSchemaDirectorWithDegradation({
    topic: '读毛选解难题', genre: 'other', genreLabel: '理论学习卡点动画', style: 'documentary',
    scriptData: { fps: 30, width: 1920, height: 1080, narrationMode: 'subtitle-mv', scenes: [] }, assetsManifest: { items: [] }, bgmMeta: bgm90,
    narrationMode: 'subtitle-mv', pacingMode: 'dynamic', durationMode: 'custom', targetDurationSec: 90,
    callLlmChatFn: async () => ({ text: twoShot, finishReason: 'stop' }), transientRetryDelayMs: 0,
  })
  const twoSpans = filmSpans(two, bgm90, 90)
  check('a 2-shot plan for a 90 s film becomes at least 31 shots (was 45 + 45 s)', two.plan.shots.length >= 31 && two.planCheck.densified && Math.max(...twoSpans) < 6, `${two.plan.shots.length} shots, max ${Math.max(...twoSpans).toFixed(2)} s`)
  check('densified sub-shots split the subtitle text, vary the camera and keep the closing shot last', new Set(two.plan.shots.map((s) => s.narration)).size >= 6 && new Set(two.plan.shots.map((s) => s.visualBlueprint)).size >= 20 && two.plan.shots[two.plan.shots.length - 1].title === '团结起来')

  // (5) extra shots of a short but finished storyboard go between the shots, never after the closing shot
  const shortPlan = JSON.stringify({ ...header, shots: ['开篇', '少年', '初战', '大捷', '终章：你葬于茂陵附近'].map((t, i) => mvShot(t, i)) })
  const insertFake = async ({ system = '' } = {}) => {
    if (/【补镜加密】/.test(system)) return { text: JSON.stringify({ inserts: [{ afterId: 'scene-02', shot: mvShot('少年练兵', 0) }, { afterId: 'scene-05', shot: mvShot('漠北决战', 0) }], appendShots: [mvShot('凯旋', 0)] }) }
    return { text: shortPlan }
  }
  const ins = await direct({ callLlmChatFn: insertFake, targetDurationSec: 40, bgmMeta: grid(90, 60) })
  const insTitles = ins.plan.shots.map((s) => s.title)
  const firstAt = (t) => insTitles.indexOf(t)
  const lastAt = (t) => insTitles.lastIndexOf(t)
  check('follow-up shots are inserted in story order and never after the closing shot', firstAt('少年练兵') > lastAt('少年') && lastAt('少年练兵') < firstAt('初战') && firstAt('漠北决战') > lastAt('大捷') && lastAt('凯旋') < firstAt('终章：你葬于茂陵附近') && insTitles[insTitles.length - 1] === '终章：你葬于茂陵附近' && ins.planCheck.recovered === 'insert', insTitles.join('|'))
  check('mergeShotInserts: an unknown anchor and the closing shot as anchor both land before the closing shot', (() => {
    const base = ['a', 'b', 'c'].map((t, i) => ({ id: `s${i}`, title: t, narration: t }))
    const m = ps.mergeShotInserts(base, { inserts: [{ afterId: 's2', shot: { title: 'x', narration: 'x' } }, { afterId: 'nope', shot: { title: 'y', narration: 'y' } }, { afterId: 's0', shot: { title: 'a', narration: 'a' } }] })
    return m.shots.map((s) => s.title).join('') === 'abxyc' && m.added === 2
  })())

  // (6) a fine calm / TTS film is left exactly as the model wrote it (one call, no follow-ups, honest label)
  const calmShots = Array.from({ length: 9 }, (_, i) => ({ id: `scene-${String(i + 1).padStart(2, '0')}`, title: `秋日第${i + 1}幕`, narration: `第${i + 1}幕，咖啡馆的午后，阳光落在窗边的木桌上，我们慢慢讲完这个故事。`, durationSec: 6, layout: 'freeform-stage', transition: i ? 'light-wipe' : 'cut', visualBlueprint: `咖啡馆第${i + 1}幕` }))
  let calmCalls = 0
  const calm = await ps.runSchemaDirectorWithDegradation({
    topic: '社区咖啡馆的秋天', style: 'warm', scriptData: { title: '社区咖啡馆的秋天', scenes: [] }, assetsManifest: { items: [] },
    narrationMode: 'tts', pacingMode: 'calm',
    callLlmChatFn: async () => (calmCalls++, { text: JSON.stringify({ version: 'promo-plan/1', title: '社区咖啡馆的秋天', shots: calmShots }), finishReason: 'stop' }),
    transientRetryDelayMs: 0,
  })
  check('a calm TTS plan already in range is unchanged: one call, same shots, 「完整 JSON Schema」, no warnings', calmCalls === 1 && calm.plan.shots.length === 9 && calm.plan.shots.map((s) => s.title).join() === calmShots.map((s) => s.title).join() && calm.tierLabel === 'Tier 1 · 完整 JSON Schema' && calm.planWarnings.length === 0 && !calm.plan.densified, `${calmCalls} calls · ${calm.tierLabel} · ${calm.shotPlanLine}`)

  // (7) JSON salvage: a reply cut inside shot 14 keeps 13 whole shots and is flagged as salvaged
  const cutText = cut13.slice(0, cut13.indexOf('"id":"scene-13"') + 30)
  const salvaged = ps.extractPlanJson(cutText)
  check('a reply cut inside a shot is rebuilt from its whole shots and flagged as cut off', salvaged.salvaged === true && salvaged.json?.shots?.length === 12 && salvaged.json?.title === header.title)
  check('the salvage works for any array key (inserts / appendShots / segments)', ps.extractPlanJson('{"inserts":[{"afterId":"s1","shot":{"title":"x"}},{"afterId":"s2","shot":{"ti').json?.inserts?.length === 1 && ps.extractPlanJson('{"segments":[{"title":"a","shots":3},{"title":"b","sho').json?.segments?.length === 1)

  // (8) the pipeline shows the shot count line and every planning warning
  const orchSrc = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'pipeline-orchestrator.js'), 'utf8')
  check('the pipeline logs 「计划 N 镜 / 需要 X–Y 镜」 and surfaces each planning warning', orchSrc.includes('schemaRes.shotPlanLine') && /for \(const w of Array\.isArray\(schemaRes\.planWarnings\)/.test(orchSrc) && orchSrc.includes('onProgress: (msg)'))
})

/* ----------------------------------------------------------------------------------------------- duration */
await section('duration policy', async () => {
  const dp = await imp('packages/shared/duration-policy.js')
  const { stripPlazaTemplateGuidance, buildPlazaGuidanceBlock } = await imp('packages/dsh-tool-media/plaza-guidance.js')
  const pol = (text, extra = {}) => dp.resolveTargetDurationPolicy({ text, narrationMode: 'subtitle-mv', ...extra })
  check('"平均3.42秒" is not a 42 s target', pol('全片约45镜，平均3.42秒').enforced === false)
  check('"154.05秒" is not a 5 s / 154 s target', pol('制作154.05秒的短片').enforced === false)
  check('per-shot wording is not a target', pol('最短0.66秒，每个镜头2秒').enforced === false)
  check('"做一个90秒的片子" is a 90 s target', pol('做一个90秒的片子').enforced === true && pol('做一个90秒的片子').targetSec === 90)
  const legacy = `项羽生平\n\n【影核广场模板复刻指导 · 旧模板】\n制作120秒、1280×720的短片，全片约45镜。\n${BRIEF}`
  check('a legacy template paragraph is stripped before parsing', stripPlazaTemplateGuidance(legacy).includes('乌江自刎') && !stripPlazaTemplateGuidance(legacy).includes('120秒') && pol(stripPlazaTemplateGuidance(legacy)).enforced === false)
  const current = `${BRIEF}\n${buildPlazaGuidanceBlock('模板', '时长 120 秒，45 镜')}`
  check('a current template block is stripped before parsing', !stripPlazaTemplateGuidance(current).includes('120') && stripPlazaTemplateGuidance(current).includes('会稽起兵'))
  const auto = pol(BRIEF, { referenceShotCount: 53, referenceDurationSec: 123.3 })
  check('a 53-shot 123 s template keeps its density in a 65 s film (≈28 shots, not 45~61)', auto.targetSec === 65 && auto.targetShotsMin <= 28 && auto.targetShotsMax <= 40, `${auto.targetShotsMin}~${auto.targetShotsMax}`)
  const sameLen = pol(BRIEF, { referenceShotCount: 53, referenceDurationSec: 123.3, bgmDurationSec: 123 })
  check('same length as the template film → the template\'s own shot count', sameLen.targetShotsMin >= 44 && sameLen.targetShotsMax >= 53, `${sameLen.targetShotsMin}~${sameLen.targetShotsMax}`)
  check('the subtitle-mv directive quotes no fixed shot standard', !/34~52/.test(auto.promptDirective) && auto.promptDirective.includes(`${auto.targetShotsMin}~${auto.targetShotsMax}`))
})

/* ---------------------------------------------------------------------------------------- beat quantisation */
await section('beat quantisation', async () => {
  const ba = await imp('packages/dsh-tool-media/beat-analyzer.js')
  // the run-2 storyboard's beat counts (46 shots, planned at 90 BPM)
  const counts = [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 4, 0.5, 0.5, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 4, 0.5, 0.5, 1, 1, 2, 1, 1, 2, 1, 1, 4, 0.5, 0.5, 1, 2, 1, 1, 2]
  const scenes = counts.map((c, i) => ({ id: `s${i}`, beatCount: c, narration: 'x' }))
  const grid = (bpm, dur) => {
    const b = 60 / bpm
    const beats = []
    for (let t = 0, i = 0; t < dur; t += b, i++) beats.push({ time: Number(t.toFixed(4)), strong: i % 4 === 0, index: i })
    return { bpm, beatSec: b, beats, durationSec: dur, analyzed: true }
  }
  const total = (sc) => {
    const l = sc[sc.length - 1]
    return (l.startFrame + l.durationInFrames) / 30
  }
  const opts = { mode: 'subtitle-mv', fps: 30, genre: 'history-theater', narrationMode: 'subtitle-mv', pacingMode: 'dynamic' }
  const planned = counts.reduce((a, b) => a + b, 0) * (60 / 90)
  const same = total(ba.quantizeScenesToBeatGrid(scenes, grid(90, planned + 4), opts))
  // shots of 4+ beats snap their cut to the nearest strong downbeat (≤ 1 beat later each) — never shorter than planned
  const snapAllowance = counts.filter((c) => c >= 4).length * (60 / 90) + 0.1
  check('no drift below the planned total (only downbeat snaps may lengthen it)', same >= planned - 0.1 && same <= planned + snapAllowance, `${same.toFixed(2)} vs ${planned.toFixed(2)}`)
  const tgt = total(ba.quantizeScenesToBeatGrid(scenes, grid(104, 44), { ...opts, targetDurationSec: 42 }))
  check('a target duration is met exactly', Math.abs(tgt - 42) < 0.05, tgt.toFixed(2))
  const conv = total(ba.quantizeScenesToBeatGrid(scenes, grid(104, 44), { ...opts, planBpm: 90 }))
  const unconverted = total(ba.quantizeScenesToBeatGrid(scenes, grid(104, 44), opts))
  check('beats planned at 90 BPM keep their seconds on a 104 BPM track', Math.abs(conv - planned) < 1.2 && conv > unconverted + 3, `${conv.toFixed(2)} (unconverted ${unconverted.toFixed(2)})`)
})

/* --------------------------------------------------------------------------------------- photosensitivity */
await section('flash budget', async () => {
  const fb = await imp('packages/dsh-tool-media/flash-budget.js')
  // a clash flurry every 8.5 frames (run 2, shot 12) + its flash-cut + the next shot's exit wash
  const cands = [{ key: 'tx:12', frame: 277, len: 9, prio: 4, coversCut: 277 }]
  ;[278, 286, 295, 303, 312, 321, 329, 338].forEach((f, i) => cands.push({ key: `clash:12:${i}`, frame: f, len: 3, prio: i === 7 ? 5 : 3 }))
  cands.push({ key: 'exit:12', frame: 346, lead: 4, len: 1, prio: 1, coversCut: 347 })
  const cuts = [260, 277, 347, 356, 365]
  const plan = fb.scheduleFlashBudget({ fps: 30, candidates: cands, cutFrames: cuts })
  const keptFrames = cands.filter((c) => plan.kept.includes(c.key)).map((c) => c.frame).sort((a, b) => a - b)
  const minGap = keptFrames.slice(1).reduce((m, f, i) => Math.min(m, f - keptFrames[i]), Infinity)
  check('kept flashes are at least 0.5 s apart', minGap >= 15, `kept ${plan.kept.join(' ')}`)
  check('the heavy clash (highest priority) is always kept', plan.kept.includes('clash:12:7'))
  let worst = 0
  for (let w = 240; w < 400; w++) {
    let steps = 0
    for (const c of cands.filter((x) => plan.kept.includes(x.key))) {
      const s0 = c.frame - (c.lead || 0)
      if (s0 < w + 30 && c.frame + c.len > w) steps += 2
    }
    const covered = new Set(cands.filter((x) => plan.kept.includes(x.key) && x.coversCut != null).map((x) => x.coversCut))
    for (const cut of cuts) if (cut >= w && cut < w + 30 && !covered.has(cut)) steps += 1
    worst = Math.max(worst, steps)
  }
  check('no 1-second window exceeds 7 luminance steps', worst <= fb.FLASH_MAX_STEPS_PER_WINDOW, `worst ${worst}`)
  const again = fb.scheduleFlashBudget({ fps: 30, candidates: [...cands].reverse(), cutFrames: cuts })
  check('scheduling is order independent (deterministic frames)', JSON.stringify([...again.kept].sort()) === JSON.stringify([...plan.kept].sort()))
  check('isolated flashes are all kept', fb.scheduleFlashBudget({ fps: 30, candidates: [{ key: 'a', frame: 0 }, { key: 'b', frame: 60 }, { key: 'c', frame: 120 }], cutFrames: [60, 120] }).kept.length === 3)

  // HTML runtime plan: dropped flashes are marked, the payload carries them, the double cut strobe is gone
  const html = await imp('packages/dsh-tool-media/html-generator.js')
  const sc = (i, extra = {}) => ({ id: `scene-${i}`, title: `第${i}镜 战`, narration: '斩', durationInFrames: 15, transition: 'flash-cut', ...extra })
  const script = {
    title: 'flash',
    fps: 30,
    width: 1280,
    height: 720,
    narrationMode: 'subtitle-mv',
    scenes: [sc(1), sc(2), sc(3, { actionMode: 'clash-flurry', actionEvents: [{ frame: 1, kind: 'metal_clash' }, { frame: 6, kind: 'metal_clash' }, { frame: 11, kind: 'metal_clash_heavy' }] }), sc(4), sc(5)],
    bgm: { beats: Array.from({ length: 20 }, (_, i) => ({ time: i * 0.25, strong: true, index: i })) },
  }
  const out = html.buildRichHtmlVideo(script)
  const cfg = JSON.parse(out.match(/const CFG = (\{.*?\});\n/s)[1])
  const dropped = cfg.timeline.filter((t) => t.noFlashIn).length + cfg.timeline.reduce((a, t) => a + t.actionEvents.filter((e) => e.noFlash).length, 0) + cfg.beats.filter((b) => b.noFlash).length
  check('HTML: flashes 0.5 s apart are dropped and marked for the runtime', dropped >= 4, `dropped ${dropped}`)
  check('HTML runtime honours the marks and uses a single cut pulse', out.includes('!sc.noFlashIn') && out.includes('!ev.noFlash') && out.includes('strobeBeatPulse(t)') && !out.includes('localT < 0.19 ? 0.32'))

  // Remotion: the composition schedules its flashes with a verbatim copy of the module
  const { writeRemotionProjectFiles } = await imp('packages/dsh-tool-media/remotion-generator.js')
  const proj = join(dirs.ws, 'flash-remotion')
  mkdirSync(proj, { recursive: true })
  writeRemotionProjectFiles(proj, { ...script, engine: 'remotion', totalDurationInFrames: 75, genre: 'history-theater' }, { rebuildTemplate: true })
  const libCopy = join(proj, 'src', 'lib', 'flash-budget.ts')
  const vc = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  const shot = readFileSync(join(proj, 'src', 'lib', 'shotcraft.tsx'), 'utf8')
  const dio = readFileSync(join(proj, 'src', 'lib', 'narrative-diorama.tsx'), 'utf8')
  check('Remotion: src/lib/flash-budget.ts is the shared module', existsSync(libCopy) && readFileSync(libCopy, 'utf8').includes(readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'flash-budget.js'), 'utf8').trim().slice(0, 400)))
  check('Remotion: transitions, clash / keyframe flashes and the exit wash are gated', vc.includes("from './lib/flash-budget'") && vc.includes('const FLASH_GATE') && vc.includes('guardFlashTx(resolveSceneTxKind(scene, idx), flashGate)') && vc.includes('gate?.clash?.[ei] !== false') && vc.includes('exitFlash={flashGate.exitFlash}'))
  check('Remotion: overlay / diorama accept the gate', shot.includes('exitFlash: allowExitFlash = true') && dio.includes('scene?.flashAllowed === false'))
})

/* ------------------------------------------------------------------------------------------ plaza template */
await section('plaza template', async () => {
  const dir = join(ROOT, 'templates', 'cinepulse-hub', 'history-epic-beat')
  const tpl = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'))
  const tplScript = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'))
  const motion = readFileSync(join(dir, 'MOTION.md'), 'utf8')
  const texts = { 'template.json': JSON.stringify(tpl), 'script.referenceStyle': JSON.stringify(tplScript.referenceStyle || {}), 'MOTION.md': motion }
  const leaks = []
  for (const [where, t] of Object.entries(texts)) for (const w of ['秦', '154.05', '3.42', '灭国', '称帝', '长城', '1280', 'media_']) if (t.includes(w)) leaks.push(`${where}:${w}`)
  check('霍去病同款 carries no other film\'s subject, duration or shot statistics', leaks.length === 0, leaks.join(' '))
  check('the recipe is a style recipe (look, rhythm, subtitles) without a duration', /剪影/.test(tpl.replicationPrompt) && /字幕/.test(tpl.replicationPrompt) && !/\d+(?:\.\d+)?\s*秒(?!$)/.test(tpl.replicationPrompt.replace(/0\.5 秒/g, '')))
  const archetypes = (tpl.shotFormula || []).map((p) => p.archetype)
  check('the phase formula uses valid stage archetypes', archetypes.length >= 5 && archetypes.every((a) => ['hero-numeral', 'hero-stand', 'oath-break', 'cavalry-rush', 'slash-climax', 'duel-confront', 'farewell-tent', 'strategic-map', 'scroll-calligraphy', 'bamboo-slips', 'plaque-summary', 'channel-end'].includes(a)), archetypes.join(','))

  const { applyPlazaTemplateToProject } = await imp('packages/dsh-tool-media/template-plaza.js')
  const { stripPlazaTemplateGuidance, PLAZA_GUIDANCE_END } = await imp('packages/dsh-tool-media/plaza-guidance.js')
  const proj = join(dirs.ws, 'plaza-apply')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: '项羽生平', engine: 'remotion', scenes: [] }, null, 2))
  applyPlazaTemplateToProject({ projectDir: proj, templateId: 'history-epic-beat', newTopic: '项羽生平' })
  const after = JSON.parse(readFileSync(join(proj, 'script.json'), 'utf8'))
  check('applying wraps the recipe in a style-only block', after.directorNotes.startsWith('项羽生平') && after.directorNotes.includes('只复刻画风') && after.directorNotes.includes(PLAZA_GUIDANCE_END))
  check('stripping the block leaves the user\'s topic only', stripPlazaTemplateGuidance(after.directorNotes) === '项羽生平')
  check('the blueprint uses the template\'s own visual style (not its marketing text)', String(after.referenceStyle?.visualStyle || '').includes('剪影剧场') && !String(after.referenceStyle?.visualStyle || '').includes('53 镜'))
})

/* ------------------------------------------------------------------------------------------ delivery true peak */
await section('delivery true peak', async () => {
  const tp = await imp('packages/dsh-tool-video-suite/true-peak-guard.js')
  const { resolveBinaries, runCommandRedirected } = await imp('packages/shared/index.js')
  const { ffmpeg } = resolveBinaries()

  check('trim plan: −0.1 dBTP → −1.4 dB (ceiling −1, margin 0.5)', tp.planTruePeakTrimDb(-0.1) === -1.4, String(tp.planTruePeakTrimDb(-0.1)))
  check('trim plan: at / under the ceiling or unmeasured → no gain change', [-1, -3, null, NaN, undefined].every((v) => tp.planTruePeakTrimDb(v) === 0))
  const summary = tp.parseEbur128Summary(
    '[Parsed_ebur128_0 @ 0x1] t: 1.2 TARGET:-23 LUFS M: -12.0 S: -12.5 I: -14.0 LUFS LRA: 1.0 LU\n' +
      '[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -12.1 LUFS\n    Threshold: -22.3 LUFS\n\n' +
      '  Loudness range:\n    LRA:         5.9 LU\n\n  True peak:\n    Peak:       -0.1 dBFS\n',
  )
  check('parses the ebur128 summary (not the running meter line)', summary.integratedLufs === -12.1 && summary.rangeLu === 5.9 && summary.truePeakDbtp === -0.1, JSON.stringify(summary))

  const dir = join(SCR, 'true-peak')
  mkdirSync(dir, { recursive: true })
  const ff = (args) => runCommandRedirected(ffmpeg, ['-y', '-hide_banner', '-v', 'error', ...args], { timeoutMs: 120_000 })
  // square waves at 0.97 (−0.26 dBFS samples): band-limited reconstruction + AAC push the true peak far over −1 dBTP
  // (gte() instead of sgn(): older FFmpeg builds such as the bundled installer binary have no sgn())
  const square = (amp) => `aevalsrc=${amp}*(2*gte(sin(2*PI*220*t)\\,0)-1)|${amp}*(2*gte(sin(2*PI*330*t)\\,0)-1):s=48000:d=3`
  const makeMp4 = async (out, audioArgs) => {
    const r = await ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=3', ...audioArgs, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-t', '3', '-video_track_timescale', '90000', out])
    if (r.code !== 0) throw new Error(`fixture encode failed: ${r.stderr}`)
  }
  const videoMd5 = async (file) => String((await ff(['-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'])).stdout || '').trim()
  const frames = async (file) => {
    const r = await runCommandRedirected(resolveBinaries().ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file], { timeoutMs: 60_000 })
    return Number(String(r.stdout || '').trim()) || 0
  }

  // a) hot film, no master known → re-encode from its own track
  const hot = join(dir, 'hot.mp4')
  await makeMp4(hot, ['-f', 'lavfi', '-i', square(0.97)])
  const hotBefore = await tp.measureAudioLoudness(hot, { ffmpeg })
  const md5Before = await videoMd5(hot)
  const resA = await tp.enforceAudioTruePeak({ mp4Path: hot, ffmpeg })
  const hotAfter = await tp.measureAudioLoudness(hot, { ffmpeg })
  check('fixture really overshoots (> −1 dBTP)', hotBefore.truePeakDbtp > -1, `${hotBefore.truePeakDbtp} dBTP`)
  check('hot film: trimmed under the ceiling from its own track', resA.applied && resA.source === 'encoded' && hotAfter.truePeakDbtp <= -1 && resA.gainDb < 0, `${resA.reason} ${hotBefore.truePeakDbtp} → ${hotAfter.truePeakDbtp} dBTP, gain ${resA.gainDb} dB, ${resA.passes} pass(es)`)
  check('hot film: video stream copied bit for bit, 90 frames kept', md5Before && md5Before === (await videoMd5(hot)) && (await frames(hot)) === 90)
  check('hot film: no temp files left next to it', readdirSafe(dir).every((f) => !f.includes('.tp-')))

  // b) hot film encoded from a master WAV → re-encode from the master (first generation)
  const masterWav = join(dir, 'master.wav')
  if ((await ff(['-f', 'lavfi', '-i', square(0.97), '-c:a', 'pcm_s16le', masterWav])).code !== 0) throw new Error('master wav fixture failed')
  const fromMaster = join(dir, 'from-master.mp4')
  await makeMp4(fromMaster, ['-i', masterWav])
  const resB = await tp.enforceAudioTruePeak({ mp4Path: fromMaster, sourceAudioPath: masterWav, ffmpeg })
  check('master source: trimmed under the ceiling from the WAV', resB.applied && resB.source === 'master' && resB.after?.truePeakDbtp <= -1, `${resB.reason} ${resB.before?.truePeakDbtp} → ${resB.after?.truePeakDbtp} dBTP`)

  // c) compliant film → untouched
  const quiet = join(dir, 'quiet.mp4')
  await makeMp4(quiet, ['-f', 'lavfi', '-i', square(0.2)])
  const { mtimeMs: quietMtime, size: quietSize } = statSync(quiet)
  const resC = await tp.enforceAudioTruePeak({ mp4Path: quiet, ffmpeg })
  check('compliant film: left untouched', !resC.applied && resC.reason === 'within-ceiling' && statSync(quiet).mtimeMs === quietMtime && statSync(quiet).size === quietSize, `${resC.reason} ${resC.before?.truePeakDbtp} dBTP`)

  // d) a re-encode that fails (unreadable "master") → original restored, nothing thrown
  const broken = join(dir, 'broken.mp4')
  await makeMp4(broken, ['-f', 'lavfi', '-i', square(0.97)])
  const brokenMd5 = await videoMd5(broken)
  const brokenSize = statSync(broken).size
  const notAudio = join(dir, 'not-audio.wav')
  writeFileSync(notAudio, 'this is not a wav file')
  const resD = await tp.enforceAudioTruePeak({ mp4Path: broken, sourceAudioPath: notAudio, ffmpeg })
  check('failed re-encode: original film restored unchanged', !resD.applied && resD.reason === 'error' && existsSync(broken) && statSync(broken).size === brokenSize && (await videoMd5(broken)) === brokenMd5 && readdirSafe(dir).every((f) => !f.includes('.tp-')), resD.error || resD.reason)

  // e) wired into every render path
  const suite = readFileSync(join(ROOT, 'packages', 'dsh-tool-video-suite', 'index.js'), 'utf8')
  const orch = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'pipeline-orchestrator.js'), 'utf8')
  check('executeVideoRender runs the guard after both engines and returns its result', suite.includes("import { enforceAudioTruePeak } from './true-peak-guard.js'") && suite.includes('await enforceAudioTruePeak({ mp4Path: outPath, sourceAudioPath, ffmpeg, signal: args.signal })') && /truePeakGuard,\s*qaReportPath/.test(suite) && suite.indexOf('enforceAudioTruePeak({') > suite.indexOf("renderMethod = 'chromium-cdp-full-fps'") && suite.indexOf('enforceAudioTruePeak({') < suite.search(/runPostRenderQa\(\{\s*projectDir: targetDir/))
  check('the Task Center log says when the audio was trimmed', orch.includes('成片音频峰值保护：编码后真峰值'))
})

/* ------------------------------------------------------------------------------------------ music bed */
await section('music bed', async () => {
  const coder = await imp('packages/dsh-tool-media/audio-coder.js')
  const synth = await imp('packages/dsh-tool-media/audio-synth.js')
  const { detectSuperCollider } = await imp('packages/dsh-tool-media/supercollider-bridge.js')
  const { resolveBinaries, runCommandRedirected } = await imp('packages/shared/index.js')
  const AUDIBLE =
    'function synthesizeBgm(ctx) { for (var i = 0; i < ctx.totalSamples; i++) { var t = i / ctx.sampleRate; var v = 0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.12 * Math.sin(2 * Math.PI * 220 * t); ctx.left[i] = v; ctx.right[i] = v; } }'
  const SILENT = 'function synthesizeBgm(ctx) { }'
  const mkProj = (name) => {
    const d = join(dirs.ws, name)
    mkdirSync(join(d, 'audio'), { recursive: true })
    return d
  }
  const script = { title: '项羽生平', style: 'cinematic', totalDurationSec: 4, audioSpec: { bpm: 90 }, bgm: { bpm: 90, beats: [] } }
  const noRenderLeft = (d) => !readdirSafe(join(d, 'audio')).some((f) => f.includes('-render.wav'))
  // strict: measured audible (volumedetect works on every FFmpeg build, including the bundled 2018 one)
  const audible = async (f) => existsSync(f) && (await synth.isAudibleAudio(resolveBinaries().ffmpeg, f)) === true
  const prevEngine = process.env.DSH_AUDIO_ENGINE
  process.env.DSH_AUDIO_ENGINE = 'js'
  try {
    // a) not JSON first → one corrective retry → an audible track in place
    const pA = mkProj('bgm-retry')
    const callsA = []
    const resA = await coder.generateAiCodedBgmTrack({
      projectDir: pA,
      script,
      callLlmChatFn: async (req) => {
        callsA.push(JSON.parse(JSON.stringify(req)))
        return { text: callsA.length === 1 ? '好的，下面是为你写的配乐思路（这不是 JSON）' : JSON.stringify({ summary: 'test', files: { 'audio/ai_bgm_synth.js': AUDIBLE } }) }
      },
    })
    check('unusable reply → exactly one retry that tells the model what was wrong', callsA.length === 2 && resA.attempts === 2 && callsA[1].messages.length === 3 && /不可用/.test(callsA[1].messages[2].content), `calls ${callsA.length}, attempts ${resA.attempts}`)
    check('the retried track is audible and in place, the bad reply kept, no temp render left', (await audible(join(pA, 'audio', 'bgm-llm.wav'))) && existsSync(join(pA, 'audio', 'ai_bgm_failed-1.txt')) && noRenderLeft(pA) && /第 2 次生成成功/.test(resA.engineNote || ''), resA.engineNote)

    // b) a formula that renders silence, twice → fails, and never leaves audio/bgm-llm.wav behind
    const pB = mkProj('bgm-silent')
    let callsB = 0
    let errB = null
    try {
      await coder.generateAiCodedBgmTrack({ projectDir: pB, script, callLlmChatFn: async () => (callsB++, { text: JSON.stringify({ files: { 'audio/ai_bgm_synth.js': SILENT } }) }) })
    } catch (e) {
      errB = e
    }
    check('a silent formula is retried once, then fails without leaving audio/bgm-llm.wav', callsB === 2 && Boolean(errB) && /静音/.test(errB?.message || '') && !existsSync(join(pB, 'audio', 'bgm-llm.wav')) && noRenderLeft(pB), `calls ${callsB}: ${errB?.message}`)

    // c) a transport / balance error from the model call is not retried by the composer (callLlmChat retries those)
    const pC = mkProj('bgm-transport')
    let callsC = 0
    let errC = null
    try {
      await coder.generateAiCodedBgmTrack({ projectDir: pC, script, callLlmChatFn: async () => { callsC++; throw new Error('大模型接口返回错误 (402): insufficient balance') } })
    } catch (e) {
      errC = e
    }
    check('transport / billing errors are not retried by the composer', callsC === 1 && Boolean(errC))
  } finally {
    if (prevEngine === undefined) delete process.env.DSH_AUDIO_ENGINE
    else process.env.DSH_AUDIO_ENGINE = prevEngine
  }

  // d) SuperCollider renders digital silence (an empty score) → not accepted as music; the JS composer takes over
  if (detectSuperCollider().available) {
    const prev = process.env.DSH_AUDIO_ENGINE
    process.env.DSH_AUDIO_ENGINE = 'auto'
    try {
      const pD = mkProj('bgm-sc-silent')
      let n = 0
      const resD = await coder.generateAiCodedBgmTrack({
        projectDir: pD,
        script,
        callLlmChatFn: async () => {
          n++
          return { text: n === 1 ? JSON.stringify({ summary: 'silent', scd: '~score = [];' }) : JSON.stringify({ files: { 'audio/ai_bgm_synth.js': AUDIBLE } }) }
        },
      })
      check('SuperCollider silence is rejected; the JS composer writes the track', resD.engine === 'js-dsp' && /静音/.test(resD.engineNote || '') && noRenderLeft(pD) && (await audible(join(pD, 'audio', 'bgm-llm.wav'))), `${resD.engine} · ${resD.engineNote}`)
    } finally {
      if (prev === undefined) delete process.env.DSH_AUDIO_ENGINE
      else process.env.DSH_AUDIO_ENGINE = prev
    }
  } else {
    check('SuperCollider silence check (skipped: sclang not installed)', true)
  }

  // e) the mixer never mixes a silent bed: the procedural bed on the script's tempo replaces it, and says so
  const pE = mkProj('mix-silent-bed')
  const silentRes = await runCommandRedirected(resolveBinaries().ffmpeg, ['-y', '-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', '5', '-c:a', 'pcm_s16le', join(pE, 'audio', 'bgm-llm.wav')], { timeoutMs: 60_000 })
  if (silentRes.code !== 0) throw new Error(`silent fixture failed: ${silentRes.stderr}`)
  const scriptE = {
    title: '项羽生平', style: 'cinematic', fps: 30, narrationMode: 'subtitle-mv', genre: 'history-theater',
    totalDurationSec: 4, totalDurationInFrames: 120, planBpm: 90, bgmMode: 'llm-coded', audioSpec: { bgmMode: 'llm-coded' },
    bgm: { enabled: true, source: 'llm-coded', mode: 'llm-coded', path: 'audio/bgm-llm.wav', bpm: 90 },
    scenes: [{ id: 's1', startSec: 0, durationSec: 4, durationInFrames: 120, sfxCues: [{ type: 'war_drum', path: 'audio/sfx/war_drum.wav', offsetSec: 0.5, volume: 0.6 }] }],
  }
  writeFileSync(join(pE, 'script.json'), JSON.stringify(scriptE, null, 2))
  const mixE = await synth.mixVideoAudio({ projectDir: pE, script: scriptE, assetsManifest: { items: [] }, outputPath: join(pE, 'output', 'master-audio.wav') })
  check('mixer: a silent bed is replaced by the procedural bed on the plan tempo (reported)', mixE.bgmFallback?.reason === 'silent-bgm' && mixE.bgmUsed === 'audio/bgm-generated.wav' && mixE.bgmFallback?.bpm === 90, JSON.stringify(mixE.bgmFallback))
  const masterLevel = await synth.measureAudioPresence(resolveBinaries().ffmpeg, join(pE, 'output', 'master-audio.wav'))
  check('mixer: the master carries the music bed (not just one drum hit)', Number.isFinite(masterLevel?.meanDb) && masterLevel.meanDb > -30, `master mean ${masterLevel?.meanDb} dB`)

  // g) "could not measure" is not "silent": a bed is only replaced when it MEASURES silent
  check('an unmeasurable file is reported as unknown (null), not silent', (await synth.isAudibleAudio(resolveBinaries().ffmpeg, join(pE, 'does-not-exist.wav'))) === null)

  // f) the pipeline's own fallback renders the local bed and switches the mix to it
  const orch = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'pipeline-orchestrator.js'), 'utf8')
  check('pipeline: a failed AI composer switches to a rendered local bed (mode, path, warning)', orch.includes("bgmMode = 'generated'") && orch.includes("path: 'audio/bgm-generated.wav', bpm: fbBpm") && orch.includes('已改用本地合成配乐') && orch.includes('audioMix?.bgmFallback'))
})

/* ------------------------------------------------------------------------------------------ cut accents */
await section('cut accents', async () => {
  const { choreographBeatSfxCues, CUT_ACCENT_MIN_GAP_SEC, isMartialFilm } = await imp('packages/dsh-tool-media/beat-analyzer.js')
  const bpm = 90
  const step = 60 / bpm
  const beats = Array.from({ length: 48 }, (_, i) => ({ time: Number((0.62 + i * step).toFixed(4)), strong: i % 4 === 0, index: i }))
  const at = (b) => Number((0.62 + b * step).toFixed(4))
  const mk = (id, title, narration, b0, b1, transition = 'cut') => ({
    id, title, narration, startSec: at(b0), durationSec: Number((at(b1) - at(b0)).toFixed(4)), durationInFrames: Math.round((at(b1) - at(b0)) * 30), transition,
  })
  const scenes = [
    mk('c1', '江边', '你望着江水', 0, 4), // opening shot → silent
    mk('c2', '城门', '你走过城门', 4, 6), // cut on a downbeat → accent
    mk('c3', '回望', '你回望故乡', 6, 8), // off-beat cut → silent
    mk('c4', '高台', '你登上高台', 8, 9, 'zoom-punch'), // downbeat, one bar later → war drum
    mk('c5', '营帐', '你按剑独坐营中', 9, 12), // off-beat, too close to the last accent → silent
    mk('c6', '远山', '你看见远山', 12, 16, 'slash-wipe'), // downbeat → sweep
  ]
  const out = choreographBeatSfxCues(scenes, { beats, drops: [], bpm }, { genre: 'history-theater', fps: 30, narrationMode: 'subtitle-mv' })
  const cues = out.map((s) => (s.sfxCues || []).map((c) => c.type))
  check('all six shots are clean (no action of their own)', out.every((s) => s.actionMode === 'clean'), out.map((s) => s.actionMode).join(','))
  check('a film with a sword in it counts as martial', isMartialFilm(scenes) === true)
  check('opening shot and off-beat cuts close to an accent stay silent', cues[0].length === 0 && cues[2].length === 0 && cues[4].length === 0, JSON.stringify(cues))
  check('downbeat cuts get one epic hit matching the transition', cues[1].join() === 'war_drum' && cues[3].join() === 'war_drum' && cues[5].join() === 'slash_sweep', JSON.stringify(cues))
  const all = out.flatMap((s) => (s.sfxCues || []).map((c) => ({ ...c, abs: s.startSec + c.offsetSec, sc: s })))
  check('no chimes, risers or steel on clean shots', all.every((c) => ['war_drum', 'blade_whoosh', 'slash_sweep'].includes(c.type)))
  check('every accent sits on a downbeat (±4 ms)', all.every((c) => beats.some((b) => b.strong && Math.abs(b.time - c.abs) <= 0.004)), all.map((c) => c.abs.toFixed(3)).join(' '))
  const times = all.map((c) => c.abs).sort((a, b) => a - b)
  check(`accents are at least ${CUT_ACCENT_MIN_GAP_SEC} s apart`, times.every((t, i) => i === 0 || t - times[i - 1] >= CUT_ACCENT_MIN_GAP_SEC - 0.01))
  check('each drum accent has its visual event (the camera rig punches in on it)', out.filter((s) => (s.sfxCues || []).some((c) => c.type === 'war_drum')).every((s) => s.actionEvents.some((e) => e.kind === 'war_drum' && e.role === 'cut')))

  // a poet's biography is history without war: no war drums, no blades, no steel
  const poet = scenes.map((sc, i) => ({ ...sc, title: ['书斋', '江南春雨', '泛舟', '题诗', '庭院', '远山'][i], narration: ['他少年读书', '春雨江南', '一叶扁舟', '提笔写诗', '庭中赏花', '远望青山'][i] }))
  const po = choreographBeatSfxCues(poet, { beats, drops: [], bpm }, { genre: 'history-theater', fps: 30, narrationMode: 'subtitle-mv' })
  const pTypes = po.flatMap((s) => (s.sfxCues || []).map((c) => c.type))
  check('a history film without fighting is not martial', isMartialFilm(poet) === false)
  check('…and its downbeat cuts get an unpitched whoosh / a low boom, never war drums, blades or steel', pTypes.length >= 2 && pTypes.every((t) => t === 'whoosh' || t === 'sub_boom'), pTypes.join(','))
})

/* ------------------------------------------------------------------------------------------ epic ambience */
await section('epic ambience', async () => {
  const { writeRemotionProjectFiles } = await imp('packages/dsh-tool-media/remotion-generator.js')
  const proj = join(dirs.ws, 'epic-ambience')
  mkdirSync(proj, { recursive: true })
  const sc = { title: '项羽生平', engine: 'remotion', genre: 'history-theater', narrationMode: 'subtitle-mv', fps: 30, width: 1920, height: 1080, totalDurationInFrames: 90, scenes: [{ id: 'scene-01', startFrame: 0, durationInFrames: 90, durationSec: 3, transition: 'cut' }] }
  writeFileSync(join(proj, 'script.json'), JSON.stringify(sc, null, 2))
  writeRemotionProjectFiles(proj, sc, {})
  const vc = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  const block = vc.slice(vc.indexOf('const ATMO_SEEDS'), vc.indexOf('const OPENER_SLOTS'))
  check('the atmosphere layer (dust / embers / snow / rain …) is emitted and driven by each shot, not by the genre', vc.includes('const AmbientAtmosphere') && /String\(scene\.atmosphere \|\| 'none'\) !== 'none' \?\s*\(\s*<AmbientAtmosphere/.test(vc))
  check('the epic composition flag is decided from the content at generation time', /const EPIC_CONTEXT: boolean = true/.test(vc))
  check('the atmosphere layer is frame-locked (no random / clock) and flash-free', block.length > 200 && !/Math\.random|Date\.now|performance\.now/.test(block) && !/backgroundColor:\s*'#FFFFFF'/.test(block))
  check('calm shots keep a living camera (travel 0.72, beat pulse 0.03)', vc.includes("isCavalryScene ? 0.85 : 0.72)") && vc.includes('Math.max(0, bp - 0.65) * 0.03'))
  const coderSrc = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'shotcraft-lib.js'), 'utf8')
  check('the scene coder is told every epic shot moves continuously (≥ 2 moving layers, no still > 0.5 s)', coderSrc.includes('全程有动势') && coderSrc.includes('不得出现超过 0.5 秒的静止画面'))
})

function readdirSafe(d) {
  try {
    return readdirSync(d)
  } catch {
    return []
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.name).join(' | ')}`)
  process.exit(1)
}
