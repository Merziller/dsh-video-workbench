import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadEnv, resolveEnvPath } from '../shared/index.js'
import { isBillingError } from './cloud-ledger.js'
import { HOST_AGENT_MODE, listHostTasks, requestHostCompletion } from './host-llm-bridge.js'
import { readJsonSafe, withFileLockSync, writeJsonAtomic } from './safe-json-store.js'

/**
 * 宿主智能体代写 (mode 'host-agent'): the agent the user is talking to (Codex, Claude Code …) writes the plugin's model
 * answers with its own model through the `host_llm_task` MCP tool. An agent may be busy with something else when a task
 * arrives, so it gets longer than an API call: 30 minutes unless `DSH_HOST_AGENT_TIMEOUT_MS` says otherwise.
 */
export const DEFAULT_HOST_AGENT_TIMEOUT_MS = 30 * 60_000
/** A Latin agent name inside Chinese text gets spaces around it (由 OpenAI Codex 代写 / 由当前智能体代写). */
const spacedName = (name) => (/[A-Za-z0-9]/.test(String(name)) ? ` ${String(name).trim()} ` : String(name))
export function getHostAgentTimeoutMs() {
  loadEnv()
  const raw = Number(String(process.env.DSH_HOST_AGENT_TIMEOUT_MS ?? '').trim())
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_HOST_AGENT_TIMEOUT_MS
  return Math.round(Math.min(6 * 3_600_000, Math.max(10_000, raw)))
}

/**
 * One time limit for every text-model request the user starts — AI 润色 / AI 立即改 / AI 精修 / AI 协助 / 参考拆解 /
 * 画面自检 / 封面提示词 / 一键出片 … — so slow reasoning models and busy relays get to finish. Call sites pass nothing
 * (or `getLlmTimeoutMs()`) instead of their own numbers; the panels wait for the same limit (`llmConfig.timeoutMs`).
 * `DSH_LLM_TIMEOUT_MS` (milliseconds) overrides the 10-minute default.
 */
export const DEFAULT_LLM_TIMEOUT_MS = 600_000
export function getLlmTimeoutMs() {
  loadEnv()
  const raw = Number(String(process.env.DSH_LLM_TIMEOUT_MS ?? '').trim())
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LLM_TIMEOUT_MS
  return Math.round(Math.min(7_200_000, Math.max(1_000, raw)))
}

