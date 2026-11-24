#!/usr/bin/env node
/**
 * 宿主智能体代写 end to end through the MCP server (no network, no model calls) — what a Codex / Claude Code user on a
 * subscription (no API key) gets:
 *   - configure_llm_model { mode: 'host-agent' } is accepted; get_llm_config reports it as configured
 *   - a tool that needs model answers (analyze_reference_video with 看图) returns at once with a background job
 *     instead of blocking the agent that has to write those answers
 *   - host_llm_task next hands the agent the writing task (system prompt, messages, the contact sheet as a local image)
 *   - the agent's reply is applied exactly like a model reply (the reference DNA says AI 看图 was used)
 *   - host_llm_task then hands back the finished job's result once
 *   - nothing the agent did not write is sent anywhere (fetch is never called by the server: no endpoint exists)
 *
 *   node scripts/tests/host-agent-mcp.test.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'host-agent-mcp', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), voices: join(SCR, 'voices'), dshClient: join(SCR, 'no-dsh-client'), queue: join(SCR, 'queue'), project: join(SCR, 'ws', 'ref-proj') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
const MODEL_VARS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_MODEL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_MODEL',
  'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_PROVIDER', 'LLM_FORMAT', 'DSH_VIDEO_HOST_AGENT', 'DSH_VIDEO_HOST_AGENT_VERSION',
]
const env = { ...process.env }
for (const v of MODEL_VARS) delete env[v]
Object.assign(env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  VOICE_PACKS_DIR: dirs.voices,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_HOST_LLM_QUEUE_DIR: dirs.queue,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}

// a 4-second reference clip with three visibly different shots (no audio needed)
const { resolveBinaries } = await import(pathToFileURL(join(ROOT, 'packages', 'shared', 'index.js')).href)
const { ffmpeg } = resolveBinaries()
const clip = join(SCR, 'ref.mp4')
const mk = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=1.5', '-f', 'lavfi', '-i', 'color=c=red:size=320x180:rate=15:duration=1.5', '-f', 'lavfi', '-i', 'smptebars=size=320x180:rate=15:duration=1.5', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', clip], { windowsHide: true })
check('a small reference clip is generated', mk.status === 0 && existsSync(clip), String(mk.stderr || '').slice(0, 200))

const proc = spawn(process.execPath, [join(ROOT, 'bin', 'dsh-video-mcp.mjs')], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
let out = ''
let err = ''
proc.stdout.on('data', (d) => (out += d))
proc.stderr.on('data', (d) => (err += d))
const send = (msg) => proc.stdin.write(JSON.stringify(msg) + '\n')
const waitFor = async (id, ms = 120_000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    for (const line of out.split('\n')) {
      try {
        const m = JSON.parse(line)
        if (m && m.id === id) return m
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}
let nextId = 10
const call = async (name, args, ms) => {
  const id = ++nextId
  send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
  const res = await waitFor(id, ms)
  const text = res?.result?.content?.[0]?.text || ''
  try {
    return { raw: res, data: JSON.parse(text), text }
  } catch {
    return { raw: res, data: null, text }
  }
}

try {
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-mcp-client', version: '9.9.9' } } })
  const init = await waitFor(1)
  check('the MCP server starts', Boolean(init?.result), err.slice(0, 300))
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })

  const before = await call('get_llm_config', {})
  check('inside Codex without an API key, auto mode suggests 智能体代写', before.data?.configured === false && before.data?.hostAgentSuggested === true, before.data?.sourceLabel)

  const cfg = await call('configure_llm_model', { mode: 'host-agent', runTest: true })
  check('configure_llm_model accepts mode host-agent (no key, no endpoint)', cfg.data?.mode === 'host-agent' && cfg.data?.configured === true && cfg.data?.test?.ok === true && /host_llm_task/.test(cfg.data?.test?.message || ''), cfg.data?.sourceLabel)

  const t0 = Date.now()
  const started = await call('analyze_reference_video', { projectDir: dirs.project, videoPath: clip, applyToScript: true }, 60_000)
  check('a tool that needs model answers returns at once as a background job (it must not block the agent)', started.data?.background === true && /^job-/.test(started.data?.hostJobId || '') && Date.now() - t0 < 30_000, started.data?.message?.slice(0, 80))

  // the agent serves host_llm_task until the job is done
  let task = null
  let finished = null
  const deadline = Date.now() + 240_000
  let answered = 0
  while (Date.now() < deadline && !finished) {
    const r = await call('host_llm_task', { action: 'next', waitSec: 20 }, 90_000)
    if (r.data?.finishedJobs?.length) {
      finished = r.data.finishedJobs.find((j) => j.id === started.data?.hostJobId) || r.data.finishedJobs[0]
      break
    }
    if (r.data?.task) {
      task = r.data.task
      const imgs = (task.messages || []).flatMap((m) => m.images || [])
      check('the agent gets the 看图 task with the contact sheet as a local image it can open', imgs.length >= 1 && imgs.every((p) => existsSync(p)) && /JSON/i.test(task.instructions), `${imgs.length} image(s), purpose=${task.purpose}`)
      const answer = {
        title: '测试参考', genre: 'knowledge-explainer', genreLabel: '知识讲解', style: 'documentary', narrationMode: 'tts',
        visualStyle: '红色与彩条测试画面交替的硬切', colorPalette: { primary: '#E53935' }, characterDesign: '无人物',
        vfxSignature: ['硬切'], transitionSignature: ['硬切'], subtitleStyle: 'cinematic', subtitleNotes: '无',
        shotFormula: ['测试图', '红屏', '彩条'], replicationPrompt: '三段硬切的测试画面',
      }
      const rep = await call('host_llm_task', { action: 'reply', id: task.id, text: JSON.stringify(answer) })
      check('the agent hands its answer back', rep.data?.ok === true, rep.text.slice(0, 120))
      answered++
      continue
    }
    if (!(r.data?.runningJobs || []).length && !answered) break
  }
  check('host_llm_task hands back the finished job result once', finished && finished.status === 'done', finished ? finished.status : 'no result')
  const vs = finished?.result?.referenceStyle?.visionStatus || finished?.result?.blueprint?.visionStatus || finished?.result?.visionStatus || null
  const ref = finished?.result?.referenceStyle || finished?.result?.blueprint || finished?.result || {}
  check('the agent\'s answer is applied like a model reply (AI 看图 used)', ref.visionAnalyzed === true && (!vs || vs.used === true), `visionAnalyzed=${ref.visionAnalyzed} status=${vs ? vs.code : '-'}`)
  const again = await call('host_llm_task', { action: 'next', waitSec: 0 })
  check('a finished job is not handed out twice', !(again.data?.finishedJobs || []).length && !again.data?.task)
  const cfgFile = join(dirs.home, 'llm-config.json')
  const stored = existsSync(cfgFile) ? readFileSync(cfgFile, 'utf8') : ''
  check('nothing secret is stored for this mode', /"mode": "host-agent"/.test(stored) && /"apiKey": ""/.test(stored))
} catch (e) {
  check('host-agent MCP suite', false, String(e?.stack || e).slice(0, 600))
} finally {
  proc.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\nhost-agent-mcp: ${results.length - failed.length}/${results.length} passed`)
if (!failed.length) {
  try {
    rmSync(SCR, { recursive: true, force: true })
  } catch {}
}
process.exit(failed.length ? 1 : 0)
