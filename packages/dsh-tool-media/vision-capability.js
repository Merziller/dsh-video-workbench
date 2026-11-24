/**
 * 看图能力 (vision capability) — the one shared answer to "can the configured model look at pictures?" for every
 * feature that sends images to a model: 参考复刻 (reference video analysis), 画面自检 (visual self-review of rendered
 * keyframes) and 截图定位 (screenshot grounding).
 *
 * It is never guessed from model names. Evidence, in order:
 *   1. the user's choice in 设置 · 模型与密钥 → 看图能力 (支持看图 / 不支持看图), or a dedicated 看图模型;
 *   2. a remembered verdict for this protocol + endpoint + model (stored by llm-client.js; it expires, and saving the
 *      model settings forgets it);
 *   3. a DSH channel that declares the model text-only (`input` / `inputModalities` without image) is skipped;
 *   4. otherwise one tiny probe: a 64×64 red square and "what colour is it?". An image error, or an answer that is not
 *      red, means the model cannot see. An ambiguous 4xx is asked again without the picture to tell the two apart.
 * Real calls refine the verdict (a rejected picture is remembered). Inconclusive failures (timeout, network, rate limit,
 * balance, key) are reported with their own plain-Chinese reason and never remembered as "cannot see".
 */
import { isBillingError } from './cloud-ledger.js'
import {
  callLlmChat,
  describeVisionStatus,
  getCachedVisionCapability,
  getLlmTimeoutMs,
  rememberVisionCapability,
  resolveVisionLlmConfig,
} from './llm-client.js'

/** The probe picture: a 64×64 solid red PNG (large enough for gateways that reject images under 10–28 px). */
export const VISION_PROBE_IMAGE = Object.freeze({
  mimeType: 'image/png',
  base64:
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC',
})
const PROBE_SYSTEM = 'You are checking whether you can see attached images. Answer with a single colour word only.'
const PROBE_QUESTION = '这张图片是什么颜色？只回答一个颜色词（例如：红色）。'
const PROBE_CONTROL = '这条消息没有附带图片，请只回答：收到'
const SAW_RED_RE = /红|赤|朱|\bred\b|crimson|scarlet|vermilion|maroon/i
const CANNOT_SEE_RE =
  /没有(看到|收到)?图|无图|看不到|看不见|无法(查看|看到|识别|读取|访问|处理)|未(收到|看到|提供)|cannot see|can't see|can not see|unable to (see|view|access|process)|no image|don'?t see|do not see|text[- ]only/i