/** Plain-Chinese duration: 600000 → "10 分钟", 90000 → "1 分 30 秒", 45000 → "45 秒". */
export function formatLlmWait(ms) {
  const sec = Math.max(0, Math.round(Number(ms) / 1000) || 0)
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} 分 ${s} 秒` : `${m} 分钟`
}

/** The error text of a timed-out model call (keeps the "LLM 请求超时 (Ns)" tag that logs and older callers match on). */
export function llmTimeoutMessage(ms) {
  return `大模型在 ${formatLlmWait(ms)}内没有返回结果（LLM 请求超时 (${Math.round(Number(ms) / 1000)}s)）。可以稍后重试，或在「设置 · 模型与密钥」换一个响应更快的模型。`
}

/**
 * The runtime's own fetch (Node's bundled undici, or a native one) — only that one is swapped for node:http on long
 * calls. A fetch a caller or test installed on globalThis keeps handling the request (with the 10-minute default every
 * call is "long", so mocked fetches would otherwise be bypassed).
 */
function isBuiltinFetch(fn) {
  if (typeof fn !== 'function' || fn !== globalThis.fetch) return false
  try {
    return /undici|\[native code\]/.test(Function.prototype.toString.call(fn))
  } catch {
    return false
  }
}

/**
 * Node built-in http/https POST helper used when `timeoutMs > 240_000` so long-running
 * reasoning LLM calls (up to 10 minutes) bypass Node undici's default 300s `headersTimeout`.
 */
function postJsonLongTimeout(endpoint, headers, bodyStr, timeoutMs, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    const parsedUrl = new URL(endpoint)
    const mod = parsedUrl.protocol === 'http:' ? http : https
    const bodyBuf = Buffer.from(bodyStr, 'utf8')
    let settled = false
    const done = (fn, val) => {
      if (settled) return
      settled = true
      try { signal?.removeEventListener('abort', onAbort) } catch {}
      fn(val)
    }
    const req = mod.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': String(bodyBuf.byteLength),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode || 0
          const rawHeaders = res.headers || {}
          done(resolvePromise, {
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (k) => rawHeaders[String(k).toLowerCase()] ?? null },
            text: async () => text,
          })
        })
        res.on('error', (err) => done(rejectPromise, err))
      },
    )
    const onAbort = () => {
      try { req.destroy(signal?.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' })) } catch {}
      done(rejectPromise, signal?.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' }))
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    req.setTimeout(timeoutMs, () => {
      const err = new Error(llmTimeoutMessage(timeoutMs))
      try { req.destroy(err) } catch {}
      done(rejectPromise, err)
    })
    req.on('error', (err) => done(rejectPromise, err))
    req.end(bodyBuf)
  })
}

export const WIRE_PROTOCOLS = [
  {
    id: 'openai-completions',
    label: 'OpenAI 兼容 Chat · /v1/chat/completions',
    shortLabel: 'OpenAI Chat (/v1/chat/completions)',
  },
  {
    id: 'anthropic-messages',
    label: 'Anthropic Messages · /v1/messages',
    shortLabel: 'Anthropic Messages (/v1/messages)',
  },
  {
    id: 'openai-responses',
    label: 'OpenAI Responses · /v1/responses',
    shortLabel: 'OpenAI Responses (/v1/responses)',
  },
  {
    id: 'gemini-native',
    label: 'Gemini 原生 · /v1beta/models',
    shortLabel: 'Gemini 原生 (/v1beta/models)',
  },
]

export const LLM_PROVIDER_TEMPLATES = {
  custom: {
    id: 'custom',
    label: '自由定制接口 (支持全部 4 种协议)',
    defaultFormat: 'auto',
    defaultBaseUrl: '',
    suggestedModels: [],
    requiresKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude (Messages 原生)',
    defaultFormat: 'anthropic-messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    suggestedModels: ['claude-opus-5-5', 'claude-opus-4-6', 'claude-sonnet-4-6'],
    requiresKey: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI GPT (Chat / Responses)',
    defaultFormat: 'openai-responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    suggestedModels: ['gpt-6.1-sol', 'gpt-5', 'gpt-4o'],
    requiresKey: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (原生 /v1beta/models)',
    defaultFormat: 'gemini-native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    requiresKey: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek 官方接口',
    defaultFormat: 'openai-completions',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter 多模型聚合网关',
    defaultFormat: 'openai-completions',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    suggestedModels: ['anthropic/claude-opus-4', 'openai/gpt-5', 'google/gemini-2.5-pro'],
    requiresKey: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama / 本地大模型服务',
    defaultFormat: 'openai-completions',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    suggestedModels: ['qwen2.5-coder:32b', 'deepseek-r1:32b'],
    requiresKey: false,
  },
}

const VALID_FORMATS = new Set([
  'auto',
  'openai-completions',
  'anthropic-messages',
  'openai-responses',
  'gemini-native',
  'openai',
  'anthropic',
  'gemini',
])

export function normalizeProtocolFormat(rawFormat) {
  const f = String(rawFormat || 'auto').trim().toLowerCase()
  if (f === 'openai') return 'openai-completions'
  if (f === 'anthropic') return 'anthropic-messages'
  if (f === 'gemini') return 'gemini-native'
  if (
    f === 'openai-completions' ||
    f === 'anthropic-messages' ||
    f === 'openai-responses' ||
    f === 'gemini-native'
  ) {
    return f
  }
  return 'auto'
}

export function getLlmConfigPath() {
  loadEnv()
  const homeDir = resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home')
  return join(homeDir, 'llm-config.json')
}

export function maskSecretKey(rawKey) {
  const key = String(rawKey || '').trim()
  if (!key) return ''
  if (key.length <= 8) return '*'.repeat(key.length)
  // short keys keep only 2 + 2 characters visible (a 10-character key must never be shown in full)
  if (key.length <= 16) return `${key.slice(0, 2)}${'*'.repeat(key.length - 4)}${key.slice(-2)}`
  return `${key.slice(0, 6)}${'*'.repeat(Math.min(12, key.length - 10))}${key.slice(-4)}`
}

function stripYamlScalar(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  const commentIdx = s.indexOf(' #')
  if (commentIdx > 0) s = s.slice(0, commentIdx).trim()
  return s
}

function parseCredentialsRefs(credPath) {
  const refs = {}
  if (!existsSync(credPath)) return refs
  try {
    const lines = readFileSync(credPath, 'utf8').split(/\r?\n/)
    let inRefs = false
    for (const line of lines) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue
      if (/^refs:\s*$/.test(line)) {
        inRefs = true
        continue
      }
      if (/^[^\s]/.test(line)) {
        inRefs = false
        continue
      }
      if (inRefs) {
        const m = /^  ([A-Za-z0-9_.:-]+):\s*(.+?)\s*$/.exec(line)
        if (m) {
          const val = stripYamlScalar(m[2])
          if (val && !val.startsWith('!')) refs[m[1]] = val
        }
      }
    }
  } catch {}
  return refs
}

// DSH's own model capability declarations: pi-ai channels list `input: [text, image]`, the DeepSeek channel lists
// `inputModalities: [text, image]`. Kept on each model as `input` (lower-case names) — the 看图 (vision) logic uses it.
const DSH_INPUT_KEYS = new Set(['input', 'inputModalities', 'modalities', 'inputTypes'])
/** `[text, image]` / `["text", "image"]` / '' (a block list follows) → ['text', 'image'] */
function parseInlineYamlList(raw) {
  const s = String(raw || '').trim()
  if (!s) return []
  const inner = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s
  return inner
    .split(',')
    .map((x) => stripYamlScalar(x).toLowerCase())
    .filter(Boolean)
}
/** The input modalities a DSH channel declares for one of its models (['text', 'image'] …), null when it declares none. */
function dshModelInput(prov, modelId) {
  const m = (prov?.models || []).find((x) => x && x.id === modelId)
  return m && Array.isArray(m.input) && m.input.length ? [...m.input] : null
}

function parseProvidersFromCordisPatch(patchPath) {
  const providers = []
  if (!existsSync(patchPath)) return providers
  try {
    const lines = readFileSync(patchPath, 'utf8').split(/\r?\n/)
    let topId = ''
    let inPiProviders = false
    let curProvider = null
    let inProviderModels = false
    let deepseekProvider = null
    let inDeepseekModels = false
    let modelListKey = '' // the model key whose block list (`- image`) the following lines belong to

    const flushCur = () => {
      if (curProvider && curProvider.id) {
        providers.push(curProvider)
      }
      curProvider = null
      inProviderModels = false
    }

    for (const rawLine of lines) {
      if (/^\s*$/.test(rawLine) || /^\s*#/.test(rawLine)) continue

      // Top-level list entry `- id: xxx` or `- insert:`
      const topMatch = /^- (id:\s*(.+)|insert:\s*)$/.exec(rawLine)
      if (topMatch) {
        flushCur()
        if (deepseekProvider) {
          providers.push(deepseekProvider)
          deepseekProvider = null
        }
        inPiProviders = false
        inDeepseekModels = false
        topId = topMatch[2] ? stripYamlScalar(topMatch[2]) : ''
        continue
      }

      if (topId === 'llm-pi-ai') {
        if (/^    providers:\s*$/.test(rawLine)) {
          inPiProviders = true
          continue
        }
        if (inPiProviders && /^  [a-zA-Z]/.test(rawLine)) {
          flushCur()
          inPiProviders = false
          continue
        }
        if (inPiProviders) {
          const provMatch = /^      ([a-zA-Z0-9_-]+):\s*$/.exec(rawLine)
          if (provMatch) {
            flushCur()
            curProvider = {
              id: provMatch[1],
              displayName: provMatch[1],
              apiKeyEnv: '',
              api: 'openai-completions',
              baseURL: '',
              models: [],
            }
            continue
          }
          if (curProvider) {
            if (/^        models:\s*$/.test(rawLine)) {
              inProviderModels = true
              continue
            }
            const kv = /^        ([a-zA-Z0-9_]+):\s*(.+?)\s*$/.exec(rawLine)
            if (kv) {
              inProviderModels = false
              const [, k, vRaw] = kv
              const v = stripYamlScalar(vRaw)
              if (k === 'displayName') curProvider.displayName = v
              else if (k === 'apiKeyEnv') curProvider.apiKeyEnv = v
              else if (k === 'api') curProvider.api = normalizeProtocolFormat(v)
              else if (k === 'baseURL') curProvider.baseURL = v.replace(/\/+$/, '')
              continue
            }
            if (inProviderModels) {
              const idMatch = /^          - id:\s*(.+?)\s*$/.exec(rawLine)
              if (idMatch) {
                curProvider.models.push({ id: stripYamlScalar(idMatch[1]), name: stripYamlScalar(idMatch[1]) })
                modelListKey = ''
                continue
              }
              const lastModel = curProvider.models[curProvider.models.length - 1]
              if (lastModel) {
                const nameMatch = /^            name:\s*(.+?)\s*$/.exec(rawLine)
                if (nameMatch) lastModel.name = stripYamlScalar(nameMatch[1])
                const tokMatch = /^            maxTokens:\s*(\d+)\s*$/.exec(rawLine)
                if (tokMatch) lastModel.maxTokens = Number(tokMatch[1])
                const keyMatch = /^            ([A-Za-z0-9_]+):\s*(.*?)\s*$/.exec(rawLine)
                if (keyMatch) {
                  modelListKey = keyMatch[1]
                  if (DSH_INPUT_KEYS.has(modelListKey)) lastModel.input = parseInlineYamlList(keyMatch[2])
                }
                const itemMatch = /^              -\s*(.+?)\s*$/.exec(rawLine)
                if (itemMatch && DSH_INPUT_KEYS.has(modelListKey) && Array.isArray(lastModel.input)) {
                  lastModel.input.push(stripYamlScalar(itemMatch[1]).toLowerCase())
                }
              }
            }
          }
        }
      } else if (topId === 'llm-deepseek') {
        if (!deepseekProvider) {
          deepseekProvider = {
            id: 'llm-deepseek',
            displayName: 'DSH DeepSeek 默认',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            api: 'openai-completions',
            baseURL: 'https://api.deepseek.com/v1',
            models: [],
          }
        }
        if (/^    models:\s*$/.test(rawLine)) {
          inDeepseekModels = true
          continue
        }
        const dsBase = /^    baseURL:\s*(.+?)\s*$/.exec(rawLine)
        if (dsBase) {
          inDeepseekModels = false
          deepseekProvider.baseURL = stripYamlScalar(dsBase[1]).replace(/\/+$/, '')
          continue
        }
        if (/^    [A-Za-z]/.test(rawLine)) inDeepseekModels = false // another config key ends the model list
        if (inDeepseekModels) {
          const dm = /^      - id:\s*(.+?)\s*$/.exec(rawLine)
          if (dm) {
            deepseekProvider.models.push({ id: stripYamlScalar(dm[1]), name: stripYamlScalar(dm[1]) })
            modelListKey = ''
            continue
          }
          const lastM = deepseekProvider.models[deepseekProvider.models.length - 1]
          if (lastM) {
            const nm = /^        name:\s*(.+?)\s*$/.exec(rawLine)
            if (nm) lastM.name = stripYamlScalar(nm[1])
            const km = /^        ([A-Za-z0-9_]+):\s*(.*?)\s*$/.exec(rawLine)
            if (km) {
              modelListKey = km[1]
              if (DSH_INPUT_KEYS.has(modelListKey)) lastM.input = parseInlineYamlList(km[2])
            }
            const im = /^          -\s*(.+?)\s*$/.exec(rawLine)
            if (im && DSH_INPUT_KEYS.has(modelListKey) && Array.isArray(lastM.input)) lastM.input.push(stripYamlScalar(im[1]).toLowerCase())
          }
        }
      }
    }
    flushCur()
    if (deepseekProvider) providers.push(deepseekProvider)
  } catch {}
  return providers
}

/**
 * DSH's own default-model setting — the `agent-default-model` entry of cordis.patch.yml (written by DSH's model
 * picker / settings): `{ provider, model }`, empty strings when DSH has no such entry.
 */
function readDshAgentDefaultModel(patchPath) {
  const none = { provider: '', model: '' }
  try {
    if (!existsSync(patchPath)) return none
    let inBlock = false
    let inConfig = false
    let provider = ''
    let model = ''
    for (const rawLine of readFileSync(patchPath, 'utf8').split(/\r?\n/)) {
      if (/^- id:/.test(rawLine)) {
        if (inBlock) break
        inBlock = /^- id:\s*["']?agent-default-model["']?\s*$/.test(rawLine)
        inConfig = false
        continue
      }
      if (!inBlock) continue
      if (/^  config:\s*$/.test(rawLine)) {
        inConfig = true
        continue
      }
      if (/^  \S/.test(rawLine)) {
        inConfig = false
        continue
      }
      if (!inConfig) continue
      const p = /^    provider:\s*(.+?)\s*$/.exec(rawLine)
      if (p) provider = stripYamlScalar(p[1])
      const m = /^    model:\s*(.+?)\s*$/.exec(rawLine)
      if (m) model = stripYamlScalar(m[1])
    }
    return { provider, model }
  } catch {
    return none
  }
}

function readLatestDshActiveSelection(dshHome) {
  const sessDir = join(dshHome, 'storages', 'session_projcache', 'sessions')
  if (!existsSync(sessDir)) return { provider: '', model: '' }
  try {
    const latest = readdirSync(sessDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, mt: statSync(join(sessDir, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt)
    for (const item of latest.slice(0, 6)) {
      const parsed = JSON.parse(readFileSync(join(sessDir, item.f), 'utf8'))
      const sel = parsed?.record?.rows?.modelSelection?.val
      const picked = sel?.pending || sel?.lastUsed
      if (picked && (picked.provider || picked.model)) {
        return {
          provider: String(picked.provider || '').trim(),
          model: String(picked.model || '').trim(),
        }
      }
    }
  } catch {}
  return { provider: '', model: '' }
}

function loadDshClientDiscoveryInternal(dshHomeOverride = '') {
  loadEnv()
  const dshHome =
    dshHomeOverride ||
    process.env.DSH_CLIENT_HOME ||
    process.env.DSH_HOME ||
    join(homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'desktop'
  const patchPath = join(dshHome, 'profiles', profile, 'cordis.patch.yml')
  const credPath = join(dshHome, '.credentials.yaml')

  const refs = parseCredentialsRefs(credPath)
  const rawProviders = parseProvidersFromCordisPatch(patchPath)
  // DSH's own default-model setting; the latest session cache only for DSH versions without that setting
  const configuredDefault = readDshAgentDefaultModel(patchPath)
  const activeSelection =
    configuredDefault.provider || configuredDefault.model ? configuredDefault : readLatestDshActiveSelection(dshHome)

  const providers = rawProviders.map((p) => {
    const resolvedKey =
      (p.apiKeyEnv && (process.env[p.apiKeyEnv] || refs[p.apiKeyEnv])) || ''
    return {
      ...p,
      hasApiKey: Boolean(resolvedKey),
      maskedApiKey: maskSecretKey(resolvedKey),
      _secretKey: resolvedKey,
    }
  })

  // Match active DSH client selection -> specific provider, else fallback to first keyed provider
  let defaultProvider =
    providers.find((p) => p.id === activeSelection.provider && p.hasApiKey) ||
    providers.find((p) => p.id === activeSelection.provider) ||
    providers.find((p) => p.hasApiKey && p.models.length > 0) ||
    providers[0] ||
    null

  let defaultModel = ''
  if (defaultProvider) {
    if (
      activeSelection.model &&
      activeSelection.provider === defaultProvider.id
    ) {
      defaultModel = activeSelection.model
    } else if (defaultProvider.models.length > 0) {
      defaultModel = defaultProvider.models[0].id
    }
  }

  return {
    available: providers.length > 0,
    dshHome,
    profile,
    activeSelection,
    defaultProvider,
    defaultModel,
    providers,
  }
}

/**
 * Public safe view of discovered DSH client providers & active model (ALL API keys stripped).
 */
export function discoverDshClientConfig(dshHomeOverride = '') {
  const d = loadDshClientDiscoveryInternal(dshHomeOverride)
  return {
    available: d.available,
    profile: d.profile,
    activeSelection: d.activeSelection,
    defaultProviderId: d.defaultProvider?.id || '',
    defaultProviderName: d.defaultProvider?.displayName || '',
    defaultModelId: d.defaultModel || '',
    defaultProtocol: d.defaultProvider?.api || 'openai-completions',
    providers: d.providers.map(({ _secretKey, ...rest }) => rest),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Host agent. The plugin runs inside DSH (Cordis plugin), as the MCP server of another agent (Claude Code, Codex,
// opencode, OpenClaw, Hermes, pi, WorkBuddy, Antigravity, Gemini CLI, Cursor …) or as a standalone web studio.
// `DSH_VIDEO_HOST_AGENT` names it: the MCP server sets it from the client's `initialize` info, the DSH plugin entry sets
// 'dsh', a studio started by an agent inherits it, and users may set it themselves.
const HOST_AGENTS = [
  { id: 'dsh', match: /(^|[^a-z])dsh([^a-z]|$)|deepseek[\s_-]*harness/i, label: 'DeepSeek Harness（DSH）', prefer: ['deepseek', 'anthropic', 'openai', 'openrouter', 'gemini'] },
  { id: 'claude-code', match: /claude/i, label: 'Claude Code', prefer: ['anthropic', 'openrouter', 'openai', 'deepseek', 'gemini'] },
  { id: 'codex', match: /codex/i, label: 'OpenAI Codex', prefer: ['openai', 'openrouter', 'anthropic', 'deepseek', 'gemini'] },
  { id: 'antigravity', match: /antigravity/i, label: 'Antigravity', prefer: ['gemini', 'openrouter', 'anthropic', 'openai', 'deepseek'] },
  { id: 'gemini-cli', match: /gemini/i, label: 'Gemini CLI', prefer: ['gemini', 'openrouter', 'anthropic', 'openai', 'deepseek'] },
  { id: 'opencode', match: /opencode/i, label: 'opencode' },
  { id: 'openclaw', match: /openclaw/i, label: 'OpenClaw' },
  { id: 'hermes', match: /hermes/i, label: 'Hermes' },
  { id: 'workbuddy', match: /work\s*buddy|codebuddy/i, label: 'WorkBuddy' },
  { id: 'pi', match: /^pi([^a-z]|$)|pi[\s_-]*coding/i, label: 'pi' },
  { id: 'cursor', match: /cursor/i, label: 'Cursor' },
  { id: 'windsurf', match: /windsurf|codeium/i, label: 'Windsurf' },
  { id: 'cline', match: /cline|roo[\s_-]*code/i, label: 'Cline' },
  { id: 'vscode', match: /visual studio code|vscode|copilot/i, label: 'VS Code / Copilot' },
]
const DEFAULT_ENV_PREFERENCE = ['anthropic', 'openai', 'openrouter', 'deepseek', 'gemini']

/** The agent hosting this process: { id, name, label, version }; id '' = standalone studio / unknown. */
export function getHostAgentInfo() {
  const raw = String(process.env.DSH_VIDEO_HOST_AGENT || '').trim()
  if (!raw) return { id: '', name: '', label: '', version: '' }
  const hit = HOST_AGENTS.find((h) => h.match.test(raw))
  return {
    id: hit ? hit.id : raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent',
    name: raw.slice(0, 80),
    label: hit ? hit.label : raw.slice(0, 40),
    version: String(process.env.DSH_VIDEO_HOST_AGENT_VERSION || '').trim().slice(0, 40),
  }
}

// Model APIs an agent's environment commonly exposes to the tools it starts. ONLY plain API keys the user exported
// for this process are used — never another app's login / subscription tokens (e.g. CLAUDE_CODE_OAUTH_TOKEN) and never
// its credential files: using those outside the app that issued them is not allowed.
const HOST_ENV_PROVIDERS = [
  { provider: 'anthropic', keyVars: ['ANTHROPIC_API_KEY'], baseVars: ['ANTHROPIC_BASE_URL'], modelVars: ['ANTHROPIC_MODEL'] },
  { provider: 'openai', keyVars: ['OPENAI_API_KEY'], baseVars: ['OPENAI_BASE_URL', 'OPENAI_API_BASE'], modelVars: ['OPENAI_MODEL'] },
  { provider: 'deepseek', keyVars: ['DEEPSEEK_API_KEY'], baseVars: ['DEEPSEEK_BASE_URL'], modelVars: ['DEEPSEEK_MODEL'] },
  { provider: 'gemini', keyVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], baseVars: ['GEMINI_BASE_URL'], modelVars: ['GEMINI_MODEL'] },
  { provider: 'openrouter', keyVars: ['OPENROUTER_API_KEY'], baseVars: ['OPENROUTER_BASE_URL'], modelVars: ['OPENROUTER_MODEL'] },
]

function discoverHostEnvInternal(host = getHostAgentInfo()) {
  const order = HOST_AGENTS.find((h) => h.id === host.id)?.prefer || DEFAULT_ENV_PREFERENCE
  const env = (name) => String(process.env[name] || '').trim()
  const found = []
  for (const p of HOST_ENV_PROVIDERS) {
    const keyVar = p.keyVars.find((v) => env(v))
    if (!keyVar) continue
    const tpl = LLM_PROVIDER_TEMPLATES[p.provider] || LLM_PROVIDER_TEMPLATES.custom
    const baseVar = p.baseVars.find((v) => env(v)) || ''
    const modelVar = p.modelVars.find((v) => env(v)) || ''
    // ANTHROPIC_BASE_URL is an Anthropic-compatible gateway; an OPENAI_BASE_URL relay usually speaks chat completions
    const format =
      p.provider === 'anthropic' ? 'anthropic-messages' : p.provider === 'openai' && baseVar ? 'openai-completions' : tpl.defaultFormat
    found.push({
      provider: p.provider,
      label: tpl.label,
      keyVar,
      baseVar,
      modelVar,
      baseUrl: (baseVar ? env(baseVar) : tpl.defaultBaseUrl || '').replace(/\/+$/, ''),
      model: modelVar ? env(modelVar) : tpl.suggestedModels?.[0] || '',
      format,
      _secretKey: env(keyVar),
    })
  }
  const rank = (prov) => {
    const i = order.indexOf(prov)
    return i < 0 ? order.length : i
  }
  return found.sort((a, b) => rank(a.provider) - rank(b.provider))
}

/** Public view of the model APIs found in this process's environment (never the key values). */
export function discoverHostEnvLlm() {
  return discoverHostEnvInternal().map(({ _secretKey, ...rest }) => ({ ...rest, maskedKey: maskSecretKey(_secretKey) }))
}

function readStoredConfigFile() {
  const cfgPath = getLlmConfigPath()
  if (!existsSync(cfgPath)) return {}
  try {
    const parsed = JSON.parse(readFileSync(cfgPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Resolve the effective LLM configuration. Modes:
 * - `auto` (default) — follow the agent that hosts the plugin: inside DSH (or the standalone studio) the active DSH
 *   channel; inside another agent the model API its environment exposes (ANTHROPIC_API_KEY / OPENAI_API_KEY / …,
 *   preferring the provider that matches the agent); then the plugin's own custom fields; then a local DSH install.
 * - `follow-dsh` — a DSH channel the user picked explicitly (or DSH's active one).
 * - `custom` — the plugin's own provider / URL / key / model.
 * Per-call overrides (tests, one-off calls) win over the stored file.
 */
export function resolveLlmConfig(override = {}) {
  loadEnv()
  const fileCfg = readStoredConfigFile()
  const hasExplicitUrlOrKeyOverride =
    override.baseUrl !== undefined || override.apiKey !== undefined
  const envForcesCustom = Boolean(process.env.LLM_BASE_URL || process.env.LLM_MODEL)

  let mode = String(
    override.mode ??
      (hasExplicitUrlOrKeyOverride ? 'custom' : undefined) ??
      fileCfg.mode ??
      process.env.LLM_MODE ??
      (envForcesCustom ? 'custom' : 'auto'),
  )
    .trim()
    .toLowerCase()
  // Before v0.6.0 'follow-dsh' WAS the automatic default. A stored follow-dsh that only tracked DSH's active channel
  // (no channel / model / protocol picked) now follows whichever agent hosts the plugin.
  if (
    mode === 'follow-dsh' &&
    override.mode === undefined &&
    !fileCfg.configVersion &&
    String(fileCfg.mode || '').toLowerCase() === 'follow-dsh' &&
    (!fileCfg.dshProviderId || fileCfg.dshProviderId === 'active') &&
    !String(fileCfg.model || '').trim() &&
    (!fileCfg.format || fileCfg.format === 'auto')
  ) {
    mode = 'auto'
  }
  if (mode !== 'custom' && mode !== 'follow-dsh' && mode !== 'auto' && mode !== HOST_AGENT_MODE) {
    mode = 'auto'
  }

  const maxRepairRounds = Math.max(
    1,
    Math.min(
      5,
      Number(override.maxRepairRounds ?? fileCfg.maxRepairRounds ?? process.env.LLM_MAX_REPAIR_ROUNDS ?? 3) || 3,
    ),
  )
  const temperature = Number.isFinite(Number(override.temperature ?? fileCfg.temperature))
    ? Number(override.temperature ?? fileCfg.temperature)
    : 0.45
  const maxTokens = Math.max(
    1024,
    Number(override.maxTokens ?? fileCfg.maxTokens ?? 16000) || 16000,
  )
  const common = { maxRepairRounds, temperature, maxTokens }

  // 宿主智能体代写: no endpoint, no key — the agent hosting the plugin answers the writing tasks with its own model
  if (mode === HOST_AGENT_MODE) {
    const host = getHostAgentInfo()
    return {
      mode: HOST_AGENT_MODE,
      resolvedBy: HOST_AGENT_MODE,
      host,
      sourceLabel: `由${spacedName(host.label || '当前智能体')}代写（用它自己的模型，不需要 API Key）`,
      dshProviderId: '',
      provider: HOST_AGENT_MODE,
      format: 'auto',
      baseUrl: '',
      apiKey: '',
      model: HOST_AGENT_MODE,
      ...common,
    }
  }

  // DSH channel: the explicit one (follow-dsh) or DSH's active selection (auto)
  const fromDsh = ({ followActive = false } = {}) => {
    const dsh = loadDshClientDiscoveryInternal(override.dshHomeDir || '')
    const requestedDshProvId = followActive ? '' : String(override.dshProviderId ?? fileCfg.dshProviderId ?? '').trim()
    const pickedProv =
      (requestedDshProvId && requestedDshProvId !== 'active'
        ? dsh.providers.find((p) => p.id === requestedDshProvId)
        : null) || dsh.defaultProvider
    if (!pickedProv) return null
    const requestedModel = String(override.model ?? (followActive ? '' : fileCfg.model) ?? '').trim()
    const useModel =
      requestedModel ||
      (pickedProv.id === dsh.defaultProvider?.id ? dsh.defaultModel : '') ||
      pickedProv.models?.[0]?.id ||
      ''
    const formatOverride = String(override.format ?? (followActive ? '' : fileCfg.format) ?? '').trim()
    const effFormat =
      formatOverride && formatOverride !== 'auto'
        ? normalizeProtocolFormat(formatOverride)
        : pickedProv.api || 'openai-completions'
    return {
      mode: 'follow-dsh',
      sourceLabel:
        !requestedDshProvId || requestedDshProvId === 'active'
          ? `跟随 DSH 默认 (${pickedProv.displayName})`
          : `DSH 通道 (${pickedProv.displayName})`,
      dshProviderId: pickedProv.id,
      dshChannelName: pickedProv.displayName,
      provider: pickedProv.id,
      format: effFormat,
      baseUrl: pickedProv.baseURL,
      apiKey: pickedProv._secretKey || '',
      model: useModel,
      // what DSH's channel config declares the model accepts (['text', 'image'] …); null when it says nothing
      modelInput: dshModelInput(pickedProv, useModel),
      ...common,
    }
  }

  const fromCustom = () => {
    const provider =
      String(override.provider ?? fileCfg.provider ?? process.env.LLM_PROVIDER ?? 'custom').trim() ||
      'custom'
    const template = LLM_PROVIDER_TEMPLATES[provider] || LLM_PROVIDER_TEMPLATES.custom
    const formatRaw = String(
      override.format ?? fileCfg.format ?? process.env.LLM_FORMAT ?? template.defaultFormat ?? 'auto',
    ).toLowerCase()
    const format = VALID_FORMATS.has(formatRaw) ? normalizeProtocolFormat(formatRaw) : 'auto'
    const baseUrl = String(
      override.baseUrl ?? fileCfg.baseUrl ?? process.env.LLM_BASE_URL ?? template.defaultBaseUrl ?? '',
    )
      .trim()
      .replace(/\/+$/, '')
    const rawOverrideKey = override.apiKey !== undefined ? String(override.apiKey).trim() : undefined
    const apiKey =
      rawOverrideKey && rawOverrideKey !== 'KEEP_EXISTING' && !rawOverrideKey.includes('****')
        ? rawOverrideKey
        : String(fileCfg.apiKey ?? process.env.LLM_API_KEY ?? '').trim()
    const model = String(
      override.model ?? fileCfg.model ?? process.env.LLM_MODEL ?? '',
    ).trim()
    return {
      mode: 'custom',
      sourceLabel: template.label || '插件自定义模型',
      dshProviderId: '',
      provider,
      format,
      baseUrl,
      apiKey,
      model,
      ...common,
    }
  }

  if (mode === 'auto') {
    const host = getHostAgentInfo()
    const dshFirst = !host.id || host.id === 'dsh'
    const agentName = host.label || '当前智能体'
    if (dshFirst) {
      const d = fromDsh({ followActive: true })
      if (d) return { ...d, mode: 'auto', resolvedBy: 'dsh', host, sourceLabel: `跟随 DSH（${d.dshChannelName}）` }
    }
    const envHit = discoverHostEnvInternal(host)[0]
    if (envHit) {
      return {
        mode: 'auto',
        resolvedBy: 'host-env',
        host,
        sourceLabel: `跟随 ${agentName}（${envHit.keyVar}）`,
        hostEnvVar: envHit.keyVar,
        dshProviderId: '',
        provider: envHit.provider,
        format: envHit.format,
        baseUrl: envHit.baseUrl,
        apiKey: envHit._secretKey,
        model: String(override.model ?? '').trim() || envHit.model,
        ...common,
      }
    }
    const c = fromCustom()
    if (c.baseUrl && c.model) {
      return { ...c, mode: 'auto', resolvedBy: 'custom', host, sourceLabel: `自定义模型（${agentName} 没有可共享的模型配置）` }
    }
    if (!dshFirst) {
      const d = fromDsh({ followActive: true })
      if (d) return { ...d, mode: 'auto', resolvedBy: 'dsh', host, sourceLabel: `跟随本机 DSH（${d.dshChannelName}）` }
    }
    return {
      ...c,
      mode: 'auto',
      resolvedBy: 'none',
      host,
      // inside an agent used through a subscription (no API key to share) the agent can still write the answers itself
      sourceLabel: host.id && host.id !== 'dsh' ? `${agentName} 没有可共享的模型配置（可改用「由${spacedName(agentName)}代写」，不需要 API Key）` : '未配置大模型',
      hostAgentSuggested: Boolean(host.id && host.id !== 'dsh'),
    }
  }

  if (mode === 'follow-dsh') {
    const d = fromDsh()
    if (d) return { ...d, resolvedBy: 'dsh', host: getHostAgentInfo() }
    // If DSH directory is absent on this machine, fall cleanly to custom fields below
  }
  return { ...fromCustom(), resolvedBy: 'custom', host: getHostAgentInfo() }
}

export function getSafeLlmConfigSummary(dshHomeOverride = '') {
  const cfg = resolveLlmConfig(dshHomeOverride ? { dshHomeDir: dshHomeOverride } : {})
  const fileCfg = readStoredConfigFile()
  const dsh = discoverDshClientConfig(dshHomeOverride)
  const template = LLM_PROVIDER_TEMPLATES[cfg.provider] || LLM_PROVIDER_TEMPLATES.custom
  const requiresKey =
    cfg.provider !== 'ollama' && !/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/i.test(cfg.baseUrl)
  const hostWrites = cfg.mode === HOST_AGENT_MODE
  const configured = hostWrites || Boolean(cfg.baseUrl && cfg.model && (!requiresKey || cfg.apiKey))
  let hostQueue = null
  if (hostWrites) {
    try {
      const pending = listHostTasks()
      hostQueue = { pending: pending.length, waiting: pending.filter((t) => !t.claimed).length, oldestAt: pending[0]?.createdAt || '' }
    } catch {
      hostQueue = { pending: 0, waiting: 0, oldestAt: '' }
    }
  }
  return {
    configured,
    mode: cfg.mode,
    // 宿主智能体代写: writing tasks waiting for the agent ({ pending, waiting, oldestAt }); null in the other modes
    hostAgent: hostQueue,
    // nothing usable was found inside an agent: offer 「由智能体代写」 (mode 'host-agent')
    hostAgentSuggested: Boolean(cfg.hostAgentSuggested),
    sourceLabel: cfg.sourceLabel,
    dshProviderId: fileCfg.dshProviderId || (cfg.mode === 'follow-dsh' ? 'active' : ''),
    resolvedBy: cfg.resolvedBy || '',
    host: cfg.host || getHostAgentInfo(),
    hostEnv: discoverHostEnvLlm(),
    hostEnvVar: cfg.hostEnvVar || '',
    storedMode: String(fileCfg.mode || ''),
    provider: cfg.provider,
    format: cfg.format,
    detectedProtocol: detectWireProtocol(cfg),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    maxRepairRounds: cfg.maxRepairRounds,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    hasApiKey: Boolean(cfg.apiKey),
    maskedApiKey: maskSecretKey(cfg.apiKey),
    requiresKey: template.requiresKey,
    templates: Object.values(LLM_PROVIDER_TEMPLATES),
    protocols: WIRE_PROTOCOLS,
    dshClient: dsh,
    configFile: getLlmConfigPath(),
    // how long every model call may take (the panels wait for it too) and what is known about 看图 (vision)
    timeoutMs: hostWrites ? Math.max(getLlmTimeoutMs(), getHostAgentTimeoutMs()) : getLlmTimeoutMs(),
    vision: summarizeVision(cfg),
  }
}

export function saveLlmConfig(patch = {}) {
  const cfgPath = getLlmConfigPath()
  mkdirSync(dirname(cfgPath), { recursive: true })
  const existing = readStoredConfigFile()
  const nextMode =
    patch.mode === 'custom' || patch.mode === 'follow-dsh' || patch.mode === 'auto' || patch.mode === HOST_AGENT_MODE
      ? patch.mode
      : existing.mode || 'auto'

  let nextApiKey = existing.apiKey || ''
  if (patch.clearApiKey === true) {
    nextApiKey = ''
  } else if (patch.apiKey !== undefined) {
    const incomingKey = String(patch.apiKey).trim()
    if (incomingKey && incomingKey !== 'KEEP_EXISTING' && !incomingKey.includes('****')) {
      nextApiKey = incomingKey
    }
  }

  const fmtIn = String(patch.format ?? existing.format ?? 'auto').toLowerCase()
  const nextFormat = VALID_FORMATS.has(fmtIn) ? normalizeProtocolFormat(fmtIn) : 'auto'

  const next = {
    mode: nextMode,
    dshProviderId:
      nextMode === 'follow-dsh'
        ? String(patch.dshProviderId ?? existing.dshProviderId ?? 'active').trim() || 'active'
        : '',
    provider: String(patch.provider ?? existing.provider ?? 'custom').trim() || 'custom',
    format: nextFormat,
    baseUrl:
      nextMode === 'custom'
        ? String(patch.baseUrl ?? existing.baseUrl ?? '').trim().replace(/\/+$/, '')
        : existing.baseUrl || '',
    // Never write DSH client keys or the host agent's environment keys into the plugin config when following them;
    // the plugin's own (custom) key is kept for when the user switches back
    apiKey: nextMode === 'custom' ? nextApiKey : existing.apiKey || '',
    // auto follows the host's model; a model picked in custom / follow-dsh is kept for those modes
    model:
      nextMode === 'auto'
        ? existing.model || ''
        : patch.model !== undefined
          ? String(patch.model).trim()
          : existing.model || '',
    maxRepairRounds: Math.max(
      1,
      Math.min(5, Number(patch.maxRepairRounds ?? existing.maxRepairRounds ?? 3) || 3),
    ),
    temperature: Number.isFinite(Number(patch.temperature ?? existing.temperature))
      ? Number(patch.temperature ?? existing.temperature)
      : 0.45,
    maxTokens: Math.max(1024, Number(patch.maxTokens ?? existing.maxTokens ?? 16000) || 16000),
    // v2 = the mode is the user's explicit choice (pre-v0.6 files stored 'follow-dsh' as the automatic default)
    configVersion: 2,
    updatedAt: new Date().toISOString(),
    // 看图能力 settings live in the same file; saving the text model never drops them
    vision: mergeVisionSettings(existing.vision, patch.vision),
  }

  writeFileSync(cfgPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  // a changed model / endpoint invalidates every remembered 看图 verdict
  clearVisionCapabilityCache()
  return getSafeLlmConfigSummary()
}

// ---------------------------------------------------------------------------------------------------------------
// 看图能力 (vision): which model looks at pictures for 参考复刻 / 画面自检 / 截图定位, and what is known about it.
// Settings (`vision` in llm-config.json):
//   support  'auto' (default: check once with a tiny probe picture, remember the verdict) | 'yes' (the user says the
//            model can see: never probe or skip) | 'no' (never send pictures)
//   model    optional dedicated 看图模型 — on the text model's endpoint, or on its own one when baseUrl is given too
// Verdicts are remembered per protocol + endpoint + model in DSH_VIDEO_HOME/vision-capability.json (they expire, and
// saving the model settings forgets them). The probe and the decisions live in vision-capability.js.
const VISION_SUPPORT = new Set(['auto', 'yes', 'no'])
const VISION_CACHE_TTL_MS = { supported: 7 * 86_400_000, unsupported: 3 * 86_400_000 }
const VISION_SETTINGS_PLACE = '「设置 · 模型与密钥 → 看图能力」'
const isLocalBaseUrl = (url) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(String(url || '').trim())

function normalizeVisionSupport(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return VISION_SUPPORT.has(s) ? s : 'auto'
}
function normalizeVisionFormat(raw) {
  const f = String(raw || 'auto').trim().toLowerCase()
  return VALID_FORMATS.has(f) ? normalizeProtocolFormat(f) : 'auto'
}
function normalizeVisionSettings(raw) {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    support: normalizeVisionSupport(v.support),
    model: String(v.model || '').trim(),
    baseUrl: String(v.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(v.apiKey || '').trim(),
    format: normalizeVisionFormat(v.format),
    provider: String(v.provider || '').trim() || 'custom',
  }
}
/** Apply a patch ({ support, model, baseUrl, apiKey, clearApiKey, format, provider }) to stored 看图 settings. */
function mergeVisionSettings(existingRaw, patch) {
  const hasPatch = patch && typeof patch === 'object' && !Array.isArray(patch)
  if (!(existingRaw && typeof existingRaw === 'object') && !hasPatch) return undefined
  const next = normalizeVisionSettings(existingRaw)
  if (!hasPatch) return next
  if (patch.support !== undefined) next.support = normalizeVisionSupport(patch.support)
  if (patch.model !== undefined) next.model = String(patch.model ?? '').trim()
  if (patch.baseUrl !== undefined) next.baseUrl = String(patch.baseUrl ?? '').trim().replace(/\/+$/, '')
  if (patch.format !== undefined) next.format = normalizeVisionFormat(patch.format)
  if (patch.provider !== undefined) next.provider = String(patch.provider ?? '').trim() || 'custom'
  if (patch.clearApiKey === true) next.apiKey = ''
  else if (patch.apiKey !== undefined) {
    const k = String(patch.apiKey ?? '').trim()
    if (k && k !== 'KEEP_EXISTING' && !k.includes('****')) next.apiKey = k
  }
  return next
}

/** The stored 看图 settings — including the dedicated model's key, so never hand this to a UI. */
export function getVisionSettings() {
  return normalizeVisionSettings(readStoredConfigFile().vision)
}

/** Save only the 看图 settings (every other model setting stays as it is) and forget the remembered verdicts. */
export function saveVisionSettings(patch = {}) {
  const cfgPath = getLlmConfigPath()
  mkdirSync(dirname(cfgPath), { recursive: true })
  const existing = readStoredConfigFile()
  writeFileSync(cfgPath, JSON.stringify({ ...existing, vision: mergeVisionSettings(existing.vision || {}, patch) }, null, 2) + '\n', 'utf8')
  clearVisionCapabilityCache()
  return getSafeLlmConfigSummary()
}

function lookupDshModelInput(providerId, modelId, dshHomeOverride = '') {
  try {
    const d = loadDshClientDiscoveryInternal(dshHomeOverride || '')
    return dshModelInput(d.providers.find((p) => p.id === providerId), modelId)
  } catch {
    return null
  }
}

/**
 * The model that looks at pictures and how to reach it: the text model, or the dedicated 看图模型 (on the text model's
 * endpoint, or on its own endpoint when one is set). `config` is the `overrideConfig` for callLlmChat — the caller's
 * own override (or undefined: normal resolution) for the text model, a complete explicit config for a dedicated one.
 * `declared` is what DSH's channel config says the model accepts ('image' | 'text' | '' = says nothing).
 */
export function resolveVisionLlmConfig(mainOverride = {}, { main = null, settings = null } = {}) {
  const base = main || resolveLlmConfig(mainOverride || {})
  const s = settings || getVisionSettings()
  const dedicated = Boolean(s.model)
  const ownEndpoint = dedicated && Boolean(s.baseUrl)
  const endpoint = ownEndpoint
    ? { provider: s.provider || 'custom', format: s.format || 'auto', baseUrl: s.baseUrl, apiKey: s.apiKey }
    : { provider: base.provider || 'custom', format: detectWireProtocol(base), baseUrl: String(base.baseUrl || ''), apiKey: (dedicated && s.apiKey) || base.apiKey || '' }
  const model = dedicated ? s.model : String(base.model || '')
  const protocol = detectWireProtocol({ ...endpoint, model })
  const requiresKey = endpoint.provider !== 'ollama' && !isLocalBaseUrl(endpoint.baseUrl)
  // the agent hosting the plugin writes the answers itself (it opens pictures as local files): it can always look
  const hostWrites = !dedicated && base.mode === 'host-agent'
  let input = null
  if (!ownEndpoint && base.resolvedBy === 'dsh') {
    input = dedicated ? lookupDshModelInput(base.dshProviderId, model, mainOverride?.dshHomeDir) : Array.isArray(base.modelInput) ? base.modelInput : null
  }
  const hasMainOverride = mainOverride && typeof mainOverride === 'object' && Object.keys(mainOverride).length > 0
  return {
    configured: hostWrites || Boolean(endpoint.baseUrl && model && (!requiresKey || endpoint.apiKey)),
    dedicated,
    ownEndpoint,
    // 宿主智能体代写: pictures go to the agent as files (no probe, nothing to dial)
    hostAgent: hostWrites,
    support: hostWrites && s.support !== 'no' ? 'yes' : s.support,
    model: model || (hostWrites ? 'host-agent' : ''),
    mainModel: String(base.model || ''),
    protocol,
    provider: endpoint.provider,
    baseUrl: endpoint.baseUrl,
    declared: input ? (input.includes('image') ? 'image' : 'text') : '',
    cacheKey: visionCacheKey({ protocol, baseUrl: endpoint.baseUrl, model }),
    config: dedicated
      ? {
          mode: 'custom',
          provider: endpoint.provider,
          format: protocol,
          baseUrl: endpoint.baseUrl,
          apiKey: endpoint.apiKey,
          model,
          temperature: base.temperature,
          maxTokens: base.maxTokens,
          maxRepairRounds: base.maxRepairRounds,
        }
      : hasMainOverride
        ? mainOverride
        : undefined,
  }
}

export function getVisionCapabilityCachePath() {
  return join(resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home'), 'vision-capability.json')
}
export function visionCacheKey({ protocol = '', baseUrl = '', model = '' } = {}) {
  return [String(protocol), String(baseUrl).trim().replace(/\/+$/, '').toLowerCase(), String(model).trim()].join(' | ')
}
function readVisionCache() {
  const raw = readJsonSafe(getVisionCapabilityCachePath(), null)
  return raw && raw.version === 1 && raw.entries && typeof raw.entries === 'object' ? raw : { version: 1, entries: {} }
}
/** The remembered, unexpired 看图 verdict for an endpoint + model: { status, code, model, detail, answer, checkedAt, source } */
export function getCachedVisionCapability(key, now = Date.now()) {
  if (!key) return null
  const e = readVisionCache().entries[key]
  return e && Date.parse(e.expiresAt) > now ? e : null
}
/** Remember a conclusive verdict: { status: 'supported' | 'unsupported', code, model, protocol, detail, answer, source }. */
export function rememberVisionCapability(key, verdict = {}) {
  if (!key || !VISION_CACHE_TTL_MS[verdict.status]) return null
  const path = getVisionCapabilityCachePath()
  const now = Date.now()
  const entry = {
    status: verdict.status,
    code: String(verdict.code || verdict.status),
    model: String(verdict.model || ''),
    protocol: String(verdict.protocol || ''),
    detail: String(verdict.detail || '').slice(0, 300),
    answer: String(verdict.answer || '').slice(0, 80),
    source: String(verdict.source || ''),
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + VISION_CACHE_TTL_MS[verdict.status]).toISOString(),
  }
  try {
    withFileLockSync(`${path}.lock`, () => {
      const cache = readVisionCache()
      for (const [k, v] of Object.entries(cache.entries)) if (!(Date.parse(v?.expiresAt) > now)) delete cache.entries[k]
      cache.entries[key] = entry
      writeJsonAtomic(path, cache)
    })
  } catch {}
  return entry
}
export function clearVisionCapabilityCache() {
  try {
    unlinkSync(getVisionCapabilityCachePath())
  } catch {}
}

function fmtCheckedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Plain-Chinese words for a 看图 (vision) outcome — { short (badge), reason (what happened, with the API's own words),
 * fix (what the user can do) } — shared by the panels, the task logs and the agent tools.
 */
export function describeVisionStatus(code, { model = '', detail = '', answer = '', timeoutMs = 0, checkedAt = '' } = {}) {
  const m = String(model || '').trim() || '当前模型'
  const said = detail ? `（接口返回：${detail}）` : ''
  const pickOther = `到${VISION_SETTINGS_PLACE}单独指定一个能看图的模型（同一个接口里的其它模型也可以）`
  const when = checkedAt && fmtCheckedAt(checkedAt) ? `（${fmtCheckedAt(checkedAt)}检测）` : ''
  switch (code) {
    case 'supported':
      return { short: `${m} 能看图`, reason: `模型 ${m} 能看懂图片${when}。`, fix: '' }
    case 'used':
      return { short: 'AI 视觉已拆解', reason: `模型 ${m} 已经看过画面。`, fix: '' }
    case 'user-on':
      return { short: '已设为能看图', reason: `你在${VISION_SETTINGS_PLACE}里标记了模型 ${m} 能看图，插件会直接把图片发给它。`, fix: '' }
    case 'host-agent':
      return {
        short: '由智能体看图',
        reason: '由智能体代写时，需要看图的地方（参考复刻、画面自检、截图定位）也交给正在对话的智能体：插件把图片存成文件，由它直接打开来看，不需要单独的看图模型。',
        fix: '',
      }
    case 'declared-image':
      return { short: 'DSH 标注能看图', reason: `DSH 的通道配置里标注模型 ${m} 能接收图片；第一次用到看图功能时会先用一张很小的测试图确认一次。`, fix: '' }
    case 'unknown':
      return { short: '还没检测', reason: `还没确认模型 ${m} 能不能看图：第一次用到看图功能（参考复刻、画面自检）时，会先用一张很小的测试图自动检测并记住结果。`, fix: `也可以现在到${VISION_SETTINGS_PLACE}点「检测看图能力」。` }
    case 'disabled':
      return { short: '未开启 AI 视觉拆解', reason: '这次只做了本地测量（没有打开「AI 视觉深度拆解」），没有调用看图模型。', fix: '在「拆解选项」里打开「AI 视觉深度拆解」，再点「重新拆解」。' }
    case 'no-frames':
      return { short: '没抽到关键帧', reason: '没能从视频里抽出关键帧图片，所以没有让 AI 看图。', fix: '换一个能正常播放的视频文件（mp4 / mov）再试。' }
    case 'not-configured':
      return { short: '未配置看图模型', reason: '还没有可用的 AI 大模型（缺少接口地址、模型名或 API Key），所以没有让 AI 看图。', fix: '到「设置 · 模型与密钥」配置一个能看图的大模型。' }
    case 'user-off':
      return { short: '已设为不看图', reason: `你在${VISION_SETTINGS_PLACE}里把模型 ${m} 标记为「不支持看图」，所以没有发图片给它。`, fix: '如果它其实能看图，把看图能力改回「自动检测」或「支持看图」；也可以单独指定一个看图模型。' }
    case 'declared-text':
      return { short: `${m} 只能读文字`, reason: `DSH 的通道配置里标注模型 ${m} 只接收文字，所以没有发图片给它。`, fix: `${pickOther}；如果它其实能看图，把看图能力改成「支持看图」。` }
    case 'image-rejected':
      return { short: `${m} 不支持图片输入`, reason: `模型 ${m} 不支持图片输入${said}。`, fix: `${pickOther}；如果你确定它能看图，可以把看图能力改成「支持看图」再试。` }
    case 'image-format':
      return { short: '网关不支持这种图片格式', reason: `接口不接受插件发送的图片数据${said}。`, fix: `换一个支持 base64 图片输入的接口或协议；或${pickOther}。` }
    case 'not-looked':
      return {
        short: `${m} 没有真正看到图片`,
        reason: `接口收下了图片，但模型 ${m} 的回答说明它没有看到图片内容${answer ? `（测试图是一个红色方块，它回答：「${answer}」）` : ''}，多半是只能读文字的模型。`,
        fix: `${pickOther}。`,
      }
    case 'timeout':
      return { short: '看图调用超时', reason: `看图调用超时：模型 ${m} 在 ${formatLlmWait(timeoutMs || getLlmTimeoutMs())}内没有回复。`, fix: '稍后再试；或换一个响应更快的看图模型。' }
    case 'billing':
      return { short: '余额不足，没能看图', reason: `调用模型 ${m} 时提示余额不足或欠费${said}。`, fix: '到模型服务商那里充值后再试。' }
    case 'auth':
      return { short: '看图接口的密钥无效', reason: `接口拒绝了 API Key${said}。`, fix: '到「设置 · 模型与密钥」核对 API Key（单独设置了看图模型的，核对看图模型的密钥）。' }
    case 'model-missing':
      return { short: `接口里没有模型 ${m}`, reason: `接口找不到模型 ${m}${said}。`, fix: '核对模型 ID 的拼写；单独设置看图模型时，确认这个接口里有这个模型。' }
    case 'rate-limit':
      return { short: '看图接口限流', reason: `接口提示请求太频繁或额度用完${said}。`, fix: '稍等一会儿再试，或换一个看图模型。' }
    case 'network':
      return { short: '连不上看图接口', reason: `连不上模型接口${detail ? `（${detail}）` : ''}。`, fix: '检查网络 / 代理，以及接口地址是否填对。' }
    case 'server':
      return { short: '看图接口暂时故障', reason: `模型接口返回了服务器错误${said}。`, fix: '稍后再试。' }
    case 'empty':
      return { short: '看图没有返回内容', reason: `模型 ${m} 没有返回任何内容${said}。`, fix: '再试一次；问题持续就换一个看图模型。' }
    case 'bad-json':
      return { short: '看图结果无法解析', reason: `模型 ${m} 看了图，但回复不是要求的 JSON 格式${detail ? `（回复开头：${detail}）` : ''}。`, fix: '再试一次；问题持续就换一个指令遵循更好的看图模型。' }
    case 'bad-request':
      return { short: '看图请求被拒绝', reason: `接口拒绝了带图片的请求${said}。`, fix: `检查协议类型是否选对；如果模型不能看图，${pickOther}。` }
    case 'aborted':
      return { short: '已取消', reason: '看图调用被取消了。', fix: '' }
    default:
      return { short: '看图调用失败', reason: `看图调用失败${detail ? `：${detail}` : ''}。`, fix: `再试一次；也可以到${VISION_SETTINGS_PLACE}点「检测看图能力」查看具体原因。` }
  }
}

/** What the panels show about 看图: settings (no secrets) + the remembered / declared / chosen capability in words. */
function summarizeVision(mainCfg) {
  try {
    const s = getVisionSettings()
    const t = resolveVisionLlmConfig({}, { main: mainCfg, settings: s })
    const cached = t.configured && s.support === 'auto' ? getCachedVisionCapability(t.cacheKey) : null
    let status = 'unknown'
    let code = 'unknown'
    if (!t.configured) code = 'not-configured'
    else if (t.hostAgent && s.support !== 'no') {
      status = 'supported'
      code = 'host-agent'
    } else if (s.support === 'yes') {
      status = 'supported'
      code = 'user-on'
    } else if (s.support === 'no') {
      status = 'unsupported'
      code = 'user-off'
    } else if (cached) {
      status = cached.status
      code = cached.status === 'supported' ? 'supported' : cached.code
    } else if (t.declared === 'text') {
      status = 'unsupported'
      code = 'declared-text'
    } else if (t.declared === 'image') code = 'declared-image'
    return {
      support: s.support,
      dedicated: t.dedicated,
      ownEndpoint: t.ownEndpoint,
      model: t.model,
      settingsModel: s.model,
      baseUrl: s.baseUrl,
      format: s.format,
      provider: s.provider,
      hasApiKey: Boolean(s.apiKey),
      maskedApiKey: maskSecretKey(s.apiKey),
      protocol: t.protocol,
      configured: t.configured,
      hostAgent: Boolean(t.hostAgent),
      declared: t.declared,
      status,
      code,
      ...describeVisionStatus(code, { model: t.model, detail: cached?.detail, answer: cached?.answer, checkedAt: cached?.checkedAt }),
      checkedAt: cached?.checkedAt || '',
      source: cached?.source || '',
    }
  } catch {
    return { support: 'auto', status: 'unknown', code: 'unknown', short: '', reason: '', fix: '' }
  }
}

export function detectWireProtocol(cfg) {
  const fmt = normalizeProtocolFormat(cfg.format)
  if (
    fmt === 'anthropic-messages' ||
    fmt === 'openai-completions' ||
    fmt === 'openai-responses' ||
    fmt === 'gemini-native'
  ) {
    return fmt
  }
  const url = String(cfg.baseUrl || '').toLowerCase()
  const model = String(cfg.model || '').toLowerCase()
  if (url.includes('generativelanguage.googleapis.com') && !url.includes('/openai')) {
    return 'gemini-native'
  }
  if (/\/responses$/.test(url)) return 'openai-responses'
  if (url.includes('anthropic.com') || /\/v\d+\/messages$/.test(url)) return 'anthropic-messages'
  if (/\/chat\/completions$/.test(url)) return 'openai-completions'
  if (cfg.provider === 'gemini') return 'gemini-native'
  if (cfg.provider === 'anthropic' && !url.includes('openrouter')) return 'anthropic-messages'
  if (model.includes('codex')) return 'openai-responses'
  return 'openai-completions'
}

export function buildChatEndpoint(baseUrl, protocol, model = '') {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) throw new Error('未填写 LLM Base URL，请先在「模型设置」选择 DSH 通道或自定义填入 API 地址。')

  if (protocol === 'anthropic-messages' || protocol === 'anthropic') {
    if (/\/v\d+\/messages$/i.test(clean)) return clean
    if (/\/v\d+$/i.test(clean)) return `${clean}/messages`
    return `${clean}/v1/messages`
  }

  if (protocol === 'openai-responses') {
    if (/\/responses$/i.test(clean)) return clean
    if (/\/chat\/completions$/i.test(clean)) return clean.replace(/\/chat\/completions$/i, '/responses')
    if (/\/v\d+(\/.*)?$/i.test(clean)) return `${clean}/responses`
    return `${clean}/v1/responses`
  }

  if (protocol === 'gemini-native') {
    if (/\/models\/[^/]+:(generateContent|streamGenerateContent)$/i.test(clean)) return clean
    const cleanRoot = clean.replace(/\/(models|openai)$/i, '')
    const mName = encodeURIComponent(String(model || 'gemini-2.5-flash').replace(/^models\//, ''))
    if (/\/v1beta$|\/v1$/i.test(cleanRoot)) {
      return `${cleanRoot}/models/${mName}:generateContent`
    }
    return `${cleanRoot}/v1beta/models/${mName}:generateContent`
  }

  // Default: openai-completions
  if (/\/chat\/completions$/i.test(clean)) return clean
  if (/\/responses$/i.test(clean)) return clean.replace(/\/responses$/i, '/chat/completions')
  if (/\/v\d+(\/.*)?$/i.test(clean)) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}

function buildModelsEndpoint(baseUrl, protocol) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) return ''
  if (protocol === 'gemini-native') {
    const cleanRoot = clean
      .replace(/\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, '')
      .replace(/\/(models|openai)$/i, '')
    if (/\/v1beta$|\/v1$/i.test(cleanRoot)) return `${cleanRoot}/models`
    return `${cleanRoot}/v1beta/models`
  }
  const root = clean.replace(/\/(chat\/completions|responses|messages)$/i, '')
  if (/\/v\d+(\/openai)?$/i.test(root)) return `${root}/models`
  return `${root}/v1/models`
}

function extractFirstJsonObject(rawText) {
  const s = String(rawText || '').trimStart()
  if (!s.startsWith('{')) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(0, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Raw stop / finish reason of a complete reply object (any of the 4 wire protocols; relays sometimes mix them):
 * openai chat `choices[0].finish_reason`, anthropic `stop_reason`, openai responses `incomplete_details.reason` /
 * `status`, gemini `candidates[0].finishReason`. '' when the reply does not say.
 */
function finishReasonOf(data) {
  if (!data || typeof data !== 'object') return ''
  const chat = data?.choices?.[0]?.finish_reason
  if (typeof chat === 'string' && chat) return chat
  if (typeof data.stop_reason === 'string' && data.stop_reason) return data.stop_reason
  const gem = data?.candidates?.[0]?.finishReason
  if (typeof gem === 'string' && gem) return gem
  if (data.object === 'response' || typeof data.status === 'string') {
    const why = data?.incomplete_details?.reason
    if (data.status === 'incomplete') return typeof why === 'string' && why ? why : 'incomplete'
    if (typeof data.status === 'string' && data.status) return data.status
  }
  return ''
}

/** True when a reply stopped because it hit the output limit (the text is cut off mid-way). */
export function isCutOffFinishReason(reason) {
  return /^(length|max_tokens|max_output_tokens|MAX_TOKENS|model_context_window_exceeded|incomplete)$/i.test(String(reason || '').trim())
}

function parseRawLlmResponse(rawText, protocol) {
  const trimmed = String(rawText || '').trim()
  if (!trimmed) return { data: null, text: '', streamError: '', finishReason: '' }

  // 1. Standard pure JSON response
  try {
    const data = JSON.parse(trimmed)
    return {
      data,
      text: extractTextFromReply(data, protocol),
      streamError: data?.error?.message || '',
      finishReason: finishReasonOf(data),
    }
  } catch {}

  // 2. Leading JSON object before trailing proxy SSE lines (e.g. `{...}event: response.failed`)
  const leadingObj = extractFirstJsonObject(trimmed)
  if (leadingObj) {
    const leadingText = extractTextFromReply(leadingObj, protocol)
    if (leadingText.trim()) {
      return {
        data: leadingObj,
        text: leadingText,
        streamError: '',
        finishReason: finishReasonOf(leadingObj),
      }
    }
  }

  // 3. Server-Sent Events (SSE: `data: {...}`) across all 4 wire protocols
  const deltas = []
  let completedData = leadingObj
  let streamError = ''
  let geminiLastText = ''
  // the stop reason arrives in its own event (openai chat: last chunk, anthropic: message_delta, gemini: last chunk)
  let streamFinish = ''
  // token usage sent in its own events (anthropic: message_start input + message_delta output, gemini: last chunk)
  let streamUsage = null

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) continue
    const payloadStr = line.slice(5).trim()
    if (!payloadStr || payloadStr === '[DONE]') continue
    let ev = null
    try {
      ev = JSON.parse(payloadStr)
    } catch {
      continue
    }
    if (!ev || typeof ev !== 'object') continue
    {
      const chatFinish = ev?.choices?.[0]?.finish_reason
      const anthropicFinish = ev.type === 'message_delta' ? ev?.delta?.stop_reason : ev.type === 'message_start' ? ev?.message?.stop_reason : ''
      const geminiFinish = ev?.candidates?.[0]?.finishReason
      const f = [chatFinish, anthropicFinish, geminiFinish].find((x) => typeof x === 'string' && x)
      if (f) streamFinish = f
      if (ev.type === 'message_start' && ev.message?.usage && typeof ev.message.usage === 'object') streamUsage = { ...(streamUsage || {}), ...ev.message.usage }
      else if (ev.type === 'message_delta' && ev.usage && typeof ev.usage === 'object') streamUsage = { ...(streamUsage || {}), ...ev.usage }
      else if (ev.usageMetadata && typeof ev.usageMetadata === 'object') streamUsage = ev.usageMetadata
    }

    if (protocol === 'openai-responses') {
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
        deltas.push(ev.delta)
      } else if (ev.type === 'response.output_text.done' && typeof ev.text === 'string' && deltas.length === 0) {
        deltas.push(ev.text)
      } else if ((ev.type === 'response.completed' || ev.type === 'response.incomplete') && ev.response) {
        completedData = ev.response
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        streamError = ev?.response?.error?.message || ev?.error?.message || ev?.message || streamError
      } else if (ev.object === 'response' && Array.isArray(ev.output)) {
        completedData = ev
      }
    } else if (protocol === 'anthropic-messages') {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
        deltas.push(ev.delta.text)
      } else if (ev.type === 'message' && Array.isArray(ev.content)) {
        completedData = ev
      } else if (ev.type === 'error') {
        streamError = ev?.error?.message || ev?.message || streamError
      }
    } else if (protocol === 'gemini-native') {
      const partText = extractTextFromReply(ev, 'gemini-native')
      if (partText) {
        geminiLastText += partText
        completedData = ev
      }
      if (ev.error?.message) streamError = ev.error.message
    } else {
      if (Array.isArray(ev.choices)) {
        const d = ev.choices[0]?.delta?.content
        if (typeof d === 'string') deltas.push(d)
        else if (typeof ev.choices[0]?.message?.content === 'string') completedData = ev
      }
      if (ev.usage || ev.model) completedData = { ...(completedData || {}), ...ev }
      if (ev.error?.message) streamError = ev.error.message
    }
  }

  const completedText = completedData ? extractTextFromReply(completedData, protocol) : ''
  const finalText = completedText.trim()
    ? completedText
    : deltas.length > 0
      ? deltas.join('')
      : geminiLastText

  return {
    data: completedData,
    text: finalText,
    streamError,
    finishReason: streamFinish || finishReasonOf(completedData),
    usage: streamUsage,
  }
}

function extractTextFromReply(data, protocol) {
  if (!data || typeof data !== 'object') return ''

  if (protocol === 'anthropic-messages' || protocol === 'anthropic') {
    if (Array.isArray(data.content)) {
      return data.content
        .filter((b) => b?.type === 'text' && b.text)
        .map((b) => b.text)
        .join('\n')
    }
    if (typeof data.completion === 'string') return data.completion
    return ''
  }

  if (protocol === 'openai-responses') {
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text
    }
    if (Array.isArray(data.output)) {
      const chunks = []
      for (const item of data.output) {
        if (!item) continue
        if (typeof item.text === 'string') chunks.push(item.text)
        if (Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part?.text && (!part.type || part.type === 'output_text' || part.type === 'text')) {
              chunks.push(part.text)
            }
          }
        }
      }
      if (chunks.length > 0) return chunks.join('\n')
    }
    // Some relays echo choices even on responses
    if (typeof data?.choices?.[0]?.message?.content === 'string') {
      return data.choices[0].message.content
    }
    return ''
  }

  if (protocol === 'gemini-native') {
    const parts = data?.candidates?.[0]?.content?.parts
    if (Array.isArray(parts)) {
      return parts
        .filter((p) => !p?.thought && typeof p?.text === 'string')
        .map((p) => p.text)
        .join('\n')
    }
    return ''
  }

  // openai-completions
  const choice = data?.choices?.[0]
  if (typeof choice?.message?.content === 'string') return choice.message.content
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.map((c) => c?.text || '').join('\n')
  }
  if (typeof data?.output_text === 'string') return data.output_text
  return ''
}

async function readResponseTextSafe(res) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const chunks = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(decoder.decode(value, { stream: true }))
    }
    const tail = decoder.decode()
    if (tail) chunks.push(tail)
    return chunks.join('')
  }
  return await res.text()
}

/** Milliseconds a server asked us to wait (`retry-after-ms`, `Retry-After` seconds or HTTP date), 0 when absent. */
export function parseRetryAfterMs(res) {
  try {
    const h = res?.headers
    const get = (k) => {
      if (!h) return ''
      if (typeof h.get === 'function') return h.get(k) || ''
      return h[k] || h[String(k).toLowerCase()] || ''
    }
    const ms = Number(get('retry-after-ms'))
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms)
    const raw = String(get('retry-after') || '').trim()
    if (!raw) return 0
    const sec = Number(raw)
    if (Number.isFinite(sec) && sec >= 0) return Math.round(sec * 1000)
    const at = Date.parse(raw)
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0
  } catch {
    return 0
  }
}

function isTransientLlmError(err, status = 0, timeoutMs = 0) {
  // Balance / quota failures (402, OpenAI 429 insufficient_quota, "余额不足" ...) are never retried
  // (the HTTP status is part of the error message: "返回错误 (402): ...")
  if (isBillingError(err)) return false
  if ([429, 502, 503, 504, 524].includes(status)) return true
  const msg = String(err?.message || err || '').toLowerCase()
  const code = String(err?.code || err?.cause?.code || '').toLowerCase()
  // Do not amplify long (>2m) client request timeouts with 3x inner retries
  const allowTimeoutRetry = msg.includes('超时') && Number(timeoutMs) > 0 && Number(timeoutMs) <= 120_000
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('other side closed') ||
    msg.includes('terminated') ||
    allowTimeoutRetry ||
    code.includes('econnreset') ||
    code.includes('etimedout') ||
    code.includes('und_err')
  )
}

function guessImageMime(url) {
  const ext = /\.([a-z0-9]{3,4})(?:[?#]|$)/i.exec(String(url || ''))?.[1]?.toLowerCase() || ''
  return { png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' }[ext] || 'image/jpeg'
}

/** A short job label for the agent: the caller's, else the first meaningful line of the system prompt. */
function hostTaskPurpose(purpose, system) {
  const given = String(purpose || '').trim()
  if (given) return given.slice(0, 80)
  const first = String(system || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 4)
  return first ? first.replace(/^#+\s*/, '').slice(0, 80) : '插件写作任务'
}

/**
 * 宿主智能体代写: queue the request for the agent that hosts the plugin and wait for its answer (see host-llm-bridge.js).
 * Same result shape as a model call. The agent gets the longer of the call's limit and the host-agent limit.
 */
async function callHostAgent({ cfg, system, messages, temperature, maxTokens, timeoutMs, signal, onWait, waitTickMs, responseFormat, purpose }) {
  const limit = Math.max(Number(timeoutMs) || 0, getHostAgentTimeoutMs())
  const startedAt = Date.now()
  const beat =
    typeof onWait === 'function'
      ? setInterval(() => {
          try {
            onWait({ elapsedMs: Date.now() - startedAt, timeoutMs: limit, attempt: 1, hostAgent: true })
          } catch {}
        }, Math.max(250, Number(waitTickMs) || 15000))
      : 0
  try {
    const res = await requestHostCompletion({
      system,
      messages,
      purpose: hostTaskPurpose(purpose, system),
      maxTokens: Number(maxTokens) > 0 ? Number(maxTokens) : cfg.maxTokens,
      temperature,
      wantJson: String(responseFormat || '').toLowerCase() === 'json',
      timeoutMs: limit,
      signal,
    })
    if (!String(res.text || '').trim()) throw new Error('智能体交回的回答是空的，请在智能体对话里让它重新完成这个写作任务。')
    return { ok: true, protocol: HOST_AGENT_MODE, endpoint: '', model: res.model, text: res.text, usage: null, hostTaskId: res.hostTaskId }
  } finally {
    if (beat) clearInterval(beat)
  }
}

/**
 * Call any configured LLM across all 4 wire protocols:
 * - openai-completions (/v1/chat/completions)
 * - anthropic-messages (/v1/messages)
 * - openai-responses (/v1/responses)
 * - gemini-native (/v1beta/models)
 * Includes incremental stream reading + transient relay/network retries.
 * `timeoutMs` defaults to the shared limit (getLlmTimeoutMs(), 10 minutes); `onWait({ elapsedMs, timeoutMs, attempt })`
 * is called every `waitTickMs` while the model is still working, so long waits can show elapsed time.
 */
/* ---------------------------------------------------------------------------------------- 大模型用量 (token usage) */

/**
 * One reply's token usage as { input, output, cached } from any of the 4 wire protocols (openai chat: prompt_tokens /
 * completion_tokens; openai responses: input_tokens / output_tokens; anthropic: input_tokens + cache tokens /
 * output_tokens; gemini: promptTokenCount / candidatesTokenCount + thoughtsTokenCount). null when the provider sent none.
 */
export function normalizeLlmUsage(raw) {
  if (!raw || typeof raw !== 'object') return null
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0)
  const has = (...keys) => keys.some((k) => raw[k] !== undefined && raw[k] !== null)
  if (!has('prompt_tokens', 'completion_tokens', 'input_tokens', 'output_tokens', 'promptTokenCount', 'candidatesTokenCount', 'totalTokenCount')) return null
  let input
  let cached
  if (has('cache_read_input_tokens', 'cache_creation_input_tokens')) {
    // anthropic: input_tokens excludes the cached part
    input = n(raw.input_tokens) + n(raw.cache_read_input_tokens) + n(raw.cache_creation_input_tokens)
    cached = n(raw.cache_read_input_tokens)
  } else {
    input = n(raw.prompt_tokens ?? raw.input_tokens ?? raw.promptTokenCount)
    cached = n(raw.prompt_tokens_details?.cached_tokens ?? raw.input_tokens_details?.cached_tokens ?? raw.cachedContentTokenCount)
  }
  const output = n(raw.completion_tokens ?? raw.output_tokens ?? raw.candidatesTokenCount) + n(raw.thoughtsTokenCount)
  if (!input && !output && n(raw.totalTokenCount)) return { input: n(raw.totalTokenCount), output: 0, cached: 0 }
  return { input, output, cached }
}

const llmUsageScope = new AsyncLocalStorage()

/**
 * A usage ledger for one run (pipeline, AI 编码出片 …): every callLlmChat made inside runWithLlmUsage() — awaits and
 * parallel calls included — adds its calls, tokens and pictures, grouped by the call's `purpose` (else the ledger's
 * current `stage` label). `summary()` is plain data for logs / output/llm-usage.json.
 */
export function createLlmUsageLedger() {
  const groups = new Map()
  const total = { calls: 0, counted: 0, input: 0, output: 0, cached: 0, images: 0, hostTasks: 0 }
  const ledger = {
    stage: '',
    record({ purpose = '', usage = null, images = 0, host = false } = {}) {
      const label = String(purpose || ledger.stage || '其它').slice(0, 24)
      const g = groups.get(label) || { label, calls: 0, counted: 0, input: 0, output: 0, cached: 0, images: 0, hostTasks: 0 }
      for (const t of [g, total]) {
        t.calls++
        t.images += Math.max(0, Number(images) || 0)
        if (host) t.hostTasks++
        else if (usage) {
          t.counted++
          t.input += usage.input
          t.output += usage.output
          t.cached += usage.cached
        }
      }
      groups.set(label, g)
    },
    summary() {
      return { ...total, uncounted: total.calls - total.counted - total.hostTasks, groups: [...groups.values()].sort((a, b) => b.input + b.output - (a.input + a.output)).map((g) => ({ ...g })) }
    },
  }
  return ledger
}

/** Run `fn` with `ledger` collecting the token usage of every model call inside it. */
export function runWithLlmUsage(ledger, fn) {
  return llmUsageScope.run(ledger, fn)
}

/** The ledger of the run this code is part of (null outside runWithLlmUsage). */
export function currentLlmUsageLedger() {
  return llmUsageScope.getStore() || null
}

function recordLlmUsage(entry) {
  try {
    llmUsageScope.getStore()?.record(entry)
  } catch {}
}

/** 「1.2 万」 style token count. */
function fmtTokens(n) {
  const v = Number(n) || 0
  return v >= 10000 ? `${(v / 10000).toFixed(v >= 1e6 ? 0 : 1)} 万` : String(v)
}

/** Plain-Chinese usage lines for the task log (empty when nothing was called). */
export function formatLlmUsageSummary(s) {
  if (!s || !s.calls) return []
  const lines = []
  const tok = (g) => `输入 ${fmtTokens(g.input)} tokens${g.images ? `（含 ${g.images} 张图片）` : ''}、输出 ${fmtTokens(g.output)} tokens`
  const host = s.hostTasks ? `；其中 ${s.hostTasks} 次由智能体代写，用的是智能体自己的额度，不计在内` : ''
  const blind = s.uncounted > 0 ? `；${s.uncounted} 次接口没有返回用量，未计入` : ''
  lines.push(`💰 本次大模型用量：调用 ${s.calls} 次，${tok(s)}${host}${blind}。实际费用请以模型平台的账单为准。`)
  const parts = (s.groups || []).filter((g) => g.counted > 0).slice(0, 8).map((g) => `${g.label} ${g.calls} 次（${tok(g)}）`)
  if (parts.length > 1) lines.push(`   · 分项：${parts.join('；')}`)
  return lines
}

export async function callLlmChat({
  onRetry,
  onWait,
  waitTickMs = 15000,
  messages = [],
  system = '',
  temperature,
  maxTokens,
  timeoutMs: timeoutOpt,
  overrideConfig = {},
  fetchImpl = globalThis.fetch,
  signal,
  // 'json' when the caller needs a JSON reply
  responseFormat,
  // short label of the job (shown to the agent in 宿主智能体代写 mode); derived from the system prompt when absent
  purpose = '',
} = {}) {
  const timeoutMs = Number(timeoutOpt) > 0 ? Number(timeoutOpt) : getLlmTimeoutMs()
  const cfg = resolveLlmConfig(overrideConfig)
  // pictures sent with this call (counted in the run's 大模型用量)
  const imageCount = (Array.isArray(messages) ? messages : []).reduce((a, m) => a + (Array.isArray(m?.content) ? m.content.filter((p) => p && (p.type === 'image' || p.type === 'image_url')).length : 0), 0)
  if (cfg.mode === HOST_AGENT_MODE) {
    const hostRes = await callHostAgent({ cfg, system, messages, temperature, maxTokens, timeoutMs, signal, onWait, waitTickMs, responseFormat, purpose })
    recordLlmUsage({ purpose, host: true, images: imageCount })
    return hostRes
  }
  if (!cfg.baseUrl) {
    throw new Error('尚未配置大模型接口地址 (Base URL)。点击右上角「模型设置」可一键跟随 DSH 客户端或填写自定义网关。')
  }
  if (!cfg.model) {
    throw new Error('尚未指定模型名称 (例如 claude-opus-5-5 / gpt-6.1-sol / deepseek-chat / gemini-2.5-pro)。')
  }
  const requiresKey = cfg.provider !== 'ollama' && !/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/i.test(cfg.baseUrl)
  if (requiresKey && !cfg.apiKey) {
    throw new Error('尚未找到可用 API Key：请在「模型设置」开启跟随 DSH 客户端或填入插件专属密钥。')
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 运行时缺少 fetch API。')
  }

  const protocol = detectWireProtocol(cfg)
  const endpoint = buildChatEndpoint(cfg.baseUrl, protocol, cfg.model)
  const temp = Number.isFinite(Number(temperature)) ? Number(temperature) : cfg.temperature
  const maxOut = Number(maxTokens) > 0 ? Number(maxTokens) : cfg.maxTokens

  let headers
  let payload
  const sysParts = [system, ...messages.filter((m) => m?.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : ''))]
    .filter(Boolean)
    .join('\n\n')
  const normalizeMsgParts = (rawContent) => {
    if (Array.isArray(rawContent)) {
      const parts = []
      for (const item of rawContent) {
        if (!item) continue
        if (typeof item === 'string') {
          if (item) parts.push({ type: 'text', text: item })
        } else if (item.type === 'text' && item.text) {
          parts.push({ type: 'text', text: String(item.text) })
        } else if (item.type === 'image' && item.base64) {
          parts.push({
            type: 'image',
            mimeType: String(item.mimeType || 'image/jpeg'),
            base64: String(item.base64).replace(/^data:.*?;base64,/, ''),
          })
        } else if (item.type === 'image_url' && item.image_url?.url) {
          const urlStr = String(item.image_url.url)
          const dm = /^data:([^;]+);base64,(.+)$/i.exec(urlStr)
          if (dm) {
            parts.push({ type: 'image', mimeType: dm[1], base64: dm[2] })
          } else {
            parts.push({ type: 'image_url', url: urlStr })
          }
        }
      }
      return parts
    }
    const text = String(rawContent || '')
    return text ? [{ type: 'text', text }] : []
  }

  const chatMsgs = messages
    .filter((m) => m && m.role !== 'system' && m.content)
    .map((m) => {
      const role = m.role === 'assistant' ? 'assistant' : 'user'
      const parts = normalizeMsgParts(m.content)
      const isPlainText = parts.every((p) => p.type === 'text')
      return {
        role,
        parts,
        textOnly: isPlainText ? parts.map((p) => p.text).join('\n') : null,
      }
    })
    .filter((m) => m.parts.length > 0)

  if (protocol === 'anthropic-messages') {
    headers = {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    }
    payload = {
      model: cfg.model,
      max_tokens: maxOut,
      temperature: temp,
      ...(sysParts ? { system: sysParts } : {}),
      messages: chatMsgs.map((m) => ({
        role: m.role,
        content:
          m.textOnly !== null
            ? m.textOnly
            : m.parts.map((p) =>
                p.type === 'image'
                  ? { type: 'image', source: { type: 'base64', media_type: p.mimeType, data: p.base64 } }
                  : p.type === 'image_url'
                    ? { type: 'image', source: { type: 'url', url: p.url } }
                    : { type: 'text', text: p.text || '' },
              ),
      })),
    }
  } else if (protocol === 'openai-responses') {
    headers = {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    }
    payload = {
      model: cfg.model,
      stream: true,
      ...(sysParts ? { instructions: sysParts } : {}),
      input: chatMsgs.map((m) => ({
        type: 'message',
        role: m.role,
        content: m.parts.map((p) =>
          p.type === 'image'
            ? { type: 'input_image', image_url: `data:${p.mimeType};base64,${p.base64}` }
            : p.type === 'image_url'
              ? { type: 'input_image', image_url: p.url }
              : { type: m.role === 'assistant' ? 'output_text' : 'input_text', text: p.text || '' },
        ),
      })),
      max_output_tokens: maxOut,
    }
  } else if (protocol === 'gemini-native') {
    headers = {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { 'x-goog-api-key': cfg.apiKey } : {}),
    }
    payload = {
      ...(sysParts ? { systemInstruction: { parts: [{ text: sysParts }] } } : {}),
      // inlineData / mimeType (camelCase): Google's REST API also accepts inline_data, but relays that re-encode Gemini
      // requests through typed structs usually only read the camelCase form
      contents: chatMsgs.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.parts.map((p) =>
          p.type === 'image'
            ? { inlineData: { mimeType: p.mimeType, data: p.base64 } }
            : p.type === 'image_url'
              ? { fileData: { mimeType: guessImageMime(p.url), fileUri: p.url } }
              : { text: p.text || '' },
        ),
      })),
      generationConfig: {
        temperature: temp,
        maxOutputTokens: maxOut,
      },
    }
  } else {
    headers = {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    }
    const normMsgs = []
    if (sysParts) normMsgs.push({ role: 'system', content: sysParts })
    for (const m of chatMsgs) {
      normMsgs.push({
        role: m.role,
        content:
          m.textOnly !== null
            ? m.textOnly
            : m.parts.map((p) =>
                p.type === 'image'
                  ? { type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.base64}` } }
                  : p.type === 'image_url'
                    ? { type: 'image_url', image_url: { url: p.url } }
                    : { type: 'text', text: p.text || '' },
              ),
      })
    }
    payload = {
      model: cfg.model,
      messages: normMsgs,
      temperature: temp,
      max_tokens: maxOut,
    }
  }

  // JSON mode when the caller needs a JSON reply: openai chat `response_format`, openai responses `text.format`, gemini
  // `responseMimeType` (anthropic has no JSON mode). A provider / relay that rejects the field with a 400 is asked once
  // more without it (see the retry below).
  let jsonModeField = ''
  if (String(responseFormat || '').trim().toLowerCase() === 'json') {
    if (protocol === 'openai-responses') {
      payload.text = { ...(payload.text && typeof payload.text === 'object' ? payload.text : {}), format: { type: 'json_object' } }
      jsonModeField = 'text.format'
    } else if (protocol === 'gemini-native') {
      payload.generationConfig = { ...(payload.generationConfig || {}), responseMimeType: 'application/json' }
      jsonModeField = 'responseMimeType'
    } else if (protocol !== 'anthropic-messages') {
      payload.response_format = { type: 'json_object' }
      jsonModeField = 'response_format'
    }
  }
  const dropJsonMode = () => {
    if (jsonModeField === 'text.format') {
      if (payload.text && typeof payload.text === 'object') delete payload.text.format
      if (payload.text && !Object.keys(payload.text).length) delete payload.text
    } else if (jsonModeField === 'responseMimeType') {
      if (payload.generationConfig) delete payload.generationConfig.responseMimeType
    } else if (jsonModeField === 'response_format') {
      delete payload.response_format
    }
    jsonModeField = ''
  }

  const realNetwork = fetchImpl === globalThis.fetch
  const maxAttempts = realNetwork ? 3 : 2
  const baseBackoffMs = realNetwork ? 1500 : 30
  // Genuine rate limits (HTTP 429 that is not a balance / quota error): honour Retry-After (capped), otherwise back off
  // 5 → 10 → 20 → 30 s, within a total wait budget per call. Relays commonly limit per minute, so 1.5 s + 3 s was
  // never enough and a whole storyboard fell back to the rule engine.
  const RATE_BACKOFF_MS = realNetwork ? [5000, 10000, 20000, 30000, 30000] : [30, 30]
  const RATE_MAX_RETRIES = realNetwork ? 5 : 1
  const RATE_WAIT_BUDGET_MS = realNetwork ? 90_000 : 1000
  const RATE_MIN_WAIT_MS = realNetwork ? 2000 : 0
  const RATE_MAX_WAIT_MS = realNetwork ? 60_000 : 60
  let lastErr = null
  let transientRetries = 0
  let rateRetries = 0
  let rateWaitedMs = 0
  const abortErr = () => signal?.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' })
  const sleepAbortable = (ms) =>
    new Promise((resolveSleep, rejectSleep) => {
      if (signal?.aborted) return rejectSleep(abortErr())
      const onAbortSleep = () => {
        clearTimeout(t)
        rejectSleep(abortErr())
      }
      const t = setTimeout(() => {
        signal?.removeEventListener?.('abort', onAbortSleep)
        resolveSleep()
      }, Math.max(0, ms))
      signal?.addEventListener?.('abort', onAbortSleep, { once: true })
    })
  // decide whether (and how long) to wait before the next attempt; null = give up
  const planRetry = (err, status, res, tmo = 0) => {
    if (status === 429 && !isBillingError(err)) {
      const hinted = parseRetryAfterMs(res)
      const backoff = RATE_BACKOFF_MS[Math.min(rateRetries, RATE_BACKOFF_MS.length - 1)]
      const waitMs = Math.max(RATE_MIN_WAIT_MS, Math.min(RATE_MAX_WAIT_MS, hinted || backoff))
      if (rateRetries < RATE_MAX_RETRIES && rateWaitedMs + waitMs <= RATE_WAIT_BUDGET_MS) {
        rateRetries++
        rateWaitedMs += waitMs
        return { waitMs, reason: 'rate-limit' }
      }
      return null
    }
    if (transientRetries < maxAttempts - 1 && isTransientLlmError(err, status, tmo)) {
      transientRetries++
      const hinted = status === 503 ? Math.min(realNetwork ? 30_000 : 60, parseRetryAfterMs(res)) : 0
      return { waitMs: Math.max(baseBackoffMs * transientRetries, hinted), reason: 'transient' }
    }
    return null
  }
  const waitBeforeRetry = async (plan, attemptNo, status, err) => {
    try {
      onRetry?.({ attempt: attemptNo, waitMs: plan.waitMs, status, reason: plan.reason, message: String(err?.message || err || '').slice(0, 300) })
    } catch {}
    await sleepAbortable(plan.waitMs)
  }

  const startedAt = Date.now()
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) {
      throw signal.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' })
    }
    const controller = new AbortController()
    const onExternalAbort = () => controller.abort(signal?.reason || Object.assign(new Error('Request aborted'), { name: 'AbortError' }))
    if (signal) {
      if (signal.aborted) onExternalAbort()
      else signal.addEventListener('abort', onExternalAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error(llmTimeoutMessage(timeoutMs))), timeoutMs)
    // heartbeat while the model works, so a long wait can show elapsed time instead of looking frozen
    const beat =
      typeof onWait === 'function'
        ? setInterval(() => {
            try {
              onWait({ elapsedMs: Date.now() - startedAt, timeoutMs, attempt })
            } catch {}
          }, Math.max(250, Number(waitTickMs) || 15000))
        : 0
    let resStatus = 0

    try {
      const bodyStr = JSON.stringify(payload)
      const res =
        timeoutMs > 240_000 && isBuiltinFetch(fetchImpl)
          ? await postJsonLongTimeout(endpoint, headers, bodyStr, timeoutMs, controller.signal)
          : await fetchImpl(endpoint, {
              method: 'POST',
              headers,
              body: bodyStr,
              signal: controller.signal,
            })
      resStatus = res.status || 0
      const rawText = await readResponseTextSafe(res)
      const parsed = parseRawLlmResponse(rawText, protocol)
      const data = parsed.data

      if (!res.ok) {
        const msg =
          data?.error?.message ||
          parsed.streamError ||
          data?.message ||
          rawText.slice(0, 300) ||
          `HTTP ${res.status}`
        const httpErr = new Error(`大模型接口 (${protocol}) 返回错误 (${res.status}): ${msg}`)
        httpErr.status = res.status
        // a provider / relay without JSON mode: ask once more without the field (not counted as a retry)
        if (res.status === 400 && jsonModeField && /response_format|json_object|text\.format|responsemimetype|response_mime_type|mime.?type/i.test(String(msg))) {
          dropJsonMode()
          lastErr = httpErr
          continue
        }
        const plan = planRetry(httpErr, resStatus, res)
        if (plan) {
          lastErr = httpErr
          await waitBeforeRetry(plan, attempt, resStatus, httpErr)
          continue
        }
        httpErr.retryDecided = true
        throw httpErr
      }

      const text = parsed.text || ''
      if (!text.trim()) {
        const emptyErr = parsed.streamError
          ? new Error(`大模型接口 (${protocol}) 返回错误: ${parsed.streamError}`)
          : new Error('大模型返回内容为空，请检查模型 ID、协议类型或额度限制。')
        const plan = parsed.streamError ? planRetry(emptyErr, resStatus, res) : null
        if (plan) {
          lastErr = emptyErr
          await waitBeforeRetry(plan, attempt, resStatus, emptyErr)
          continue
        }
        emptyErr.retryDecided = true
        throw emptyErr
      }

      const usage = data?.usage || data?.usageMetadata || parsed.usage || null
      recordLlmUsage({ purpose, usage: normalizeLlmUsage(usage), images: imageCount })
      return {
        ok: true,
        protocol,
        endpoint,
        model: data?.model || cfg.model,
        text,
        usage,
        // raw stop reason of the provider and whether the reply was cut off by the output limit
        finishReason: parsed.finishReason || '',
        truncated: isCutOffFinishReason(parsed.finishReason),
      }
    } catch (err) {
      lastErr = err
      if (err?.name === 'AbortError' || signal?.aborted) throw err
      if (err?.retryDecided) throw err
      const plan = planRetry(err, resStatus, null, timeoutMs)
      if (plan) {
        await waitBeforeRetry(plan, attempt, resStatus, err)
        continue
      }
      throw err
    } finally {
      clearTimeout(timer)
      if (beat) clearInterval(beat)
      if (signal) signal.removeEventListener('abort', onExternalAbort)
    }
  }
  throw lastErr || new Error('LLM 请求失败')
}

