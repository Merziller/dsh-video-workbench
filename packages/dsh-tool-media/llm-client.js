import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadEnv, resolveEnvPath } from '@dsh-video/shared'

export const LLM_PROVIDER_TEMPLATES = {
  custom: {
    id: 'custom',
    label: '自定义任意模型接口 (OpenAI / Anthropic 兼容)',
    defaultFormat: 'auto',
    defaultBaseUrl: '',
    suggestedModels: [],
    requiresKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude (Opus / Sonnet)',
    defaultFormat: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    suggestedModels: ['claude-opus-4-6', 'claude-sonnet-4-6'],
    requiresKey: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI GPT 系列',
    defaultFormat: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    suggestedModels: ['gpt-5', 'gpt-4o'],
    requiresKey: true,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek 官方接口',
    defaultFormat: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter 多模型聚合网关',
    defaultFormat: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    suggestedModels: ['anthropic/claude-opus-4', 'openai/gpt-5', 'google/gemini-2.5-pro'],
    requiresKey: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (OpenAI 兼容接口)',
    defaultFormat: 'openai',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    requiresKey: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama / 本地大模型服务',
    defaultFormat: 'openai',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    suggestedModels: ['qwen2.5-coder:32b', 'deepseek-r1:32b'],
    requiresKey: false,
  },
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
  return `${key.slice(0, 6)}${'*'.repeat(Math.min(12, key.length - 10))}${key.slice(-4)}`
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
 * Resolve effective LLM configuration by merging `.env` defaults, persisted UI config, and per-call overrides.
 */
export function resolveLlmConfig(override = {}) {
  loadEnv()
  const fileCfg = readStoredConfigFile()
  const provider = String(
    override.provider ?? fileCfg.provider ?? process.env.LLM_PROVIDER ?? 'custom',
  ).trim() || 'custom'
  const template = LLM_PROVIDER_TEMPLATES[provider] || LLM_PROVIDER_TEMPLATES.custom

  const formatRaw = String(
    override.format ?? fileCfg.format ?? process.env.LLM_FORMAT ?? template.defaultFormat ?? 'auto',
  ).toLowerCase()
  const format = ['openai', 'anthropic', 'auto'].includes(formatRaw) ? formatRaw : 'auto'

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

  return {
    provider,
    format,
    baseUrl,
    apiKey,
    model,
    maxRepairRounds,
    temperature,
    maxTokens,
  }
}

export function getSafeLlmConfigSummary() {
  const cfg = resolveLlmConfig()
  const template = LLM_PROVIDER_TEMPLATES[cfg.provider] || LLM_PROVIDER_TEMPLATES.custom
  const requiresKey = cfg.provider !== 'ollama' && !/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/i.test(cfg.baseUrl)
  const configured = Boolean(cfg.baseUrl && cfg.model && (!requiresKey || cfg.apiKey))
  return {
    configured,
    provider: cfg.provider,
    format: cfg.format,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    maxRepairRounds: cfg.maxRepairRounds,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    hasApiKey: Boolean(cfg.apiKey),
    maskedApiKey: maskSecretKey(cfg.apiKey),
    requiresKey: template.requiresKey,
    templates: Object.values(LLM_PROVIDER_TEMPLATES),
    configFile: getLlmConfigPath(),
  }
}

export function saveLlmConfig(patch = {}) {
  const cfgPath = getLlmConfigPath()
  mkdirSync(dirname(cfgPath), { recursive: true })
  const existing = readStoredConfigFile()
  const incomingKey = patch.apiKey !== undefined ? String(patch.apiKey).trim() : undefined

  let nextApiKey = existing.apiKey || ''
  if (patch.clearApiKey === true) {
    nextApiKey = ''
  } else if (incomingKey && incomingKey !== 'KEEP_EXISTING' && !incomingKey.includes('****')) {
    nextApiKey = incomingKey
  }

  const next = {
    provider: String(patch.provider ?? existing.provider ?? 'custom').trim() || 'custom',
    format: ['openai', 'anthropic', 'auto'].includes(String(patch.format || '').toLowerCase())
      ? String(patch.format).toLowerCase()
      : existing.format || 'auto',
    baseUrl: String(patch.baseUrl ?? existing.baseUrl ?? '')
      .trim()
      .replace(/\/+$/, ''),
    apiKey: nextApiKey,
    model: String(patch.model ?? existing.model ?? '').trim(),
    maxRepairRounds: Math.max(
      1,
      Math.min(5, Number(patch.maxRepairRounds ?? existing.maxRepairRounds ?? 3) || 3),
    ),
    temperature: Number.isFinite(Number(patch.temperature ?? existing.temperature))
      ? Number(patch.temperature ?? existing.temperature)
      : 0.45,
    maxTokens: Math.max(1024, Number(patch.maxTokens ?? existing.maxTokens ?? 16000) || 16000),
    updatedAt: new Date().toISOString(),
  }

  writeFileSync(cfgPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return getSafeLlmConfigSummary()
}

export function detectWireProtocol(cfg) {
  if (cfg.format === 'anthropic') return 'anthropic'
  if (cfg.format === 'openai') return 'openai'
  const url = String(cfg.baseUrl || '').toLowerCase()
  if (url.includes('anthropic.com') || /\/v1\/messages$/.test(url)) return 'anthropic'
  if (cfg.provider === 'anthropic' && !url.includes('/chat/completions') && !url.includes('openrouter')) {
    return 'anthropic'
  }
  return 'openai'
}

function buildChatEndpoint(baseUrl, protocol) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) throw new Error('未填写 LLM Base URL，请先在「AI 模型设置」中配置或填写 .env。')
  if (protocol === 'anthropic') {
    if (/\/v\d+\/messages$/i.test(clean)) return clean
    if (/\/v\d+$/i.test(clean)) return `${clean}/messages`
    return `${clean}/v1/messages`
  }
  if (/\/chat\/completions$/i.test(clean)) return clean
  if (/\/v\d+(\/.*)?$/i.test(clean)) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}

