/**
 * Child-process worker of the optional local speech recognition (speech-recognition.js).
 *
 * usage: node asr-worker.cjs <job.json>
 * job: { mode: 'selftest' | 'transcribe' | 'transcribe-batch', runtimeDir, senseVoiceDir, vadPath, numThreads,
 *        wavPath?, items?: [{ id, wavPath }], language?, outPath, progressPath }
 * The native sherpa-onnx addon is loaded only here (never inside the studio process). Input audio for 'transcribe' is
 * a 16 kHz mono PCM s16le WAV prepared by FFmpeg. Output (outPath, JSON): segments with absolute token start times,
 * a 10 ms energy envelope (dBFS, base64 Int8) and timing stats. Progress is written to progressPath.
 * 'transcribe-batch' recognises many short clips (same 16 kHz format, e.g. every scene's narration take) with ONE model
 * load: `{ ok, items: [{ id, ok, text, language, durationSec, decodeMs } | { id, ok: false, error }], stats }`.
 */
'use strict'
const { createRequire } = require('module')
const fs = require('fs')
const path = require('path')

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const SR = 16000

function writeJson(p, obj) {
  if (!p) return
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(obj))
  fs.renameSync(tmp, p)
}

let lastProgressAt = 0
function progress(pct, message, force = false) {
  const now = Date.now()
  if (!force && now - lastProgressAt < 700) return
  lastProgressAt = now
  try {
    writeJson(job.progressPath, { progress: Math.round(pct * 10) / 10, message })
  } catch {}
}

function fail(err) {
  try {
    writeJson(job.outPath, { ok: false, error: String((err && err.message) || err) })
  } catch {}
  process.exitCode = 1
}

function loadSherpa() {
  const req = createRequire(path.join(job.runtimeDir, 'package.json'))
  return req('sherpa-onnx-node')
}

function createRecognizer(sherpa) {
  const lang = String(job.language || 'auto').toLowerCase()
  return new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SR, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: path.join(job.senseVoiceDir, 'model.int8.onnx'),
        language: ['zh', 'en', 'ja', 'ko', 'yue'].includes(lang) ? lang : 'auto',
        useInverseTextNormalization: 1,
      },
      tokens: path.join(job.senseVoiceDir, 'tokens.txt'),
      numThreads: Math.max(1, Math.min(8, Number(job.numThreads) || 2)),
      provider: 'cpu',
      debug: 0,
    },
  })
}

function createVad(sherpa) {
  return new sherpa.Vad(
    {
      sileroVad: {
        model: job.vadPath,
        // whole sentences per segment (short in-sentence pauses stay inside, so the model punctuates with context);
        // pauses are measured separately from the energy envelope
        threshold: 0.5,
        minSilenceDuration: 0.5,
        minSpeechDuration: 0.1,
        windowSize: 512,
        maxSpeechDuration: 25,
      },
      sampleRate: SR,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    90,
  )
}

/** PCM s16le mono 16 kHz WAV → Int16Array (copied when the data chunk is not 2-byte aligned). */
function readPcm16(file) {
  const buf = fs.readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是有效的 WAV 文件')
  let off = 12
  let fmt = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    let size = buf.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) }
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== SR || fmt.bits !== 16) throw new Error('音频格式应为 16 kHz 单声道 16 位 PCM')
      if (size === 0 || body + size > buf.length) size = buf.length - body // streamed WAV headers may carry 0 / -1
      size -= size % 2
      if (body % 2 === 0) return new Int16Array(buf.buffer, buf.byteOffset + body, size / 2)
      const copy = new Int16Array(size / 2)
      for (let i = 0; i < copy.length; i++) copy[i] = buf.readInt16LE(body + i * 2)
      return copy
    }
    off = body + size + (size % 2)
  }
  throw new Error('WAV 文件里没有音频数据')
}

function toFloat(pcm, start, end) {
  const n = Math.max(0, end - start)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = pcm[start + i] / 32768
  return out
}

const stripTag = (s) => String(s || '').replace(/[<|>]/g, '').trim()