// outcomes that mean "this endpoint + model cannot take pictures" — remembered
const CONCLUSIVE = new Set(['image-rejected', 'image-format', 'not-looked'])
// the API said in so many words that pictures are not accepted
const IMAGE_UNSUPPORTED_RE =
  /unknown variant|expected `?text`?|content (must|should) be (a )?string|expected (a )?string|(does not|doesn'?t|do not|not|no longer) support(s|ed)?[\w\s-]{0,24}(image|vision|multi-?modal|picture)|(image|vision|multi-?modal)[\w\s-]{0,24}(is |are )?not (supported|enabled|available|allowed)|no endpoints? found that supports? image|不支持(图片|图像|视觉|多模态|看图)|(图片|图像)[^，。,.]{0,8}不支持/i
// the picture data itself was refused (format / encoding / size)
const IMAGE_FORMAT_RE =
  /image[\s_-]?(format|type|data|size|too large)|(invalid|unsupported|bad|illegal|corrupt\w*|malformed)[\w\s'"`:-]{0,24}(format|mime|media.?type|base64|data ?url|image data)|mime.?type|media_type|base64|data ?url|failed to (decode|parse|download|fetch|load|process) (the )?image|could not (decode|process|read|download|load) (the )?image|图片格式|图片数据|图片(太|过)大/i
// any other mention of pictures in a 4xx
const IMAGE_WORD_RE = /image|vision|multi-?modal|modalit|picture|photo|inline_?data|input_image|图片|图像|视觉|多模态/i
const TIMEOUT_RE = /LLM 请求超时|请求超时|timed? ?out|timeout|ETIMEDOUT|UND_ERR_(HEADERS|BODY|CONNECT)_TIMEOUT/i
const NETWORK_RE = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|socket hang up|other side closed|getaddrinfo|network/i
const AUTH_RE = /unauthori[sz]ed|invalid[_ ]?(api[_ ]?)?key|incorrect api key|invalid x-api-key|authentication|permission denied|forbidden/i
const RATE_RE = /rate.?limit|too many requests/i
const MODEL_MISSING_RE = /model[_ ]not[_ ]found|does not exist|no such model|unknown model|模型不存在|找不到模型/i

const isAbort = (err, signal) => Boolean(signal?.aborted || err?.name === 'AbortError')

/** The API's own words from a callLlmChat error, without our prefix and without echoed picture data. */
function apiDetail(msg) {
  return String(msg || '')
    .replace(/^大模型接口 \([^)]*\) 返回错误(?: \(\d{3}\))?:\s*/, '')
    .replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, 'data:…')
    .replace(/[A-Za-z0-9+/=]{80,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

// a reasoning model may put its thinking in front of the answer (`<think>…</think>` from some relays): judge the answer
const answerOf = (text) => String(text || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/\s+/g, ' ').trim()
const clipAnswer = (text) => answerOf(text).slice(0, 60)

/**
 * Classify a failed picture-carrying model call: { code, conclusive, status, detail, short, reason, fix }.
 * `conclusive` = the endpoint / model cannot take pictures (worth remembering); everything else is circumstantial.
 */
export function classifyVisionError(err, { model = '', timeoutMs = 0 } = {}) {
  const msg = String(err?.message || err || '')
  const sysCode = String(err?.code || err?.cause?.code || '')
  const status = Number(err?.status) || Number(/(?:返回错误 \(|HTTP |status(?: code)?[: ]+)(\d{3})/i.exec(msg)?.[1]) || 0
  let detail = apiDetail(msg)
  // picture verdicts only come from the model API's own refusal (an HTTP 4xx, or an error event in a 200 stream) —
  // never from a local exception that merely mentions an image
  const fromApi = status > 0 || /^大模型接口 \(/.test(msg)
  const clientError = fromApi && (status === 0 || (status >= 400 && status < 500 && ![401, 402, 403, 429].includes(status)))
  // (an unusable reply is checked before any picture rule: its text may well mention images)
  let code
  if (err?.name === 'AbortError' && !TIMEOUT_RE.test(msg)) code = 'aborted'
  else if (isBillingError(err)) code = 'billing'
  else if (TIMEOUT_RE.test(`${msg} ${sysCode}`) && status < 400) {
    code = 'timeout'
    detail = ''
  } else if (/无法从模型回复中解析 JSON|Empty LLM response/.test(msg)) {
    code = 'bad-json'
    detail = apiDetail(/片段:\s*([\s\S]*)$/.exec(msg)?.[1] || '').slice(0, 60)
  } else if (/返回内容为空/.test(msg)) {
    code = 'empty'
    detail = ''
  } else if (status === 401 || status === 403 || (status === 0 && AUTH_RE.test(msg))) code = 'auth'
  else if (status === 429 || (status === 0 && RATE_RE.test(msg))) code = 'rate-limit'
  else if (clientError && IMAGE_UNSUPPORTED_RE.test(msg)) code = 'image-rejected'
  else if (clientError && IMAGE_FORMAT_RE.test(msg)) code = 'image-format'
  else if (clientError && IMAGE_WORD_RE.test(msg)) code = 'image-rejected'
  else if (status === 404 || MODEL_MISSING_RE.test(msg)) code = 'model-missing'
  else if (status >= 500) code = 'server'
  else if (NETWORK_RE.test(`${msg} ${sysCode}`)) {
    code = 'network'
    detail = sysCode || detail
  } else if (status >= 400) code = 'bad-request'
  else code = 'error'
  return { code, conclusive: CONCLUSIVE.has(code), status, detail, ...describeVisionStatus(code, { model, detail, timeoutMs }) }
}

/** Messages with every picture part removed (for a follow-up call to a model that may only read text). */
export function stripImagesFromMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((m) =>
    m && Array.isArray(m.content)
      ? { ...m, content: m.content.filter((p) => !(p && typeof p === 'object' && (p.type === 'image' || p.type === 'image_url'))) }
      : m,
  )
}

/**
 * Ask the 看图 model about the probe picture. Returns { ok (it can see), code, conclusive, short, reason, fix, detail,
 * answer, model, protocol, dedicated, latencyMs, checkedAt }. Conclusive verdicts are remembered.
 */
export async function probeVisionSupport({ target = null, mainConfig = null, fetchImpl, signal, timeoutMs, onWait } = {}) {
  const t = target || resolveVisionLlmConfig(mainConfig || {})
  const tmo = Number(timeoutMs) > 0 ? Number(timeoutMs) : getLlmTimeoutMs()
  const started = Date.now()
  const base = { model: t.model, protocol: t.protocol, dedicated: t.dedicated, checkedAt: new Date(started).toISOString() }
  if (!t.configured) {
    return { ...base, ok: false, code: 'not-configured', conclusive: false, detail: '', answer: '', latencyMs: 0, ...describeVisionStatus('not-configured', { model: t.model }) }
  }
  // 宿主智能体代写: the agent opens the pictures itself — a probe would only queue a pointless task for it
  if (t.hostAgent) {
    return { ...base, ok: true, code: 'host-agent', conclusive: false, detail: '', answer: '', latencyMs: 0, ...describeVisionStatus('host-agent', { model: t.model }) }
  }
  const ask = (withImage) =>
    callLlmChat({
      overrideConfig: t.config,
      fetchImpl,
      signal,
      timeoutMs: tmo,
      onWait,
      system: PROBE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: withImage ? [{ type: 'text', text: PROBE_QUESTION }, { type: 'image', ...VISION_PROBE_IMAGE }] : PROBE_CONTROL,
        },
      ],
      temperature: 0,
      // the answer is one word, but reasoning models spend part of this budget thinking first; too small a budget
      // comes back empty and would hide a model that can see
      maxTokens: 2048,
    })
  let out
  try {
    const reply = await ask(true)
    const said = answerOf(reply?.text).slice(0, 400)
    const answer = clipAnswer(reply?.text)
    const saw = SAW_RED_RE.test(said) && !CANNOT_SEE_RE.test(said)
    const code = saw ? 'supported' : 'not-looked'
    out = { ok: saw, code, conclusive: true, detail: '', answer, ...describeVisionStatus(code, { model: t.model, answer }) }
  } catch (err) {
    if (isAbort(err, signal)) throw err
    let c = classifyVisionError(err, { model: t.model, timeoutMs: tmo })
    if (c.code === 'bad-request') {
      // an ambiguous 4xx: when the same question without the picture goes through, the picture was the problem
      try {
        await ask(false)
        c = { ...c, code: 'image-rejected', conclusive: true, ...describeVisionStatus('image-rejected', { model: t.model, detail: c.detail }) }
      } catch (err2) {
        if (isAbort(err2, signal)) throw err2
        c = classifyVisionError(err2, { model: t.model, timeoutMs: tmo })
      }
    }
    out = { ok: false, answer: '', ...c }
  }
  if (out.conclusive) {
    rememberVisionCapability(t.cacheKey, {
      status: out.ok ? 'supported' : 'unsupported',
      code: out.code,
      model: t.model,
      protocol: t.protocol,
      detail: out.detail,
      answer: out.answer,
      source: 'probe',
    })
  }
  return { ...base, ...out, latencyMs: Date.now() - started }
}

/**
 * Decide whether a feature may send pictures now. Resolves to a gate:
 *   { ok, code, short, reason, fix, source ('user' | 'cache' | 'declared' | 'probe' | 'config' | 'unknown' | 'host-agent'), model,
 *     protocol, dedicated, config (overrideConfig for callLlmChat), target }
 * `probe: false` skips the probe for an unknown model (the real call then teaches the verdict via noteVisionOutcome).
 */
export async function prepareVisionCall({ mainConfig = null, fetchImpl, signal, probe = true, onWait, onProbe } = {}) {
  const t = resolveVisionLlmConfig(mainConfig || {})
  const gate = { target: t, config: t.config, model: t.model, protocol: t.protocol, dedicated: t.dedicated, support: t.support }
  const words = (code, extra = {}) => ({ code, ...describeVisionStatus(code, { model: t.model, detail: extra.detail, answer: extra.answer, checkedAt: extra.checkedAt }) })
  const blocked = (code, extra = {}) => ({ ...gate, ok: false, conclusive: CONCLUSIVE.has(code), detail: '', ...extra, ...words(code, extra) })
  if (!t.configured) return blocked('not-configured', { source: 'config' })
  if (t.support === 'no') return blocked('user-off', { source: 'user' })
  if (t.hostAgent) return { ...gate, ok: true, source: 'host-agent', ...words('host-agent') }
  if (t.support === 'yes') return { ...gate, ok: true, source: 'user', ...words('user-on') }
  const known = getCachedVisionCapability(t.cacheKey)
  if (known) {
    return known.status === 'supported'
      ? { ...gate, ok: true, source: 'cache', checkedAt: known.checkedAt, ...words('supported', { checkedAt: known.checkedAt }) }
      : blocked(known.code, { source: 'cache', checkedAt: known.checkedAt, detail: known.detail, answer: known.answer })
  }
  if (t.declared === 'text') return blocked('declared-text', { source: 'declared' })
  if (!probe) return { ...gate, ok: true, source: 'unknown', ...words('unknown') }
  try {
    onProbe?.(t)
  } catch {}
  const p = await probeVisionSupport({ target: t, fetchImpl, signal, onWait })
  return { ...gate, ...p, source: 'probe' }
}

/**
 * Fold what a real picture-carrying call taught us into the shared knowledge. Returns { ok: true, code: 'used', … }
 * after a successful look, otherwise the classified failure in plain Chinese (conclusive ones are remembered).
 * `code` reports an outcome without an error (e.g. 'not-looked': the reply shows the model never saw the pictures).
 */
export function noteVisionOutcome(gate, { ok = false, error = null, code = '', answer = '' } = {}) {
  const t = gate?.target || null
  const model = gate?.model || t?.model || ''
  if (ok) {
    if (t?.configured) {
      const cur = getCachedVisionCapability(t.cacheKey)
      if (!cur || cur.status !== 'supported') rememberVisionCapability(t.cacheKey, { status: 'supported', code: 'supported', model, protocol: t.protocol, source: 'used' })
    }
    return { ok: true, code: 'used', conclusive: false, detail: '', ...describeVisionStatus('used', { model }) }
  }
  const c = code
    ? { code, conclusive: CONCLUSIVE.has(code), status: 0, detail: '', ...describeVisionStatus(code, { model, answer }) }
    : classifyVisionError(error, { model })
  if (t?.configured && c.conclusive) {
    rememberVisionCapability(t.cacheKey, { status: 'unsupported', code: c.code, model, protocol: t.protocol, detail: c.detail, answer, source: 'used' })
  }
  return { ok: false, ...c }
}

/** 「检测看图能力」 in the settings: always probes (ignores remembered verdicts) and returns the probe result. */
export async function checkVisionCapability({ mainConfig = null, fetchImpl, signal, timeoutMs } = {}) {
  return probeVisionSupport({ target: resolveVisionLlmConfig(mainConfig || {}), fetchImpl, signal, timeoutMs })
}

/** "原因 · 怎么办" in one line for logs and task messages. */
export function visionStatusLine(s) {
  if (!s) return ''
  return `${s.reason || s.short || ''}${s.fix ? ` 怎么办：${s.fix}` : ''}`.trim()
}