function buildModelsEndpoint(baseUrl) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) return ''
  const root = clean.replace(/\/(chat\/completions|messages)$/i, '')
  if (/\/v\d+(\/openai)?$/i.test(root)) return `${root}/models`
  return `${root}/v1/models`
}

/**
 * Call any configured OpenAI-compatible or Anthropic-native LLM endpoint.
 */
export async function callLlmChat({
  messages = [],
  system = '',
  temperature,
  maxTokens,
  timeoutMs = 150000,
  overrideConfig = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const cfg = resolveLlmConfig(overrideConfig)
  if (!cfg.baseUrl) {
    throw new Error('尚未配置大模型接口地址 (Base URL)。点击右上角「模型设置」填入任意 API 地址和密钥即可开始 AI 编程创作。')
  }
  if (!cfg.model) {
    throw new Error('尚未指定模型名称 (例如 claude-opus-4-6 / deepseek-chat / gpt-5 或任意中转模型 ID)。')
  }
  const requiresKey = cfg.provider !== 'ollama' && !/^http:\/\/127\.0\.0\.1|^http:\/\/localhost/i.test(cfg.baseUrl)
  if (requiresKey && !cfg.apiKey) {
    throw new Error('尚未配置 API Key，请先在「模型设置」填写密钥。')
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 运行时缺少 fetch API。')
  }

  const protocol = detectWireProtocol(cfg)
  const endpoint = buildChatEndpoint(cfg.baseUrl, protocol)
  const temp = Number.isFinite(Number(temperature)) ? Number(temperature) : cfg.temperature
  const maxOut = Number(maxTokens) > 0 ? Number(maxTokens) : cfg.maxTokens

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`LLM 请求超时 (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs)

  try {
    let headers
    let payload
    if (protocol === 'anthropic') {
      headers = {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      }
      const normMsgs = messages
        .filter((m) => m && m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || ''),
        }))
      const sysParts = [system, ...messages.filter((m) => m?.role === 'system').map((m) => m.content)]
        .filter(Boolean)
        .join('\n\n')
      payload = {
        model: cfg.model,
        max_tokens: maxOut,
        temperature: temp,
        ...(sysParts ? { system: sysParts } : {}),
        messages: normMsgs,
      }
    } else {
      headers = {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      }
      const normMsgs = []
      if (system) normMsgs.push({ role: 'system', content: String(system) })
      for (const m of messages) {
        if (!m || !m.content) continue
        normMsgs.push({ role: m.role || 'user', content: String(m.content) })
      }
      payload = {
        model: cfg.model,
        messages: normMsgs,
        temperature: temp,
        max_tokens: maxOut,
      }
    }

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const rawText = await res.text()
    let data = null
    try {
      data = JSON.parse(rawText)
    } catch {
      data = null
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        rawText.slice(0, 300) ||
        `HTTP ${res.status}`
      throw new Error(`大模型接口返回错误 (${res.status}): ${msg}`)
    }

    let text = ''
    if (protocol === 'anthropic') {
      if (Array.isArray(data?.content)) {
        text = data.content
          .filter((b) => b?.type === 'text' && b.text)
          .map((b) => b.text)
          .join('\n')
      } else if (typeof data?.completion === 'string') {
        text = data.completion
      }
    } else {
      const choice = data?.choices?.[0]
      if (typeof choice?.message?.content === 'string') {
        text = choice.message.content
      } else if (Array.isArray(choice?.message?.content)) {
        text = choice.message.content.map((c) => c?.text || '').join('\n')
      }
    }

    if (!text.trim()) {
      throw new Error('大模型返回内容为空，请检查模型 ID 或额度限制。')
    }

    return {
      ok: true,
      protocol,
      endpoint,
      model: data?.model || cfg.model,
      text,
      usage: data?.usage || null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchAvailableModels(overrideConfig = {}, fetchImpl = globalThis.fetch) {
  const cfg = resolveLlmConfig(overrideConfig)
  const endpoint = buildModelsEndpoint(cfg.baseUrl)
  if (!endpoint || typeof fetchImpl !== 'function') return []
  const protocol = detectWireProtocol(cfg)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const headers =
      protocol === 'anthropic'
        ? {
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-01',
          }
        : {
            ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
          }
    const res = await fetchImpl(endpoint, { method: 'GET', headers, signal: controller.signal })
    if (!res.ok) return []
    const json = await res.json()
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : []
    return list
      .map((item) => String(item?.id || item?.name || '').trim())
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
  const models = await fetchAvailableModels(cfg, fetchImpl)
  const res = await callLlmChat({
    overrideConfig: cfg,
    fetchImpl,
    system: 'Reply strictly with OK.',
    messages: [{ role: 'user', content: 'Connection health check. Reply with OK.' }],
    temperature: 0,
    maxTokens: 32,
    timeoutMs: 25000,
  })
  return {
    ok: true,
    latencyMs: Date.now() - started,
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
