import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import {
  probeAudioDuration,
  readScriptJson,
  resolveVideoDimensions,
  writeScriptJson,
} from '@dsh-video/shared'
import { executeGenerateSpeech, matchAllScenesInScript } from '@dsh-video/tool-local-tts'
import { executeVideoLint, executeVideoRender, runTypecheckOnProject, scanAiGeneratedCodeSandbox } from '@dsh-video/tool-video-suite'
import { importAssets, readAssets } from './asset-manager.js'
import { buildBeatGrid, mixVideoAudio } from './audio-synth.js'
import { generateAiCodedBgmTrack, synthesizeTtsEngineAudioCue } from './audio-coder.js'
import { runSchemaDirectorWithDegradation } from './plan-schema.js'
import { masterVoiceTracks } from './voice-master.js'
import { buildRichHtmlVideo, resolvePalette } from './html-generator.js'
import { callLlmChat, extractJsonFromLlmText, resolveLlmConfig } from './llm-client.js'
import { syncRemotionPublicAssets, writeRemotionProjectFiles } from './remotion-generator.js'
import {
  buildDirectorPromptPackage,
  buildHtmlCoderSkillsPrompt,
  buildRemotionCoderSkillsPrompt,
  writeShotcraftRemotionLib,
} from './shotcraft-lib.js'

function safeRelCodePath(rawPath, engine) {
  const clean = normalize(String(rawPath || '').replace(/\\/g, '/'))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!clean || clean.includes('..') || /^[A-Za-z]:/.test(clean)) return ''
  if (engine === 'remotion') {
    if (clean === 'src/index.ts' || clean === 'src/Root.tsx' || clean === 'src/lib/shotcraft.tsx') return ''
    if (!clean.startsWith('src/') || !/\.(tsx|ts|jsx|js)$/.test(clean)) return ''
    return clean
  }
  if (clean === 'index.html') return 'index.html'
  return ''
}

export function snapshotProjectVersion(projectDir, label = 'auto') {
  const absDir = resolve(projectDir)
  const histRoot = join(absDir, 'history')
  mkdirSync(histRoot, { recursive: true })
  const stamp = `${Date.now()}-${label.replace(/[^a-z0-9_-]/gi, '')}`
  const snapDir = join(histRoot, `v-${stamp}`)
  mkdirSync(snapDir, { recursive: true })

  for (const item of ['script.json', 'index.html', 'src', 'output/ai_build_log.json']) {
    const src = join(absDir, item)
    const dst = join(snapDir, item)
    if (existsSync(src)) {
      mkdirSync(dirname(dst), { recursive: true })
      cpSync(src, dst, { recursive: true })
    }
  }
  return snapDir
}

export function getAiCodingHistory(projectDir) {
  const absDir = resolve(projectDir)
  const histRoot = join(absDir, 'history')
  if (!existsSync(histRoot)) return []
  return readdirSync(histRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('v-') && !d.name.endsWith('-restored'))
    .map((d) => d.name)
    .sort()
    .reverse()
}

export function rollbackAiVersion(projectDir) {
  const absDir = resolve(projectDir)
  const list = getAiCodingHistory(absDir)
  if (list.length === 0) {
    return { ok: false, message: '暂无可供撤回的历史版本快照。' }
  }
  const latest = list[0]
  const snapDir = join(absDir, 'history', latest)
  for (const item of ['script.json', 'index.html', 'output/ai_build_log.json']) {
    const src = join(snapDir, item)
    if (existsSync(src)) {
      const dst = join(absDir, item)
      mkdirSync(dirname(dst), { recursive: true })
      cpSync(src, dst, { force: true })
    }
  }
  const snapSrc = join(snapDir, 'src')
  if (existsSync(snapSrc)) {
    const dstSrc = join(absDir, 'src')
    if (existsSync(dstSrc)) rmSync(dstSrc, { recursive: true, force: true })
    cpSync(snapSrc, dstSrc, { recursive: true, force: true })
  }
  try {
    rmSync(snapDir, { recursive: true, force: true })
  } catch {}

  const reloaded = existsSync(join(absDir, 'script.json')) ? readScriptJson(absDir).data : null
  if (reloaded) {
    syncRemotionPublicAssets(absDir, reloaded)
    writeShotcraftRemotionLib(absDir)
  }
  return {
    ok: true,
    restoredSnapshot: latest,
    remainingSnapshots: Math.max(0, list.length - 1),
    script: reloaded,
  }
}

