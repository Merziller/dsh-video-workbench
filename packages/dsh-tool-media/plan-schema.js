import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveSafeZoneSpec } from '@dsh-video/shared'

export const PROMO_PLAN_VERSION = 'promo-plan/1'

export const PROMO_SHOT_RECIPES = {
  hold: {
    id: 'hold',
    label: '稳态定焦',
    layout: 'media-split-motion',
    kenBurns: 'hold',
    fromScale: 1.0,
    toScale: 1.02,
    transition: 'cut',
  },
  push_in: {
    id: 'push_in',
    label: '缓推聚焦 (≤1.25x)',
    layout: 'media-split-motion',
    kenBurns: 'zoom-in',
    fromScale: 1.0,
    toScale: 1.22,
    transition: 'iris-circle',
  },
  pull_out: {
    id: 'pull_out',
    label: '后拉全览',
    layout: '3d-stage-opener',
    kenBurns: 'zoom-out',
    fromScale: 1.24,
    toScale: 1.0,
    transition: 'wipe-right',
  },
  pan_down: {
    id: 'pan_down',
    label: '纵向俯仰摇镜',
    layout: 'media-split-motion',
    kenBurns: 'pan-down',
    fromScale: 1.12,
    toScale: 1.15,
    transition: 'wipe-right',
  },
  pan_across: {
    id: 'pan_across',
    label: '横向平移扫镜',
    layout: 'compare-dual',
    kenBurns: 'pan-right',
    fromScale: 1.1,
    toScale: 1.12,
    transition: 'block-wipe',
  },
  face_focus: {
    id: 'face_focus',
    label: '主体特写焦点',
    layout: 'media-split-motion',
    kenBurns: 'zoom-in',
    fromScale: 1.08,
    toScale: 1.25,
    transition: 'iris-circle',
  },
  impact: {
    id: 'impact',
    label: '高能冲击卡点',
    layout: 'kinetic-impact',
    kenBurns: 'zoom-in',
    fromScale: 1.15,
    toScale: 1.0,
    transition: 'flash-cut',
  },
  freeze_end: {
    id: 'freeze_end',
    label: '终幕定格落版',
    layout: 'radial-climax',
    kenBurns: 'zoom-out',
    fromScale: 1.16,
    toScale: 1.0,
    transition: 'cut',
  },
}

const VALID_SHOT_KINDS = Object.keys(PROMO_SHOT_RECIPES)
const VALID_STYLES = ['tech', 'cinematic', 'documentary', 'energetic']