export async function fetchAvailableModels(overrideConfig = {}, fetchImpl = globalThis.fetch) {
  const cfg = resolveLlmConfig(overrideConfig)
  if (cfg.mode === HOST_AGENT_MODE) return [] // the agent uses its own model: nothing to pick here
  const protocol = detectWireProtocol(cfg)
  const endpoint = buildModelsEndpoint(cfg.baseUrl, protocol)
  if (!endpoint || typeof fetchImpl !== 'function') return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    let headers = {}
    if (protocol === 'anthropic-messages') {
      headers = {
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      }
    } else if (protocol === 'gemini-native') {
      headers = cfg.apiKey ? { 'x-goog-api-key': cfg.apiKey } : {}
    } else {
      headers = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}
    }

    const res = await fetchImpl(endpoint, { method: 'GET', headers, signal: controller.signal })
    if (!res.ok) return []
    const json = await res.json()
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : []
    return list
      .map((item) => String(item?.id || item?.name || '').replace(/^models\//, '').trim())
      .filter(Boolean)
      .slice(0, 80)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function testLlmConnection(overrideConfig = {}, fetchImpl = globalThis.fetch) {
  const started = Date.now()
  const cfg = resolveLlmConfig(overrideConfig)
  if (cfg.mode === HOST_AGENT_MODE) {
    // nothing to dial: the writing tasks wait for the agent in the conversation, which answers with its own model
    let pending = 0
    try {
      pending = listHostTasks().length
    } catch {}
    const agent = cfg.host?.label || '当前智能体'
    return {
      ok: true,
      latencyMs: Date.now() - started,
      mode: HOST_AGENT_MODE,
      protocol: HOST_AGENT_MODE,
      model: HOST_AGENT_MODE,
      endpoint: '',
      replyPreview: '',
      availableModels: [],
      pendingTasks: pending,
      message: `已设为「智能体代写」：需要 AI 写作时，插件会把任务交给正在对话的${agent}，由它用自己的模型完成（不需要 API Key）。${pending ? `现在有 ${pending} 个任务在等它处理。` : ''}请在智能体的对话里让它处理视频插件的写作任务（工具 host_llm_task）。`,
    }
  }
  const models = await fetchAvailableModels(cfg, fetchImpl)
  const res = await callLlmChat({
    overrideConfig: cfg,
    fetchImpl,
    system: 'Reply strictly with OK.',
    messages: [{ role: 'user', content: 'Connection health check. Reply with OK.' }],
    temperature: 0,
    maxTokens: 32,
    // the same limit as real work: a slow (reasoning) model that would finish real tasks must not fail the test
    timeoutMs: getLlmTimeoutMs(),
  })
  return {
    ok: true,
    latencyMs: Date.now() - started,
    mode: cfg.mode,
    protocol: res.protocol,
    model: res.model,
    endpoint: res.endpoint,
    replyPreview: res.text.trim().slice(0, 80),
    availableModels: models,
  }
}

/**
 * Robustly extract a JSON object or array from an LLM reply (handling markdown fences & commentary).
 */
export function extractJsonFromLlmText(rawText) {
  const text = String(rawText || '').trim()
  if (!text) throw new Error('Empty LLM response')

  // 1. Direct JSON
  try {
    return JSON.parse(text)
  } catch {}

  // 2. ```json ... ``` fenced block
  const fenceMatches = [...text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)\n```/g)]
  for (const m of fenceMatches) {
    try {
      return JSON.parse(m[1].trim())
    } catch {}
  }

  // 3. Balanced top-level {...} scanner
  const firstBrace = text.indexOf('{')
  if (firstBrace >= 0) {
    let depth = 0
    let inStr = false
    let escape = false
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') {
        inStr = true
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(firstBrace, i + 1)
          try {
            return JSON.parse(candidate)
          } catch {}
          break
        }
      }
    }
  }

  throw new Error(`无法从模型回复中解析 JSON，请重试或换用指令遵循更强的模型。片段: ${text.slice(0, 180)}`)
}
