#!/usr/bin/env node
/**
 * 宿主智能体代写 (host-agent writing queue) — tests (no network, no model calls):
 *   - a model request becomes a task on disk; the agent fetches it (next), answers (reply), the request resolves
 *   - images in a request are handed over as local files the agent can open; files are cleaned up afterwards
 *   - an error reply rejects with the agent's reason; abort and timeout reject; nothing is left behind
 *   - a claimed task is not handed out twice; the queue is shared through the folder (two "processes")
 *
 *   node scripts/tests/host-llm-bridge.test.mjs
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'host-llm-test', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(SCR, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
Object.assign(process.env, { DSH_VIDEO_ENV_PATH: emptyEnv, DSH_VIDEO_SKIP_PROFILE_MOUNT: '1' })
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}
const hb = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'host-llm-bridge.js')).href)
const root = join(SCR, 'data')

await section('request → next → reply', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg=='
  const pending = hb.requestHostCompletion({ root, purpose: 'AI 润色', system: '你是导演', wantJson: true, messages: [{ role: 'user', content: [{ type: 'text', text: '看图写一句话' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }] }], timeoutMs: 20_000 })
  const t = await hb.nextHostTask({ root, waitMs: 5000 })
  check('the agent gets the task with system, messages, purpose', t && t.purpose === 'AI 润色' && t.system === '你是导演' && t.messages[0].text.includes('看图写一句话') && t.wantJson === true)
  const img = t?.messages?.[0]?.images?.[0]
  check('images are handed over as local files the agent can open', img && existsSync(img) && t.messages[0].text.includes(img))
  check('a claimed task is not handed out twice', (await hb.nextHostTask({ root })) === null)
  const desc = hb.describeHostTask(t)
  check('the task description tells the agent how to answer', desc.instructions.includes('host_llm_task') && desc.instructions.includes(t.id) && desc.instructions.includes('JSON'))
  hb.submitHostReply({ root, id: t.id, text: '{"ok":true}', model: 'gpt-x' })
  const res = await pending
  check('the request resolves with the agent\'s answer', res.text === '{"ok":true}' && res.model === 'host-agent:gpt-x')
  check('task, reply and image files are cleaned up', !existsSync(img) && readdirSync(join(hb.hostQueueDir(root), 'tasks')).length === 0 && readdirSync(join(hb.hostQueueDir(root), 'replies')).length === 0)
})

await section('error reply, abort, timeout', async () => {
  const p = hb.requestHostCompletion({ root, purpose: 'x', messages: [{ role: 'user', content: 'hi' }], timeoutMs: 20_000 })
  const t = await hb.nextHostTask({ root, waitMs: 5000 })
  hb.submitHostReply({ root, id: t.id, error: '我做不到' })
  let err = null
  try {
    await p
  } catch (e) {
    err = e
  }
  check('an error reply rejects with the agent\'s reason', err?.code === 'HOST_AGENT_DECLINED' && /我做不到/.test(err.message))
  const ac = new AbortController()
  const p2 = hb.requestHostCompletion({ root, messages: [{ role: 'user', content: 'a' }], signal: ac.signal, timeoutMs: 20_000 })
  setTimeout(() => ac.abort(), 300)
  let e2 = null
  try {
    await p2
  } catch (e) {
    e2 = e
  }
  check('abort rejects and removes the task', e2 && e2.name === 'AbortError' && hb.listHostTasks({ root }).length === 0, e2?.name)
  let e3 = null
  try {
    await hb.requestHostCompletion({ root, messages: [{ role: 'user', content: 'b' }], timeoutMs: 1 })
  } catch (e) {
    e3 = e
  }
  check('a request nobody answers times out with a plain explanation', e3?.code === 'HOST_AGENT_TIMEOUT' && /智能体/.test(e3.message) && hb.listHostTasks({ root }).length === 0)
  let e4 = null
  try {
    hb.submitHostReply({ root, id: 't-zzz-deadbeef', text: 'x' })
  } catch (e) {
    e4 = e
  }
  check('replying to an unknown task is refused', /不存在/.test(e4?.message || ''))
})

await section('the plugin image shape { type: image, base64 } is handed over as a file too', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg=='
  const pending = hb.requestHostCompletion({ root, messages: [{ role: 'user', content: [{ type: 'text', text: '自检' }, { type: 'image', mimeType: 'image/png', base64: png }] }], timeoutMs: 20_000 })
  const t = await hb.nextHostTask({ root, waitMs: 5000 })
  const img = t?.messages?.[0]?.images?.[0]
  check('an internal-shape picture becomes a local file', img && existsSync(img) && /\.png$/.test(img))
  hb.submitHostReply({ root, id: t.id, text: 'ok' })
  await pending
})

await section('background jobs: started, listed while running, handed out once when finished', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const job = hb.startHostJob('ai_create_video', async () => {
    await gate
    return { ok: true, mp4: 'output/final.mp4' }
  })
  check('a job starts in the background', job.status === 'running' && /^job-/.test(job.id))
  check('a running job is listed', hb.listRunningHostJobs().some((j) => j.id === job.id) && hb.takeFinishedHostJobs().length === 0)
  release()
  await new Promise((r) => setTimeout(r, 50))
  const done = hb.takeFinishedHostJobs()
  check('the finished job carries its result', done.length === 1 && done[0].id === job.id && done[0].result?.mp4 === 'output/final.mp4')
  check('a finished job is handed out once', hb.takeFinishedHostJobs().length === 0 && hb.listRunningHostJobs().length === 0)
  const bad = hb.startHostJob('ai_refine_scene', async () => {
    throw new Error('渲染失败')
  })
  await new Promise((r) => setTimeout(r, 50))
  const failedJobs = hb.takeFinishedHostJobs()
  check('a failed job reports its error', failedJobs.length === 1 && failedJobs[0].id === bad.id && failedJobs[0].status === 'error' && /渲染失败/.test(failedJobs[0].error))
})

await section('llm-client in mode host-agent: the model call becomes a writing task for the agent', async () => {
  const home = join(SCR, 'home')
  mkdirSync(home, { recursive: true })
  const queue = join(SCR, 'queue')
  Object.assign(process.env, { DSH_VIDEO_HOME: home, DSH_HOST_LLM_QUEUE_DIR: queue, DSH_VIDEO_HOST_AGENT: 'codex-mcp-client' })
  for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY']) delete process.env[v]
  const llm = await import(pathToFileURL(join(ROOT, 'packages', 'dsh-tool-media', 'llm-client.js')).href)
  const auto = llm.getSafeLlmConfigSummary(join(SCR, 'no-dsh'))
  check('inside an agent with nothing to share, auto mode suggests 智能体代写', auto.configured === false && auto.hostAgentSuggested === true && /代写/.test(auto.sourceLabel), auto.sourceLabel)
  llm.saveLlmConfig({ mode: 'host-agent' })
  const s = llm.getSafeLlmConfigSummary(join(SCR, 'no-dsh'))
  check('mode host-agent is saved and counts as configured (no key needed)', s.mode === 'host-agent' && s.configured === true && s.hasApiKey === false && /Codex/.test(s.sourceLabel), s.sourceLabel)
  check('the panels wait at least as long as the agent may take', s.timeoutMs >= llm.DEFAULT_HOST_AGENT_TIMEOUT_MS && s.hostAgent && s.hostAgent.pending === 0)
  const beats = []
  const call = llm.callLlmChat({ system: '你是分镜导演。\n规则…', messages: [{ role: 'user', content: '写 3 个镜头' }], responseFormat: 'json', maxTokens: 900, onWait: (w) => beats.push(w), waitTickMs: 250 })
  const t = await hb.nextHostTask({ waitMs: 5000 })
  check('the call is queued for the agent with its job label, JSON flag and budget', t && t.purpose === '你是分镜导演。' && t.wantJson === true && t.maxTokens === 900 && t.messages[0].text === '写 3 个镜头')
  check('the studio sees the waiting task', llm.getSafeLlmConfigSummary(join(SCR, 'no-dsh')).hostAgent.pending === 1)
  await new Promise((r) => setTimeout(r, 600))
  hb.submitHostReply({ id: t.id, text: '{"shots":[1,2,3]}', model: 'gpt-codex' })
  const res = await call
  check('callLlmChat resolves with the agent\'s answer in the usual shape', res.ok === true && res.text === '{"shots":[1,2,3]}' && res.protocol === 'host-agent' && /host-agent/.test(res.model))
  check('long waits report elapsed time (onWait) while the agent works', beats.length >= 1 && beats[0].hostAgent === true)
  const test = await llm.testLlmConnection()
  check('「测试连接」 in this mode explains what happens, without any network call', test.ok === true && test.mode === 'host-agent' && /host_llm_task/.test(test.message))
  check('no model list is fetched in this mode', (await llm.fetchAvailableModels()).length === 0)
  delete process.env.DSH_HOST_LLM_QUEUE_DIR
  delete process.env.DSH_VIDEO_HOST_AGENT
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