function isRelativeAssetPath(p) {
  if (!p) return true
  const s = String(p).trim()
  if (!s) return true
  if (/^[A-Za-z]:[\\/]/.test(s) || /^https?:\/\//i.test(s) || s.startsWith('/')) return false
  return true
}

/**
 * Strictly validate a `promo-plan/1` JSON structure against hard safety invariants:
 * - max 8 non-cut transitions
 * - min 1.5s per shot
 * - zoom bounded within [1.0, 1.25]
 * - strictly relative asset references
 */
export function validatePromoPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: ['plan 对象无效'] }
  }
  const shots = Array.isArray(plan.shots) ? plan.shots : []
  if (shots.length === 0) {
    errors.push('shots 数组不能为空')
  }

  let nonCutTransitions = 0
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i] || {}
    const dur = Number(s.durationSec)
    if (!Number.isFinite(dur) || dur < 1.5) {
      errors.push(`shot[${i}] durationSec=${s.durationSec} 低于最小安全驻留时长 1.5s`)
    }
    const maxScale = Math.max(Number(s.fromScale || 1), Number(s.toScale || 1))
    const minScale = Math.min(Number(s.fromScale || 1), Number(s.toScale || 1))
    if (maxScale > 1.25 || minScale < 0.95) {
      errors.push(`shot[${i}] 缩放倍率 [${minScale}, ${maxScale}] 超出安全范围 [0.95, 1.25]`)
    }
    if (s.recipe && !VALID_SHOT_KINDS.includes(s.recipe)) {
      errors.push(`shot[${i}] 未知镜头原语 recipe=${s.recipe}`)
    }
    const tr = String(s.transition || 'cut')
    if (i > 0 && tr !== 'cut') nonCutTransitions++
    for (const ref of Array.isArray(s.assetRefs) ? s.assetRefs : []) {
      if (!isRelativeAssetPath(ref)) {
        errors.push(`shot[${i}] 包含非相对素材路径 "${ref}"`)
      }
    }
  }
  if (nonCutTransitions > 8) {
    errors.push(`转场次数 (${nonCutTransitions}) 超过最大上限 8 次`)
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Deterministic rule sanitizer clamping bounds and enriching missing fields into clean `promo-plan/1`.
 */
export function repairPromoPlanRules(rawPlan = {}, { topic = '', style = 'tech', assetsManifest = null, existingScript = null } = {}) {
  const existingScenes = Array.isArray(existingScript?.scenes) ? existingScript.scenes : []
  const mediaItems = (assetsManifest?.items || []).filter((it) => it.role !== 'music' && it.role !== 'sfx' && it.role !== 'note')
  const rawShots = Array.isArray(rawPlan?.shots) && rawPlan.shots.length > 0
    ? rawPlan.shots
    : existingScenes.length > 0
      ? existingScenes.map((sc, i) => ({
          id: sc.id,
          title: sc.title,
          narration: sc.narration,
          durationSec: sc.durationSec,
          recipe: i === 0 ? 'pull_out' : i === existingScenes.length - 1 ? 'freeze_end' : VALID_SHOT_KINDS[(i % 5) + 1],
        }))
      : [
          { title: topic || '开场核心亮点', narration: `${topic || '项目核心价值'}，从构想到成片全面加速。`, recipe: 'pull_out', durationSec: 4.5 },
          { title: '精准帧级呈现', narration: '智能编排运镜与安全区字幕，每一帧清晰可控。', recipe: 'push_in', durationSec: 4.5 },
          { title: '立即高效交付', narration: '声画同步成片导出，直接面向全平台上线发布。', recipe: 'freeze_end', durationSec: 4.0 },
        ]

  const cleanStyle = VALID_STYLES.includes(String(rawPlan?.style || style).toLowerCase())
    ? String(rawPlan?.style || style).toLowerCase()
    : 'tech'

  let transitionCount = 0
  const repairedShots = rawShots.map((s, idx) => {
    const recipeKey = VALID_SHOT_KINDS.includes(s?.recipe)
      ? s.recipe
      : idx === 0
        ? 'pull_out'
        : idx === rawShots.length - 1
          ? 'freeze_end'
          : VALID_SHOT_KINDS[(idx % 6) + 1]
    const spec = PROMO_SHOT_RECIPES[recipeKey]

    const durRaw = Number(s?.durationSec || existingScenes[idx]?.durationSec || 4.2)
    const durationSec = Math.max(1.5, Math.min(30, Number.isFinite(durRaw) ? durRaw : 4.2))
    const fromScale = Math.max(0.95, Math.min(1.25, Number(s?.fromScale || spec.fromScale)))
    const toScale = Math.max(0.95, Math.min(1.25, Number(s?.toScale || spec.toScale)))

    let transition = s?.transition || spec.transition || 'iris-circle'
    if (idx === 0) {
      transition = 'cut'
    } else if (transition !== 'cut') {
      if (transitionCount >= 8) transition = 'cut'
      else transitionCount++
    }

    const rawRefs = Array.isArray(s?.assetRefs)
      ? s.assetRefs.filter(isRelativeAssetPath)
      : mediaItems.length > 0
        ? [mediaItems[idx % mediaItems.length].path]
        : []

    return {
      id: s?.id || `scene-${String(idx + 1).padStart(2, '0')}`,
      title: String(s?.title || existingScenes[idx]?.title || `镜头 ${idx + 1}`).slice(0, 32),
      narration: String(s?.narration || existingScenes[idx]?.narration || s?.title || '').trim(),
      emotion: String(s?.emotion || existingScenes[idx]?.emotion || (idx === rawShots.length - 1 ? '激昂' : '平静')),
      recipe: recipeKey,
      layout: spec.layout,
      kenBurns: spec.kenBurns,
      fromScale: Number(fromScale.toFixed(2)),
      toScale: Number(toScale.toFixed(2)),
      transition,
      highlights: Array.isArray(s?.highlights) ? s.highlights.filter(Boolean).slice(0, 3) : [],
      durationSec: Number(durationSec.toFixed(3)),
      assetRefs: rawRefs,
    }
  })

  return {
    version: PROMO_PLAN_VERSION,
    title: String(rawPlan?.title || existingScript?.title || topic || 'Schema 创作短片').trim(),
    style: cleanStyle,
    targetPlatform: rawPlan?.targetPlatform || existingScript?.targetPlatform || 'universal',
    bpm: Math.max(70, Math.min(165, Number(rawPlan?.bpm || 112))),
    shots: repairedShots,
  }
}

/**
 * Compile `promo-plan/1` into deterministic `plan.resolved.json` schedule + `scriptData` patches.
 */
export function resolvePlanSchedule(plan, baseScript = {}) {
  const fps = Number(baseScript?.fps) || 30
  const width = Number(baseScript?.width) || 1920
  const height = Number(baseScript?.height) || 1080
  const safeZone = resolveSafeZoneSpec(width, height, plan?.targetPlatform || baseScript?.targetPlatform || 'universal')

  let cursorFrame = 0
  let cursorSec = 0
  const resolvedShots = (plan?.shots || []).map((shot, idx) => {
    const durSec = Math.max(1.5, Number(shot.durationSec || 4))
    const durFrames = Math.max(Math.ceil(1.5 * fps), Math.round(durSec * fps))
    const startFrame = cursorFrame
    const startSec = Number(cursorSec.toFixed(3))
    cursorFrame += durFrames
    cursorSec += durFrames / fps

    const baseScene = baseScript?.scenes?.[idx] || {}
    return {
      ...baseScene,
      id: shot.id || `scene-${String(idx + 1).padStart(2, '0')}`,
      index: idx + 1,
      title: shot.title,
      narration: shot.narration || baseScene.narration || shot.title,
      emotion: shot.emotion || baseScene.emotion || '平静',
      layout: shot.layout || 'media-split-motion',
      kenBurns: shot.kenBurns || 'zoom-in',
      transition: shot.transition || 'iris-circle',
      highlights: shot.highlights?.length ? shot.highlights : baseScene.highlights || [PROMO_SHOT_RECIPES[shot.recipe]?.label || shot.recipe],
      recipe: shot.recipe,
      fromScale: shot.fromScale,
      toScale: shot.toScale,
      media:
        Array.isArray(shot.assetRefs) && shot.assetRefs.length > 0
          ? shot.assetRefs.map((p) => ({
              path: p,
              type: /\.(mp4|mov|webm|mkv)$/i.test(p) ? 'video' : 'image',
              motion: shot.kenBurns || 'zoom-in',
            }))
          : baseScene.media || [],
      durationSec: Number((durFrames / fps).toFixed(4)),
      durationInFrames: durFrames,
      startFrame,
      startSec,
    }
  })

  const totalSec = Number(cursorSec.toFixed(4))
  const totalFrames = cursorFrame
  const beatStep = 60 / (Number(plan?.bpm) || 112)
  const beats = []
  for (let bt = 0, bi = 0; bt < totalSec; bt += beatStep, bi++) {
    beats.push({ time: Number(bt.toFixed(3)), strong: bi % 4 === 0 })
  }

  return {
    version: PROMO_PLAN_VERSION,
    fps,
    width,
    height,
    totalDurationSec: totalSec,
    totalDurationInFrames: totalFrames,
    safeZone,
    resolvedShots,
    beats,
  }
}

function safeExtractJson(text) {
  const s = String(text || '').trim()
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1].trim() : s
  try {
    return JSON.parse(raw)
  } catch {
    const a = raw.indexOf('{')
    const b = raw.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1))
    return null
  }
}