function injectScriptDataIntoHtml(html, scriptData) {
  const serialized = JSON.stringify(scriptData, null, 2)
  const pattern = /(<script\s+id=["']dsh-script-data["']\s+type=["']application\/json["']>)([\s\S]*?)(<\/script>)/i
  if (pattern.test(html)) {
    return html.replace(pattern, `$1\n${serialized}\n$3`)
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<script id="dsh-script-data" type="application/json">\n${serialized}\n</script>\n</head>`)
  }
  return `${html}\n<script id="dsh-script-data" type="application/json">\n${serialized}\n</script>`
}

function writeRemotionBootstrap(projectDir) {
  const absDir = resolve(projectDir)
  const srcDir = join(absDir, 'src')
  mkdirSync(srcDir, { recursive: true })
  writeShotcraftRemotionLib(absDir)
  writeFileSync(
    join(srcDir, 'index.ts'),
    `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\n\nregisterRoot(RemotionRoot);\n`,
    'utf8',
  )
  writeFileSync(
    join(srcDir, 'Root.tsx'),
    `import React from 'react';
import { Composition } from 'remotion';
import scriptData from '../script.json';
import { VideoComposition } from './VideoComposition';

export const RemotionRoot: React.FC = () => {
  const sData: any = scriptData;
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={Math.max(30, Number(sData.totalDurationInFrames) || 300)}
      fps={Number(sData.fps) || 30}
      width={Number(sData.width) || 1920}
      height={Number(sData.height) || 1080}
    />
  );
};
`,
    'utf8',
  )
}

function normalizeThemeFromPlan(planTheme, style) {
  const base = resolvePalette({ style: style || 'tech' })
  if (!planTheme || typeof planTheme !== 'object') return base
  return {
    ...base,
    background: planTheme.bgPrimary || planTheme.background || base.background,
    surface: planTheme.bgSecondary || planTheme.surface || base.surface,
    textPrimary: planTheme.textPrimary || base.textPrimary,
    textSecondary: planTheme.textMuted || planTheme.textSecondary || base.textSecondary,
    accent: planTheme.accentPrimary || planTheme.accent || base.accent,
    accent2: planTheme.accentSecondary || planTheme.accent2 || base.accent2,
    gold: planTheme.accentSecondary || planTheme.gold || base.gold,
  }
}

async function runCodeAutoRepairLoop({
  absDir,
  engine,
  systemPrompt,
  initialFiles,
  lockedScript,
  maxRepairRounds,
  llmConfig,
  fetchImpl,
  onProgress,
}) {
  let filesMap = { ...initialFiles }
  const repairHistory = []
  const hasMasterAudio =
    existsSync(join(absDir, 'public', 'master-audio.wav')) ||
    existsSync(join(absDir, 'output', 'master-audio.wav'))

  for (let round = 0; round <= maxRepairRounds; round++) {
    // Filter allowed paths cleanly
    const cleanMap = {}
    for (const [k, v] of Object.entries(filesMap)) {
      const safe = safeRelCodePath(k, engine)
      if (safe) cleanMap[safe] = String(v || '')
    }

    const sandbox = scanAiGeneratedCodeSandbox(cleanMap, { engine, hasMasterAudio })

    // Persist candidate files to disk so lint + tsc run against the exact workspace
    for (const [relPath, code] of Object.entries(cleanMap)) {
      const outPath = join(absDir, relPath)
      mkdirSync(dirname(outPath), { recursive: true })
      const finalCode = relPath === 'index.html' ? injectScriptDataIntoHtml(code, lockedScript) : code
      writeFileSync(outPath, finalCode, 'utf8')
      cleanMap[relPath] = finalCode
    }

    if (engine === 'remotion') {
      writeRemotionBootstrap(absDir)
    }

    const lint = await executeVideoLint({ projectDir: absDir, engine })
    const tsc = engine === 'remotion' ? await runTypecheckOnProject(absDir) : { ok: true, errors: [] }

    const allErrors = [
      ...(sandbox.errors || []),
      ...(lint.errors || []),
      ...(tsc.errors || []),
    ]

    repairHistory.push({
      round,
      ok: allErrors.length === 0,
      errorCount: allErrors.length,
      errors: allErrors,
      filesChecked: Object.keys(cleanMap),
    })

    if (allErrors.length === 0) {
      return { ok: true, files: cleanMap, repairHistory, lint, tsc }
    }

    if (round >= maxRepairRounds) {
      return {
        ok: false,
        files: cleanMap,
        repairHistory,
        errors: allErrors,
      }
    }

    onProgress?.(
      'repair',
      Math.min(76, 58 + (round + 1) * 6),
      `代码质检发现 ${allErrors.length} 处问题，大模型自动修复中（第 ${round + 1}/${maxRepairRounds} 轮）...`,
    )

    const repairPrompt = JSON.stringify(
      {
        task: `请修复以下 ${engine === 'remotion' ? 'Remotion TSX' : 'HyperFrames HTML'} 代码编译与规范错误`,
        errors: allErrors,
        currentFiles: cleanMap,
        strictReminder:
          engine === 'remotion'
            ? '必须返回严格 JSON { "files": { ... } }。严禁出现 CSS transition: / @keyframes / Math.random，确保 export const VideoComposition 存在且 tsc --noEmit 零错误。'
            : '必须返回严格 JSON { "files": { "index.html": "..." } }。保留 <script id="dsh-script-data"> 与 window.__seekToFrame / window.__totalFrames。',
      },
      null,
      2,
    )

    const fixReply = await callLlmChat({
      overrideConfig: llmConfig,
      fetchImpl,
      system: systemPrompt,
      messages: [{ role: 'user', content: repairPrompt }],
      temperature: 0.25,
    })
    const parsedFix = extractJsonFromLlmText(fixReply.text)
    if (parsedFix?.files && typeof parsedFix.files === 'object') {
      filesMap = { ...cleanMap, ...parsedFix.files }
    }
  }
}

/**
 * Full AI Model-Agnostic Coding Video Studio Pipeline:
 * Draft Ref (optional) -> LLM Director & Audio Composer -> Local IndexTTS-2 -> Lock Timing ->
 * LLM Code Writer -> Sandbox + Lint + `tsc --noEmit` (up to N auto-repair rounds) -> Render + FFmpeg QA.
 */
export async function runAiStudioPipeline(options = {}) {
  const {
    projectDir,
    topic = '',
    userPrompt = '',
    sources,
    engine = 'remotion',
    creationMode = 'ai-coded',
    bgmMode = 'llm-coded',
    bgmTtsPrompt = '',
    uploadedBgmPath = '',
    targetPlatform = 'universal',
    aspectRatio = 'auto',
    quality = '1080p',
    width,
    height,
    voiceId = 'auto',
    ttsEngine,
    allowPlaceholder = false,
    fps: requestedFps = 30,
    aiBadge = true,
    useDraftReference = true,
    render = true,
    llmOverride = {},
    fetchImpl,
    onProgress,
  } = options

  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)
  mkdirSync(absDir, { recursive: true })

  const llmCfg = resolveLlmConfig(llmOverride)
  const repairRounds = Number(options.maxRepairRounds) || llmCfg.maxRepairRounds || 3
  const emit = (stage, progress, message) => {
    onProgress?.({ stage, progress, message })
  }

  emit('init', 5, '1/7 正在准备工程目录与素材清单...')
  if (sources && (Array.isArray(sources) ? sources.length > 0 : true)) {
    await importAssets({ projectDir: absDir, sources })
  }

  let existingScript = null
  if (existsSync(join(absDir, 'script.json'))) {
    try {
      existingScript = readScriptJson(absDir).data
    } catch {}
  }

  // Backup prior version so user can always roll back
  if (existingScript) {
    snapshotProjectVersion(absDir, 'pre-ai')
  }

  const assetsManifest = readAssets(absDir)
  const visuals = (assetsManifest.items || []).filter((i) => i.type === 'image' || i.type === 'video')
  const importedMusic = (assetsManifest.items || []).filter((i) => i.role === 'music')
  const coreTopic = topic || existingScript?.topic || existingScript?.title || 'AI 视觉大片'
  const resolvedPlatform = targetPlatform || existingScript?.targetPlatform || 'universal'
  const resolvedBgmMode = bgmMode || existingScript?.audioSpec?.bgmMode || 'llm-coded'
  const resolvedCreationMode = creationMode === 'schema-plan' ? 'schema-plan' : 'ai-coded'

  const baseDims = resolveVideoDimensions({
    aspectRatio,
    quality,
    width,
    height,
    topic: `${coreTopic} ${userPrompt}`,
    assets: visuals,
  })

  let archRes = { model: llmCfg.model || 'rule-engine', protocol: llmCfg.protocol || 'rule' }
  let plan = null
  let schemaMeta = null

  if (resolvedCreationMode === 'schema-plan') {
    emit('architect', 14, '2/7 正在执行 Schema 分镜调度 (含 4 档强弱模型容错降级)...')
    const schemaRes = await runSchemaDirectorWithDegradation({
      projectDir: absDir,
      topic: coreTopic,
      style: existingScript?.style || 'tech',
      targetPlatform: resolvedPlatform,
      scriptData: existingScript || {},
      assetsManifest,
      callLlmChatFn: async (p) =>
        callLlmChat({
          overrideConfig: llmCfg,
          fetchImpl,
          ...p,
        }),
    })
    schemaMeta = {
      version: schemaRes.plan.version,
      degradationTier: schemaRes.degradationTier,
      tierLabel: schemaRes.tierLabel,
      trace: schemaRes.trace,
    }
    plan = {
      title: schemaRes.plan.title,
      style: schemaRes.plan.style,
      audioSpec: { mood: schemaRes.plan.style, bpm: schemaRes.plan.bpm, bgmMode: resolvedBgmMode },
      scenes: schemaRes.resolved.resolvedShots.map((s) => ({
        id: s.id,
        title: s.title,
        narration: s.narration,
        emotion: s.emotion,
        layout: s.layout,
        kenBurns: s.kenBurns,
        transition: s.transition,
        highlights: s.highlights,
        durationSec: s.durationSec,
        assetPaths: (s.media || []).map((m) => m.path),
      })),
    }
  } else {
    emit('architect', 14, `2/7 正在调用大模型 (${llmCfg.model || '未指定模型'}) 构思分镜、文案与定制配乐...`)
    const directorPkg = buildDirectorPromptPackage({
      topic: coreTopic,
      userPrompt: userPrompt || existingScript?.goal || coreTopic,
      aspectRatio: baseDims.aspectRatio,
      quality: baseDims.quality,
      width: baseDims.width,
      height: baseDims.height,
      targetEngine: engine,
      assets: visuals,
      draftScript: useDraftReference ? existingScript : null,
    })

    archRes = await callLlmChat({
      overrideConfig: llmCfg,
      fetchImpl,
      system: directorPkg.system,
      messages: [{ role: 'user', content: directorPkg.user }],
      temperature: 0.5,
    })
    plan = extractJsonFromLlmText(archRes.text)
    if (!Array.isArray(plan?.scenes) || plan.scenes.length === 0) {
      throw new Error('大模型未返回有效的分镜列表 (scenes)，请检查模型配置或重试。')
    }
  }

  // Allow LLM to refine ratio if user chose 'auto'
  const finalDims =
    aspectRatio === 'auto' && plan.recommendedAspectRatio
      ? resolveVideoDimensions({
          aspectRatio: plan.recommendedAspectRatio,
          quality,
          topic: coreTopic,
          assets: visuals,
        })
      : baseDims

  const theme = normalizeThemeFromPlan(plan.theme, plan.style || existingScript?.style || 'tech')
  const bpm = Number(plan?.audioSpec?.bpm) || 118
  const fps = Number(requestedFps) || existingScript?.fps || 30

  // Map planned scenes preserving matching Draft WAVs when narration matches
  const existingById = new Map((existingScript?.scenes || []).map((s) => [s.id, s]))
  const plannedScenes = plan.scenes.map((sc, idx) => {
    const id = sc.id || `scene-${String(idx + 1).padStart(2, '0')}`
    const prev = existingById.get(id)
    const narration = String(sc.narration || '').trim() || `第 ${idx + 1} 幕`
    const chosenVoice = voiceId && voiceId !== 'auto' ? voiceId : prev?.voiceId || 'auto'
    const canReuseWav =
      prev &&
      prev.narration === narration &&
      (voiceId === 'auto' || prev.voiceId === voiceId) &&
      prev.audioFile &&
      existsSync(join(absDir, prev.audioFile))

    const assetPaths = Array.isArray(sc.assetPaths) ? sc.assetPaths : prev?.assetPaths || []
    const matchedMedia = assetPaths
      .map((p) => {
        const hit = visuals.find((v) => v.path === p || v.name === p)
        return hit ? { assetId: hit.id, path: hit.path, webPath: hit.webPath || '', type: hit.type } : { path: String(p), type: 'image' }
      })
      .filter((m) => m.path)
    if (matchedMedia.length === 0 && visuals.length > 0) {
      const pick = visuals[idx % visuals.length]
      matchedMedia.push({ assetId: pick.id, path: pick.path, webPath: pick.webPath || '', type: pick.type })
    }

    const estDur = Number(sc.durationSec) > 1 ? Number(sc.durationSec) : Math.max(3.8, Number((narration.length / 4.2 + 1.2).toFixed(2)))

    return {
      id,
      index: idx + 1,
      title: String(sc.title || `分镜 ${idx + 1}`),
      shotType: sc.shotType || 'hero-title',
      headline: sc.headline || sc.title || '',
      kicker: sc.kicker || `SCENE 0${idx + 1}`,
      metrics: Array.isArray(sc.metrics) ? sc.metrics : [],
      motionNotes: sc.motionNotes || '',
      narration,
      emotion: sc.emotion || '平静',
      role: sc.role || 'narrator',
      voiceId: chosenVoice,
      media: matchedMedia,
      assetPaths: matchedMedia.map((m) => m.path),
      sfxCues: Array.isArray(sc.sfxCues) ? sc.sfxCues : [],
      visualPrompt: sc.motionNotes || sc.title || '',
      audioFile: canReuseWav ? prev.audioFile : '',
      durationSec: canReuseWav ? prev.durationSec : estDur,
    }
  })

  const preTtsScript = {
    ...(existingScript || {}),
    authoringMode: resolvedCreationMode === 'schema-plan' ? 'schema-plan' : 'ai-coded',
    creationMode: resolvedCreationMode,
    targetPlatform: resolvedPlatform,
    title: plan.title || existingScript?.title || coreTopic,
    topic: coreTopic,
    style: plan.style || existingScript?.style || 'tech',
    engine: engine === 'remotion' ? 'remotion' : 'html',
    fps,
    width: finalDims.width,
    height: finalDims.height,
    aspectRatio: finalDims.aspectRatio,
    requestedAspectRatio: finalDims.requestedAspectRatio,
    quality: finalDims.quality,
    dimensionReason: finalDims.reason,
    aiBadge: aiBadge !== false,
    voiceMode: voiceId && voiceId !== 'auto' ? 'manual' : 'auto',
    defaultVoiceId: voiceId || 'auto',
    theme,
    audioSpec: { ...(plan.audioSpec || {}), bgmMode: resolvedBgmMode },
    bgmMode: resolvedBgmMode,
    bgm: {
      enabled: true,
      mode: resolvedBgmMode,
      mood: plan?.audioSpec?.mood || 'tech',
      bpm,
      volume: Number(plan?.audioSpec?.volume) || 0.28,
      uploadedPath: uploadedBgmPath || importedMusic[0]?.path || '',
      path: resolvedBgmMode === 'uploaded' ? (uploadedBgmPath || importedMusic[0]?.path || '') : '',
      source: resolvedBgmMode === 'uploaded' && (uploadedBgmPath || importedMusic.length > 0) ? 'user-imported' : resolvedBgmMode,
    },
    scenes: plannedScenes,
  }

  writeScriptJson(absDir, preTtsScript)
  matchAllScenesInScript(absDir, { voiceId: voiceId || 'auto', forceAuto: voiceId === 'auto' })
  let midScript = readScriptJson(absDir).data

  emit('tts', 28, '3/7 正在通过本地 IndexTTS-2.5 音色库合成真人配音...')
  for (let i = 0; i < (midScript.scenes || []).length; i++) {
    const s = midScript.scenes[i]
    const reused = plannedScenes[i]?.audioFile && existsSync(join(absDir, plannedScenes[i].audioFile))
    if (reused) {
      const measured = await probeAudioDuration(join(absDir, s.audioFile), fps)
      s.durationSec = Math.max(2.0, Number((measured.durationSec + 0.55).toFixed(4)))
      s.durationInFrames = Math.max(1, Math.ceil(s.durationSec * fps))
      continue
    }
    await executeGenerateSpeech({
      text: s.narration,
      emotion: s.emotion || '平静',
      voiceId: s.voiceId || voiceId || 'auto',
      engine: ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts25',
      fps,
      outputPath: join(absDir, 'audio', `${s.id}.wav`),
      scriptPath: absDir,
      sceneId: s.id,
      allowPlaceholder,
    })
  }

  emit('master', 38, `4/7 正在调用大模型 (${llmCfg.model}) 执行人声母带修音与 LUFS 均衡...`)
  const masteringReport = await masterVoiceTracks({
    projectDir: absDir,
    useLlm: true,
    llmOverride: llmCfg,
    fetchImpl,
  })

  // Re-lock beat grid + full timing contract after ffprobe + vocal mastering backfills durations
  let lockedScript = readScriptJson(absDir).data
  const grid = buildBeatGrid(lockedScript.totalDurationSec || 12, bpm)
  lockedScript.bgm = { ...(lockedScript.bgm || {}), beats: grid.beats.map((b) => b.time), bpm, mode: resolvedBgmMode }

  let bgmCoderInfo = { mode: resolvedBgmMode, status: 'ok' }
  if (resolvedBgmMode === 'llm-coded') {
    emit('audio', 44, `5/7 正在让大模型 (${llmCfg.model || 'LLM'}) 编写纯数学 DSP 配乐代码...`)
    try {
      const coderAudioRes = await generateAiCodedBgmTrack({
        projectDir: absDir,
        script: lockedScript,
        callLlmChatFn: async (p) =>
          callLlmChat({
            overrideConfig: llmCfg,
            fetchImpl,
            ...p,
          }),
      })
      lockedScript.bgm.path = coderAudioRes.relWavPath
      lockedScript.bgm.source = 'llm-coded'
      lockedScript.bgm.codeScriptPath = coderAudioRes.relScriptPath
      bgmCoderInfo = { mode: 'llm-coded', status: 'ok', summary: coderAudioRes.summary, scriptPath: coderAudioRes.relScriptPath }
    } catch (err) {
      bgmCoderInfo = { mode: 'llm-coded', status: 'fallback-dsp', error: err?.message || String(err) }
    }
  } else if (resolvedBgmMode === 'tts-engine') {
    emit('audio', 44, '5/7 正在通过 IndexTTS-2.5 配音引擎声学塑形生成氛围 BGM...')
    try {
      const ttsBgmRes = await synthesizeTtsEngineAudioCue({
        projectDir: absDir,
        promptText: bgmTtsPrompt || `${coreTopic} 科技光影沉浸声景`,
        voiceId,
        mode: 'bgm-pad',
        durationSec: lockedScript.totalDurationSec || 12,
      })
      lockedScript.bgm.path = ttsBgmRes.relWavPath
      lockedScript.bgm.source = 'tts-engine'
      bgmCoderInfo = { mode: 'tts-engine', status: 'ok', voiceName: ttsBgmRes.voiceName }
    } catch (err) {
      bgmCoderInfo = { mode: 'tts-engine', status: 'fallback-dsp', error: err?.message || String(err) }
    }
  } else if (resolvedBgmMode === 'uploaded') {
    const pickUp = uploadedBgmPath || lockedScript?.bgm?.uploadedPath || importedMusic[0]?.path || ''
    if (pickUp) {
      lockedScript.bgm.uploadedPath = pickUp
      lockedScript.bgm.path = pickUp
      lockedScript.bgm.source = 'user-imported'
      bgmCoderInfo = { mode: 'uploaded', status: 'ok', path: pickUp }
    }
  }

  lockedScript = writeScriptJson(absDir, lockedScript).data

  // Force re-synthesis of bespoke DSP BGM when neither uploaded nor custom WAV overrides
  const genBgmPath = join(absDir, 'audio', 'bgm-generated.wav')
  if (lockedScript.bgm.source !== 'user-imported' && lockedScript.bgm.source !== 'llm-coded' && lockedScript.bgm.source !== 'tts-engine' && existsSync(genBgmPath)) {
    try {
      unlinkSync(genBgmPath)
    } catch {}
  }

  emit('audio', 48, '5/7 正在混音配乐与音效母带 (output/master-audio.wav)...')
  await mixVideoAudio({
    projectDir: absDir,
    script: lockedScript,
    assetsManifest,
    outputPath: join(absDir, 'output', 'master-audio.wav'),
  })
  syncRemotionPublicAssets(absDir, lockedScript)

  const timingContract = {
    fps: lockedScript.fps,
    width: lockedScript.width,
    height: lockedScript.height,
    aspectRatio: lockedScript.aspectRatio,
    totalDurationSec: lockedScript.totalDurationSec,
    totalDurationInFrames: lockedScript.totalDurationInFrames,
    aiBadge: Boolean(lockedScript.aiBadge),
    scenes: (lockedScript.scenes || []).map((s) => ({
      id: s.id,
      index: s.index,
      title: s.title,
      startFrame: s.startFrame,
      durationInFrames: s.durationInFrames,
      durationSec: s.durationSec,
      assetPaths: s.assetPaths || [],
      publicAssetFiles: (s.media || []).map((m) => String(m.path || '').replace(/^\/+/, '').replace(/\\/g, '/')),
      subtitles: s.subtitles || [],
    })),
  }
  mkdirSync(join(absDir, 'output'), { recursive: true })
  writeFileSync(join(absDir, 'output', 'timing-contract.json'), JSON.stringify(timingContract, null, 2) + '\n', 'utf8')

  let checkResult = null
  if (resolvedCreationMode === 'schema-plan') {
    emit('coder', 58, '6/7 正在将 promo-plan/1 编译为确定性帧级安全工程...')
    if (engine === 'remotion') {
      writeRemotionProjectFiles(absDir, lockedScript, { rebuildTemplate: true })
    } else {
      writeFileSync(join(absDir, 'index.html'), buildRichHtmlVideo(lockedScript), 'utf8')
      writeScriptJson(absDir, lockedScript)
    }
    const lintCheck = await executeVideoLint({ projectDir: absDir, mode: engine })
    checkResult = {
      ok: lintCheck.ok,
      files: { [engine === 'remotion' ? 'src/VideoComposition.tsx' : 'index.html']: 'compiled-from-promo-plan' },
      lintResult: lintCheck,
      repairHistory: [{ round: 0, lintOk: lintCheck.ok, source: 'schema-plan' }],
      errors: lintCheck.errors || [],
    }
  } else {
    emit('coder', 56, `6/7 正在让大模型 (${llmCfg.model}) 编写定制 ${engine === 'remotion' ? 'Remotion TSX' : 'HyperFrames HTML'} 视频源码...`)
    const coderPkg =
      engine === 'remotion'
        ? buildRemotionCoderSkillsPrompt({
            plan,
            timingContract,
            width: lockedScript.width,
            height: lockedScript.height,
            aspectRatio: lockedScript.aspectRatio,
          })
        : buildHtmlCoderSkillsPrompt({
            plan,
            timingContract,
            width: lockedScript.width,
            height: lockedScript.height,
            aspectRatio: lockedScript.aspectRatio,
          })

    const codeRes = await callLlmChat({
      overrideConfig: llmCfg,
      fetchImpl,
      system: coderPkg.system,
      messages: [{ role: 'user', content: coderPkg.user }],
      temperature: 0.35,
    })
    const parsedCode = extractJsonFromLlmText(codeRes.text)
    const initialFiles = parsedCode?.files && typeof parsedCode.files === 'object' ? parsedCode.files : {}

    checkResult = await runCodeAutoRepairLoop({
      absDir,
      engine,
      systemPrompt: coderPkg.system,
      initialFiles,
      lockedScript,
      maxRepairRounds: repairRounds,
      llmConfig: llmCfg,
      fetchImpl,
      onProgress: emit,
    })
  }

  if (!checkResult.ok) {
    const buildLog = {
      ok: false,
      engine,
      creationMode: resolvedCreationMode,
      model: archRes.model,
      repairHistory: checkResult.repairHistory,
      errors: checkResult.errors,
      builtAt: new Date().toISOString(),
    }
    writeFileSync(join(absDir, 'output', 'ai_build_log.json'), JSON.stringify(buildLog, null, 2) + '\n', 'utf8')
    throw new Error(`AI 代码生成经 ${repairRounds} 轮自动修复后仍未通过质检: ${(checkResult.errors || []).slice(0, 3).join(' | ')}`)
  }

  // Stamp AI authoring metadata onto script.json
  lockedScript.authoringMode = resolvedCreationMode === 'schema-plan' ? 'schema-plan' : 'ai-coded'
  lockedScript.aiMeta = {
    model: archRes.model,
    protocol: archRes.protocol,
    creationMode: resolvedCreationMode,
    bgmMode: resolvedBgmMode,
    bgmCoderInfo,
    schemaMeta,
    repairRoundsUsed: Math.max(0, checkResult.repairHistory.length - 1),
    generatedFiles: Object.keys(checkResult.files),
    builtAt: new Date().toISOString(),
  }
  writeScriptJson(absDir, lockedScript)

  const buildLog = {
    ok: true,
    engine,
    creationMode: resolvedCreationMode,
    bgmMode: resolvedBgmMode,
    bgmCoderInfo,
    schemaMeta,
    model: archRes.model,
    protocol: archRes.protocol,
    aspectRatio: lockedScript.aspectRatio,
    resolution: `${lockedScript.width}x${lockedScript.height}`,
    dimensionReason: lockedScript.dimensionReason,
    repairRoundsUsed: Math.max(0, checkResult.repairHistory.length - 1),
    repairHistory: checkResult.repairHistory,
    generatedFiles: Object.keys(checkResult.files),
    audioSpec: lockedScript.audioSpec || null,
    voiceMastering: masteringReport
      ? {
          mode: masteringReport.mode,
          model: masteringReport.model,
          engineerSummary: masteringReport.engineerSummary,
          scenesCount: masteringReport.scenesCount,
        }
      : null,
    builtAt: new Date().toISOString(),
  }
  writeFileSync(join(absDir, 'output', 'ai_build_log.json'), JSON.stringify(buildLog, null, 2) + '\n', 'utf8')

  let renderResult = null
  if (render !== false) {
    emit('render', 78, '7/7 正在渲染成片并执行 FFmpeg 自动黑屏/响度质检...')
    renderResult = await executeVideoRender({
      projectDir: absDir,
      engine,
      onProgress: ({ frame, totalFrames, pct }) =>
        emit('render', Math.min(97, 78 + Math.round(pct * 0.19)), `7/7 正在逐帧合成视频 (${frame}/${totalFrames} · ${pct}%)...`),
    })
  }

  emit('done', 100, 'AI 编程创作完成，已完成代码编译、逐帧渲染与音画质检！')
  return {
    ok: true,
    projectDir: absDir,
    engine,
    script: readScriptJson(absDir).data,
    buildLog,
    render: renderResult,
  }
}

/**
 * Natural-language surgical refinement on a scene or whole project, with history backup and auto-repair.
 */
export async function refineAiScene({
  projectDir,
  sceneId = '',
  instruction,
  llmOverride = {},
  fetchImpl,
  render = true,
  onProgress,
} = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  if (!instruction || !String(instruction).trim()) throw new Error('请填写对 AI 的修改意见')

  const absDir = resolve(projectDir)
  const script = readScriptJson(absDir).data
  const engine = script.engine === 'remotion' ? 'remotion' : 'html'
  const llmCfg = resolveLlmConfig(llmOverride)
  const emit = (stage, progress, message) => onProgress?.({ stage, progress, message })

  emit('backup', 10, '正在保存当前版本快照以支持一键撤回...')
  snapshotProjectVersion(absDir, 'pre-refine')

  // Gather current workspace source files
  const currentFiles = {}
  if (engine === 'remotion') {
    const srcDir = join(absDir, 'src')
    const walk = (dir, prefix = 'src') => {
      if (!existsSync(dir)) return
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const rel = `${prefix}/${ent.name}`
        if (ent.isDirectory() && ent.name !== 'lib') walk(join(dir, ent.name), rel)
        else if (!ent.isDirectory() && /\.(tsx|ts|jsx|js)$/.test(ent.name) && rel !== 'src/index.ts' && rel !== 'src/Root.tsx') {
          currentFiles[rel] = readFileSync(join(dir, ent.name), 'utf8')
        }
      }
    }
    walk(srcDir)
  } else if (existsSync(join(absDir, 'index.html'))) {
    currentFiles['index.html'] = readFileSync(join(absDir, 'index.html'), 'utf8')
  }

  emit('coder', 35, `大模型正在按您的要求精修 (${sceneId || '全局'})...`)
  const system = `你是资深 ${engine === 'remotion' ? 'Remotion TSX' : 'HyperFrames HTML'} 视频创意工程师。
用户正在微调一个已有视频工程。请仅修改与用户需求相关的部分，输出严格 JSON：
{
  "files": { "相对路径": "完整更新后的源码" },
  "narrationUpdate": { "sceneId": "若需改口播词可填，否则省略" }
}
必须严格遵守原工程技术铁律（${engine === 'remotion' ? '禁止 CSS transition: / @keyframes / Math.random，导出 VideoComposition 且保留 <Audio src={staticFile("master-audio.wav")} />' : '保留 window.__seekToFrame / window.__totalFrames / <script id="dsh-script-data">'}）。`

  const user = JSON.stringify(
    {
      targetSceneId: sceneId || 'ALL',
      userInstruction: instruction,
      canvas: { width: script.width, height: script.height, fps: script.fps, totalDurationInFrames: script.totalDurationInFrames },
      scenesSummary: (script.scenes || []).map((s) => ({
        id: s.id,
        title: s.title,
        narration: s.narration,
        startFrame: s.startFrame,
        durationInFrames: s.durationInFrames,
      })),
      currentFiles,
    },
    null,
    2,
  )

  const res = await callLlmChat({
    overrideConfig: llmCfg,
    fetchImpl,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.3,
  })
  const parsed = extractJsonFromLlmText(res.text)
  const patchFiles = parsed?.files && typeof parsed.files === 'object' ? parsed.files : {}
  if (Object.keys(patchFiles).length === 0) {
    throw new Error('大模型未返回任何代码修改文件。')
  }

  // Optional narration update -> re-synthesize changed scene voice
  let updatedScript = script
  if (parsed?.narrationUpdate && typeof parsed.narrationUpdate === 'object') {
    for (const [sid, newNar] of Object.entries(parsed.narrationUpdate)) {
      const target = (updatedScript.scenes || []).find((s) => s.id === sid)
      if (target && newNar && String(newNar).trim() && String(newNar).trim() !== target.narration) {
        target.narration = String(newNar).trim()
        writeScriptJson(absDir, updatedScript)
        await executeGenerateSpeech({
          text: target.narration,
          emotion: target.emotion || '平静',
          voiceId: target.voiceId || 'auto',
          fps: updatedScript.fps || 30,
          outputPath: join(absDir, 'audio', `${target.id}.wav`),
          scriptPath: absDir,
          sceneId: target.id,
        })
      }
    }
    updatedScript = readScriptJson(absDir).data
  }

  const mergedFiles = { ...currentFiles, ...patchFiles }
  const checkRes = await runCodeAutoRepairLoop({
    absDir,
    engine,
    systemPrompt: system,
    initialFiles: mergedFiles,
    lockedScript: updatedScript,
    maxRepairRounds: llmCfg.maxRepairRounds || 3,
    llmConfig: llmCfg,
    fetchImpl,
    onProgress: emit,
  })

  if (!checkRes.ok) {
    throw new Error(`局部修改自动修复未通过质检: ${(checkRes.errors || []).slice(0, 3).join(' | ')}`)
  }

  updatedScript.authoringMode = 'ai-coded'
  updatedScript.aiMeta = {
    ...(updatedScript.aiMeta || {}),
    lastRefineInstruction: instruction,
    lastRefineAt: new Date().toISOString(),
  }
  writeScriptJson(absDir, updatedScript)

  let renderResult = null
  if (render !== false) {
    emit('render', 76, '正在重新渲染成片与质检...')
    renderResult = await executeVideoRender({
      projectDir: absDir,
      engine,
      onProgress: ({ frame, totalFrames, pct }) =>
        emit('render', Math.min(97, 76 + Math.round(pct * 0.2)), `重新渲染中 (${frame}/${totalFrames} · ${pct}%)...`),
    })
  }

  emit('done', 100, '精修完成！可随时对比或撤回上一版。')
  return {
    ok: true,
    projectDir: absDir,
    updatedFiles: Object.keys(patchFiles),
    repairHistory: checkRes.repairHistory,
    script: readScriptJson(absDir).data,
    render: renderResult,
  }
}
