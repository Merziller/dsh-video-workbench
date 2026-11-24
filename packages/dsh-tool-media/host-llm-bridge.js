/**
 * 宿主智能体代写 (host-agent writing) — lets the agent the user is already talking to (Codex, Claude Code, Cursor …,
 * running on the user's own subscription inside its own official client) do the plugin's writing work: AI 润色,
 * storyboard planning, per-scene animation code, refine instructions, visual checks.
 *
 * Nothing is borrowed: the plugin never reads another program's login, token or credential file and never talks to a
 * model provider on the agent's behalf. Instead every model request the plugin would have sent becomes a plain
 * "writing task" on disk; the agent fetches it through the MCP tool `host_llm_task` (action `next`), writes the answer
 * with its own model, and hands it back (action `reply`). The plugin then validates and applies the answer exactly as
 * it would a model reply (JSON parsing, type checks, sandbox, lint, typecheck).
 *
 * The queue lives in the plugin's data folder (`<data>/.host-llm/`) so the web studio process and the MCP server
 * process share it: a button pressed in the studio waits until the agent in the conversation has answered.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAbortError, REPO_ROOT } from '../shared/index.js'

export const HOST_AGENT_MODE = 'host-agent'
const POLL_MS = 400
const CLAIM_STALE_MS = 15 * 60_000

export function hostQueueDir(root = REPO_ROOT) {
  // tests (and unusual setups where the studio and the MCP server use different data folders) may point both at one
  const forced = root === REPO_ROOT ? String(process.env.DSH_HOST_LLM_QUEUE_DIR || '').trim() : ''
  return forced || join(root, '.host-llm')
}

function dirs(root) {
  const base = hostQueueDir(root)
  const d = { base, tasks: join(base, 'tasks'), replies: join(base, 'replies'), images: join(base, 'images') }
  for (const p of Object.values(d)) mkdirSync(p, { recursive: true })
  return d
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Flatten chat content (string or multimodal parts) for the agent: text stays text, images are written to files
 * whose paths the agent can open itself (agents read local images).
 */
function flattenContent(content, imgDir, id, counter) {
  if (typeof content === 'string') return { text: content, images: [] }
  const parts = Array.isArray(content) ? content : []
  const texts = []
  const images = []
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue
    if (p.type === 'text' && typeof p.text === 'string') texts.push(p.text)
    // the plugin's own shape { type: 'image', mimeType, base64 }, OpenAI image_url, Anthropic image source
    const url =
      p.type === 'image_url'
        ? typeof p.image_url === 'string'
          ? p.image_url
          : p.image_url?.url
        : p.type === 'image' && p.base64
          ? `data:${p.mimeType || 'image/jpeg'};base64,${String(p.base64).replace(/^data:.*?;base64,/, '')}`
          : p.type === 'image' && p.source?.data
            ? `data:${p.source.media_type || 'image/png'};base64,${p.source.data}`
            : ''
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(String(url || ''))
    if (m) {
      const file = join(imgDir, `${id}-${++counter.n}.${m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()}`)
      writeFileSync(file, Buffer.from(m[2], 'base64'))
      images.push(file)
      texts.push(`[图片 ${counter.n}：${file}]`)
    } else if (typeof p.localPath === 'string') {
      images.push(p.localPath)
      texts.push(`[图片：${p.localPath}]`)
    }
  }
  return { text: texts.join('\n'), images }
}

/**
 * Queue one model request as a writing task for the agent and wait for its answer.
 * Resolves `{ text, model: 'host-agent', usage: null }`; rejects on timeout / abort / an error reply.
 */