function selftest() {
  const t0 = Date.now()
  const sherpa = loadSherpa()
  const recognizer = createRecognizer(sherpa)
  const vad = createVad(sherpa)
  const silence = new Float32Array(SR)
  vad.acceptWaveform(silence.subarray(0, 512))
  const stream = recognizer.createStream()
  stream.acceptWaveform({ sampleRate: SR, samples: silence })
  recognizer.decode(stream)
  recognizer.getResult(stream)
  writeJson(job.outPath, { ok: true, loadMs: Date.now() - t0, providers: ['cpu'] })
}

function transcribe() {
  const t0 = Date.now()
  progress(0, '正在加载识别模型...', true)
  const sherpa = loadSherpa()
  const recognizer = createRecognizer(sherpa)
  const vad = createVad(sherpa)
  const loadMs = Date.now() - t0
  const pcm = readPcm16(job.wavPath)
  const total = pcm.length
  const durationSec = total / SR

  // 10 ms energy envelope (dBFS, clamped to [-100, 0]) — used to place cut points in silence
  const hop = SR / 100
  const nFrames = Math.ceil(total / hop)
  const env = Buffer.alloc(nFrames)
  for (let f = 0; f < nFrames; f++) {
    const a = f * hop
    const b = Math.min(total, a + hop)
    let e = 0
    for (let i = a; i < b; i++) {
      const x = pcm[i] / 32768
      e += x * x
    }
    const db = 10 * Math.log10(e / Math.max(1, b - a) + 1e-10)
    env.writeInt8(Math.max(-100, Math.min(0, Math.round(db))), f)
  }

  // voice activity
  const t1 = Date.now()
  const segs = []
  const drain = () => {
    while (!vad.isEmpty()) {
      const s = vad.front(false)
      segs.push({ start: Number(s.start), end: Number(s.start) + s.samples.length })
      vad.pop()
    }
  }
  const win = 512
  const chunk = new Float32Array(win)
  for (let i = 0; i < total; i += win) {
    const n = Math.min(win, total - i)
    for (let k = 0; k < n; k++) chunk[k] = pcm[i + k] / 32768
    vad.acceptWaveform(n === win ? chunk : chunk.subarray(0, n))
    drain()
    if ((i / win) % 400 === 0) progress((i / total) * 25, `正在找出说话片段 ${Math.round((i / total) * 100)}%`)
  }
  vad.flush()
  drain()
  segs.sort((a, b) => a.start - b.start)
  const vadMs = Date.now() - t1

  // recognition per speech segment (padded into the surrounding silence only)
  const t2 = Date.now()
  const pad = Math.round(0.2 * SR)
  const out = []
  const langDur = {}
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]
    const prevEnd = k > 0 ? segs[k - 1].end : 0
    const nextStart = k + 1 < segs.length ? segs[k + 1].start : total
    const a = Math.max(prevEnd, s.start - pad, 0)
    const b = Math.min(nextStart, s.end + pad, total)
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate: SR, samples: toFloat(pcm, a, b) })
    recognizer.decode(stream)
    const r = recognizer.getResult(stream)
    const off = a / SR
    const tokens = (r.tokens || []).map((t, i) => ({ t, s: Math.round((off + Number((r.timestamps || [])[i] || 0)) * 1000) / 1000 }))
    const lang = stripTag(r.lang)
    if (lang) langDur[lang] = (langDur[lang] || 0) + (s.end - s.start) / SR
    out.push({
      start: Math.round((s.start / SR) * 1000) / 1000,
      end: Math.round((s.end / SR) * 1000) / 1000,
      lang,
      emotion: stripTag(r.emotion),
      event: stripTag(r.event),
      text: String(r.text || '').trim(),
      tokens,
    })
    progress(25 + ((k + 1) / Math.max(1, segs.length)) * 74, `正在识别第 ${k + 1}/${segs.length} 段`)
  }
  const decodeMs = Date.now() - t2
  const language = Object.entries(langDur).sort((x, y) => y[1] - x[1])[0]?.[0] || ''
  writeJson(job.outPath, {
    ok: true,
    durationSec: Math.round(durationSec * 1000) / 1000,
    sampleRate: SR,
    language,
    segments: out,
    energy: { hopSec: 0.01, db: env.toString('base64') },
    stats: { loadMs, vadMs, decodeMs, segments: out.length, threads: Number(job.numThreads) || 2 },
  })
  progress(100, '识别完成', true)
}