/**
 * 4-Tier Degradation Director for `schema-plan` mode:
 * - Tier 1: Full `promo-plan/1` JSON from LLM
 * - Tier 2: Sectioned lightweight shot-recipe list from weaker LLM
 * - Tier 3: Minimal A/B/C MCQ choice token from minimal LLM
 * - Tier 4: Zero-LLM Deterministic Code Rules (guaranteed 100% pass)
 */
export async function runSchemaDirectorWithDegradation({
  projectDir,
  topic = '',
  style = 'tech',
  targetPlatform = 'universal',
  scriptData = {},
  assetsManifest = null,
  callLlmChatFn = null,
  forceTierForTest = null,
}) {
  const trace = []
  let chosenPlan = null
  let degradationTier = 4

  // Tier 1: Full JSON Schema generation
  if (!forceTierForTest || forceTierForTest === 1) {
    if (typeof callLlmChatFn === 'function') {
      try {
        const mediaNames = (assetsManifest?.items || [])
          .filter((it) => it.role !== 'music' && it.role !== 'sfx')
          .map((it) => it.path)
        const prompt = {
          task: `生成 ${PROMO_PLAN_VERSION} 分镜配方 JSON`,
          topic: topic || scriptData?.title || '主题短片',
          targetPlatform,
          allowedRecipes: VALID_SHOT_KINDS,
          relativeAssets: mediaNames,
          scenesHint: (scriptData?.scenes || []).map((s) => ({ title: s.title, narration: s.narration })),
        }
        const res = await callLlmChatFn({
          system: `输出严格 JSON：{ "version": "promo-plan/1", "title": "...", "style": "tech|cinematic|documentary|energetic", "bpm": 112, "shots": [{ "title": "...", "narration": "...", "recipe": "push_in", "durationSec": 4.5, "transition": "iris-circle", "assetRefs": [] }] }。注意：每镜头 durationSec >= 1.5，转场<=8，仅使用提供的 relativeAssets 相对路径。`,
          messages: [{ role: 'user', content: JSON.stringify(prompt) }],
          temperature: 0.25,
          maxTokens: 2000,
          responseFormat: 'json',
        })
        const candidate = safeExtractJson(res?.text)
        const repaired = candidate ? repairPromoPlanRules(candidate, { topic, style, assetsManifest, existingScript: scriptData }) : null
        if (repaired && validatePromoPlan(repaired).ok) {
          chosenPlan = repaired
          degradationTier = 1
          trace.push({ tier: 1, name: 'Full JSON Schema', ok: true })
        } else {
          trace.push({ tier: 1, name: 'Full JSON Schema', ok: false, reason: 'JSON 结构未通过约束' })
        }
      } catch (err) {
        trace.push({ tier: 1, name: 'Full JSON Schema', ok: false, reason: err?.message || String(err) })
      }
    } else {
      trace.push({ tier: 1, name: 'Full JSON Schema', ok: false, reason: '未提供 LLM 客户端' })
    }
  }

  // Tier 2: Sectioned simple prompt (titles + recipes list)
  if (!chosenPlan && (!forceTierForTest || forceTierForTest <= 2) && typeof callLlmChatFn === 'function') {
    try {
      const res = await callLlmChatFn({
        system: `用极简 3 行列出分镜方案，每行格式：镜头标题 | 配方(${VALID_SHOT_KINDS.join('/')}) | 旁白一句话`,
        messages: [{ role: 'user', content: `主题: ${topic || scriptData?.title || 'AI短片'}` }],
        temperature: 0.3,
        maxTokens: 500,
      })
      const lines = String(res?.text || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.includes('|'))
      if (lines.length >= 2) {
        const shots = lines.slice(0, 6).map((l, idx) => {
          const [rawTitle, rawRecipe, rawNarr] = l.split('|').map((x) => x.trim())
          const recipe = VALID_SHOT_KINDS.find((k) => rawRecipe?.includes(k)) || VALID_SHOT_KINDS[(idx % 6) + 1]
          return {
            title: rawTitle || `镜头 ${idx + 1}`,
            narration: rawNarr || rawTitle || '',
            recipe,
            durationSec: 4.2,
          }
        })
        chosenPlan = repairPromoPlanRules({ shots, targetPlatform }, { topic, style, assetsManifest, existingScript: scriptData })
        degradationTier = 2
        trace.push({ tier: 2, name: 'Sectioned Prompt', ok: true })
      } else {
        trace.push({ tier: 2, name: 'Sectioned Prompt', ok: false, reason: '未返回标准分栏行' })
      }
    } catch (err) {
      trace.push({ tier: 2, name: 'Sectioned Prompt', ok: false, reason: err?.message || String(err) })
    }
  }

  // Tier 3: Ultra-simple A/B/C Multiple Choice Token for weak/tiny models
  if (!chosenPlan && (!forceTierForTest || forceTierForTest <= 3) && typeof callLlmChatFn === 'function') {
    try {
      const res = await callLlmChatFn({
        system: '只回复一个字母：A=科技锐利推拉风，B=电影稳重横移风，C=高能卡点快闪风。',
        messages: [{ role: 'user', content: `主题：${topic || scriptData?.title || '产品发布'}` }],
        temperature: 0.1,
        maxTokens: 20,
      })
      const ch = String(res?.text || '').toUpperCase().match(/\b([ABC])\b/)?.[1]
      if (ch) {
        const presetStyle = ch === 'B' ? 'cinematic' : ch === 'C' ? 'energetic' : 'tech'
        const recipeSeq =
          ch === 'B'
            ? ['pull_out', 'pan_across', 'face_focus', 'freeze_end']
            : ch === 'C'
              ? ['impact', 'push_in', 'pan_down', 'freeze_end']
              : ['pull_out', 'push_in', 'hold', 'freeze_end']
        const baseScenes = Array.isArray(scriptData?.scenes) && scriptData.scenes.length > 0 ? scriptData.scenes : null
        const shots = (baseScenes || recipeSeq).map((item, idx) => ({
          title: baseScenes ? item.title : `${topic || '重点展示'} ${idx + 1}`,
          narration: baseScenes ? item.narration : `${topic || '项目特性'} 核心解读第 ${idx + 1} 幕。`,
          recipe: recipeSeq[idx % recipeSeq.length],
          durationSec: baseScenes ? item.durationSec : 4.2,
        }))
        chosenPlan = repairPromoPlanRules(
          { style: presetStyle, targetPlatform, shots },
          { topic, style: presetStyle, assetsManifest, existingScript: scriptData },
        )
        degradationTier = 3
        trace.push({ tier: 3, name: `MCQ Choice (${ch})`, ok: true })
      } else {
        trace.push({ tier: 3, name: 'MCQ Choice', ok: false, reason: '模型未返回 A/B/C 单字母' })
      }
    } catch (err) {
      trace.push({ tier: 3, name: 'MCQ Choice', ok: false, reason: err?.message || String(err) })
    }
  }

  // Tier 4: Deterministic Code Rules Fallback (zero failure guarantee)
  if (!chosenPlan) {
    chosenPlan = repairPromoPlanRules(
      { targetPlatform, style },
      { topic, style, assetsManifest, existingScript: scriptData },
    )
    degradationTier = 4
    trace.push({ tier: 4, name: 'Deterministic Rule Engine Fallback', ok: true })
  }

  const validation = validatePromoPlan(chosenPlan)
  const resolved = resolvePlanSchedule(chosenPlan, { ...scriptData, targetPlatform })

  if (projectDir) {
    const absDir = resolve(projectDir)
    mkdirSync(absDir, { recursive: true })
    writeFileSync(join(absDir, 'plan.json'), JSON.stringify(chosenPlan, null, 2) + '\n', 'utf8')
    writeFileSync(join(absDir, 'plan.resolved.json'), JSON.stringify(resolved, null, 2) + '\n', 'utf8')
  }

  return {
    ok: validation.ok,
    plan: chosenPlan,
    resolved,
    degradationTier,
    tierLabel:
      degradationTier === 1
        ? 'Tier 1 · 完整 JSON Schema'
        : degradationTier === 2
          ? 'Tier 2 · 分段轻量化降级'
          : degradationTier === 3
            ? 'Tier 3 · A/B/C 选择题降级'
            : 'Tier 4 · 纯规则代码引擎兜底',
    trace,
  }
}