export async function requestHostCompletion({ system = '', messages = [], purpose = '', maxTokens = 0, temperature = undefined, wantJson = false, timeoutMs = 30 * 60_000, signal, root = REPO_ROOT, onWaiting } = {}) {
  if (signal?.aborted) throw createAbortError()
  const d = dirs(root)
  const id = `t-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  const counter = { n: 0 }
  const msgs = (Array.isArray(messages) ? messages : []).map((m) => {
    const flat = flattenContent(m?.content, d.images, id, counter)
    return { role: m?.role === 'assistant' ? 'assistant' : 'user', text: flat.text, images: flat.images }
  })
  const task = {
    id,
    createdAt: new Date().toISOString(),
    purpose: String(purpose || '').slice(0, 200),
    system: String(system || ''),
    messages: msgs,
    maxTokens: Number(maxTokens) || 0,
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : null,
    wantJson: Boolean(wantJson),
    pid: process.pid,
    status: 'pending',
  }
  writeJsonAtomic(join(d.tasks, `${id}.json`), task)
  onWaiting?.({ id, purpose: task.purpose })
  const replyFile = join(d.replies, `${id}.json`)
  const deadline = Date.now() + Math.max(10_000, Number(timeoutMs) || 0)
  try {
    while (true) {
      if (signal?.aborted) throw createAbortError()
      if (existsSync(replyFile)) {
        const rep = readJson(replyFile)
        if (rep) {
          if (rep.error) {
            const err = new Error(`智能体没有完成这个写作任务：${String(rep.error).slice(0, 300)}`)
            err.code = 'HOST_AGENT_DECLINED'
            throw err
          }
          return { text: String(rep.text || ''), model: rep.model ? `host-agent:${String(rep.model).slice(0, 60)}` : HOST_AGENT_MODE, usage: null, hostTaskId: id }
        }
      }
      if (Date.now() > deadline) {
        const err = new Error('等了很久，当前智能体还没有完成插件的写作任务。请在智能体（如 Codex）的对话里让它继续处理插件的写作任务，或改用 API 接口。')
        err.code = 'HOST_AGENT_TIMEOUT'
        throw err
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  } finally {
    rmSync(join(d.tasks, `${id}.json`), { force: true })
    rmSync(replyFile, { force: true })
    for (let k = 1; k <= counter.n; k++) {
      for (const ext of ['png', 'jpg', 'webp', 'gif']) rmSync(join(d.images, `${id}-${k}.${ext}`), { force: true })
    }
  }
}

/** Pending tasks, oldest first (claimed ones are skipped unless their claim went stale). */
export function listHostTasks({ root = REPO_ROOT, includeClaimed = true } = {}) {
  const d = dirs(root)
  const now = Date.now()
  const out = []
  for (const f of readdirSync(d.tasks).filter((n) => n.endsWith('.json'))) {
    const t = readJson(join(d.tasks, f))
    if (!t?.id) continue
    if (existsSync(join(d.replies, `${t.id}.json`))) continue
    const claimedFresh = t.claimedAt && now - Date.parse(t.claimedAt) < CLAIM_STALE_MS
    if (claimedFresh && !includeClaimed) continue
    out.push({ id: t.id, createdAt: t.createdAt, purpose: t.purpose, claimed: Boolean(claimedFresh), chars: (t.system || '').length + (t.messages || []).reduce((a, m) => a + String(m.text || '').length, 0) })
  }
  return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/**
 * Hand the oldest unclaimed task to the agent (marks it claimed). With `waitMs`, waits that long for one to appear.
 * Returns null when there is none.
 */
export async function nextHostTask({ root = REPO_ROOT, waitMs = 0, id = '' } = {}) {
  const d = dirs(root)
  const deadline = Date.now() + Math.max(0, Math.min(120_000, Number(waitMs) || 0))
  while (true) {
    const pending = listHostTasks({ root, includeClaimed: Boolean(id) })
    const pick = id ? pending.find((t) => t.id === id) : pending.find((t) => !t.claimed)
    if (pick) {
      const file = join(d.tasks, `${pick.id}.json`)
      const t = readJson(file)
      if (t) {
        t.claimedAt = new Date().toISOString()
        t.status = 'claimed'
        writeJsonAtomic(file, t)
        return t
      }
    }
    if (Date.now() >= deadline) return null
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

/** The agent's answer (or its reason for not answering). */
export function submitHostReply({ root = REPO_ROOT, id, text = '', error = '', model = '' } = {}) {
  const d = dirs(root)
  const sid = String(id || '').trim()
  if (!/^t-[a-z0-9]+-[a-f0-9]{8}$/i.test(sid)) throw new Error('任务编号无效')
  if (!existsSync(join(d.tasks, `${sid}.json`))) throw new Error('这个写作任务已经不存在（可能已超时或被取消）')
  if (!error && !String(text || '').trim()) throw new Error('回答是空的：请把写好的完整内容放进 text')
  writeJsonAtomic(join(d.replies, `${sid}.json`), { id: sid, text: String(text || ''), error: String(error || ''), model: String(model || '').slice(0, 60), at: new Date().toISOString() })
  return { ok: true, id: sid }
}

/** Instructions shown to the agent together with a task. */
export function describeHostTask(t) {
  if (!t) return null
  const lines = [
    `写作任务 ${t.id}${t.purpose ? `（${t.purpose}）` : ''}。`,
    '请你用自己的模型完成它：把下面的 system 当作你的角色和规则，按 messages 的要求写出完整回答，',
    t.wantJson ? '只输出要求的 JSON（不要 Markdown 代码围栏，不要多余文字），' : '只输出要求的内容本身（代码任务直接给出完整代码），',
    `然后调用 host_llm_task（action: "reply", id: "${t.id}", text: 你的完整回答）交回。做不到就用 error 说明原因交回。`,
  ]
  return {
    id: t.id,
    purpose: t.purpose,
    instructions: lines.join(''),
    system: t.system,
    messages: t.messages,
    wantJson: t.wantJson,
    maxTokens: t.maxTokens || undefined,
  }
}

/*
 * Background jobs of the MCP process. An agent calls one tool at a time: a tool that needs model answers (a whole
 * film, a refine, a reference analysis …) must not block the agent that is supposed to write those answers. In
 * 宿主智能体代写 mode such a tool starts its work here and returns at once; the agent keeps serving host_llm_task,
 * which hands back the job's final result when it is done.
 */
const HOST_JOBS = new Map()

/** Start `fn` as a background job; returns the job record ({ id, tool, status: 'running', startedAt }). */
export function startHostJob(tool, fn) {
  const id = `job-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
  const job = { id, tool: String(tool || ''), status: 'running', startedAt: new Date().toISOString(), finishedAt: '', result: null, error: '' }
  HOST_JOBS.set(id, job)
  Promise.resolve()
    .then(fn)
    .then(
      (r) => {
        job.status = 'done'
        job.result = r ?? null
      },
      (err) => {
        job.status = 'error'
        job.error = String(err?.message || err || '未知错误')
      },
    )
    .finally(() => {
      job.finishedAt = new Date().toISOString()
    })
  return { id, tool: job.tool, status: job.status, startedAt: job.startedAt }
}