// clips up to this length are decoded in one pass (SenseVoice handles whole utterances up to ~30 s); longer clips are
// cut into speech segments by the VAD first, like 'transcribe'
const ONE_PASS_MAX_SEC = 28

/** Speech spans (sample ranges, padded 0.2 s into the surrounding silence) of a long clip; fixed 25 s windows when the
 *  VAD finds nothing. */
function speechSpans(sherpa, pcm) {
  const total = pcm.length
  const vad = createVad(sherpa)
  const segs = []
  const drain = () => {
    while (!vad.isEmpty()) {
      const s = vad.front(false)
      segs.push({ start: Number(s.start), end: Number(s.start) + s.samples.length })
      vad.pop()
    }
  }
  const win = 512
  const chunk = new Float32Array(win)
  for (let i = 0; i < total; i += win) {
    const n = Math.min(win, total - i)
    for (let k = 0; k < n; k++) chunk[k] = pcm[i + k] / 32768
    vad.acceptWaveform(n === win ? chunk : chunk.subarray(0, n))
    drain()
  }
  vad.flush()
  drain()
  segs.sort((a, b) => a.start - b.start)
  if (segs.length === 0) {
    const step = 25 * SR
    for (let a = 0; a < total; a += step) segs.push({ start: a, end: Math.min(total, a + step) })
    return segs
  }
  const pad = Math.round(0.2 * SR)
  return segs.map((s, k) => ({
    start: Math.max(k > 0 ? segs[k - 1].end : 0, s.start - pad, 0),
    end: Math.min(k + 1 < segs.length ? segs[k + 1].start : total, s.end + pad, total),
  }))
}

function joinTexts(parts) {
  return parts.reduce((acc, t) => (acc && /[A-Za-z0-9.,!?;:]$/.test(acc) && /^[A-Za-z0-9]/.test(t) ? `${acc} ${t}` : acc + t), '')
}

function transcribeBatch() {
  const t0 = Date.now()
  progress(0, '正在加载识别模型...', true)
  const sherpa = loadSherpa()
  const recognizer = createRecognizer(sherpa)
  const loadMs = Date.now() - t0
  const items = Array.isArray(job.items) ? job.items : []
  const results = []
  let decodeMs = 0
  for (let k = 0; k < items.length; k++) {
    const it = items[k] || {}
    const t1 = Date.now()
    try {
      const pcm = readPcm16(it.wavPath)
      const total = pcm.length
      const spans = total <= ONE_PASS_MAX_SEC * SR ? [{ start: 0, end: total }] : speechSpans(sherpa, pcm)
      const texts = []
      const langDur = {}
      for (const sp of spans) {
        if (sp.end - sp.start < SR / 20) continue
        const stream = recognizer.createStream()
        stream.acceptWaveform({ sampleRate: SR, samples: toFloat(pcm, sp.start, sp.end) })
        recognizer.decode(stream)
        const r = recognizer.getResult(stream)
        const text = String(r.text || '').trim()
        if (text) texts.push(text)
        const lang = stripTag(r.lang)
        if (lang && text) langDur[lang] = (langDur[lang] || 0) + (sp.end - sp.start)
      }
      const ms = Date.now() - t1
      decodeMs += ms
      results.push({
        id: it.id,
        ok: true,
        text: joinTexts(texts),
        language: Object.entries(langDur).sort((x, y) => y[1] - x[1])[0]?.[0] || '',
        durationSec: Math.round((total / SR) * 1000) / 1000,
        decodeMs: ms,
      })
    } catch (err) {
      results.push({ id: it.id, ok: false, error: String((err && err.message) || err) })
    }
    progress(((k + 1) / Math.max(1, items.length)) * 100, `正在回听第 ${k + 1}/${items.length} 段`)
  }
  writeJson(job.outPath, { ok: true, items: results, stats: { loadMs, decodeMs, items: results.length, threads: Number(job.numThreads) || 2 } })
  progress(100, '回听完成', true)
}

try {
  if (job.mode === 'selftest') selftest()
  else if (job.mode === 'transcribe') transcribe()
  else if (job.mode === 'transcribe-batch') transcribeBatch()
  else throw new Error(`unknown mode: ${job.mode}`)
} catch (err) {
  fail(err)
}