/** Jobs still running ({ id, tool, startedAt }). */
export function listRunningHostJobs() {
  return [...HOST_JOBS.values()].filter((j) => j.status === 'running').map(({ id, tool, startedAt }) => ({ id, tool, startedAt }))
}

/** Finished jobs with their results; each is handed out once. */
export function takeFinishedHostJobs() {
  const out = []
  for (const j of HOST_JOBS.values()) {
    if (j.status === 'running') continue
    out.push({ id: j.id, tool: j.tool, status: j.status, startedAt: j.startedAt, finishedAt: j.finishedAt, ...(j.status === 'done' ? { result: j.result } : { error: j.error }) })
    HOST_JOBS.delete(j.id)
  }
  return out
}

/** Drop stale tasks / replies (older than `maxAgeMs`), e.g. left behind by a crashed process. */
export function pruneHostQueue({ root = REPO_ROOT, maxAgeMs = 6 * 3600_000 } = {}) {
  const d = dirs(root)
  const now = Date.now()
  let removed = 0
  for (const sub of [d.tasks, d.replies, d.images]) {
    for (const f of readdirSync(sub)) {
      try {
        if (now - statSync(join(sub, f)).mtimeMs > maxAgeMs) {
          rmSync(join(sub, f), { force: true })
          removed++
        }
      } catch {}
    }
  }
  return removed
}
