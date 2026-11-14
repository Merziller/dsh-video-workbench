import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import {
  buildSentenceSubtitles,
  createAbortError,
  loadEnv,
  readScriptJson,
  resolveBinaries,
  runCommandRedirected,
  writeScriptJson,
} from '@dsh-video/shared'
import { executeGenerateSpeech, matchAllScenesInScript } from '@dsh-video/tool-local-tts'
import { executeGenerateAvatar } from '@dsh-video/tool-avatar'
import {
  executeVideoLint,
  executeVideoRender,
  executeVideoSnapshot,
  runTypecheckOnProject,
  scanAiGeneratedCodeSandbox,
} from '@dsh-video/tool-video-suite'
import { importAssets, readAssets } from './asset-manager.js'
import { planVideoFromAssets, syncProjectCodeFromScript } from './ai-director.js'
import { executeCurateAndEditAssets } from './media-editor.js'
import { generateAiCodedBgmTrack, generateAiCodedSfxCues, synthesizeTtsEngineAudioCue } from './audio-coder.js'
import { ensureProjectAudioAssets, mixVideoAudio } from './audio-synth.js'
import { buildHtmlCoderSkillsPrompt, buildRemotionCoderSkillsPrompt } from './shotcraft-lib.js'
import { callLlmChat, extractJsonFromLlmText, getSafeLlmConfigSummary } from './llm-client.js'
import { runSchemaDirectorWithDegradation } from './plan-schema.js'
import { writeRemotionProjectFiles } from './remotion-generator.js'
import { taskManager } from './task-manager.js'
import { masterVoiceTracks } from './voice-master.js'

function isDoneTask(run, taskId) {
  const t = run?.tasks?.find((x) => x.id === taskId)
  return Boolean(t && t.status === 'completed')
}

async function recomputeCumulativeTimeline(absDir) {
  const { data: script } = readScriptJson(absDir)
  const fps = Number(script.fps) || 30
  let cursorFrame = 0
  let totalSec = 0
  const allSubs = []

  for (let i = 0; i < (script.scenes || []).length; i++) {
    const sc = script.scenes[i]
    const durSec = Math.max(1.5, Number(sc.durationSec) || 4.0)
    const durFrames = Math.max(15, Number(sc.durationInFrames) || Math.ceil(durSec * fps))
    sc.startFrame = cursorFrame
    sc.durationInFrames = durFrames
    sc.durationSec = Number((durFrames / fps).toFixed(4))

    if (sc.narration) {
      const startOffsetSec = Number(sc.voiceLeadSec) || 0.3
      const voiceDur = Math.max(0.8, sc.voiceDurationSec || sc.durationSec - startOffsetSec - 0.35)
      sc.subtitles = buildSentenceSubtitles(sc.narration, startOffsetSec, voiceDur, fps, cursorFrame).map((sub) => ({
        ...sub,
        sceneId: sc.id,
      }))
      allSubs.push(...sc.subtitles)
    }

    cursorFrame += durFrames
    totalSec += sc.durationSec
  }

  script.subtitles = allSubs
  script.totalDurationInFrames = cursorFrame
  script.totalDurationSec = Number(totalSec.toFixed(4))
  return writeScriptJson(absDir, script).data
}

async function buildCombinedDryVoiceWav(absDir, script, signal, onChild) {
  const { ffmpeg } = resolveBinaries()
  const wavs = (script?.scenes || [])
    .map((sc) => sc.masteredAudioFile || sc.audioFile)
    .filter(Boolean)
    .map((rel) => (isAbsolute(rel) ? rel : resolve(absDir, rel)))
    .filter((p) => existsSync(p))

  if (wavs.length === 0) return ''
  const outDir = join(absDir, 'output', 'avatar')
  mkdirSync(outDir, { recursive: true })
  const outWav = join(outDir, 'driving-vocal.wav')
  if (wavs.length === 1) return wavs[0]

  const concatTxt = join(outDir, 'vocal-concat.txt')
  writeFileSync(
    concatTxt,
    wavs.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n',
    'utf8',
  )
  const res = await runCommandRedirected(
    ffmpeg,
    ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', outWav],
    { timeoutMs: 45_000, signal, onChild },
  )
  return res.code === 0 && existsSync(outWav) ? outWav : wavs[0]
}

async function executeMultiAgentRunner(run, helpers) {
  loadEnv()
  const { signal, onChild, waitIfPaused, updateTask, appendLog } = helpers
  const spec = run.spec || {}
  const absDir = resolve(spec.projectDir || run.projectDir)
  const mode = spec.mode === 'fast-draft' ? 'fast-draft' : 'ai-coded'
  const engine = spec.engine === 'remotion' ? 'remotion' : 'html'
  const style = spec.style || 'tech'
  const aspectRatio = spec.aspectRatio || 'auto'
  const quality = spec.quality || '1080p'
  const targetPlatform = spec.targetPlatform || 'universal'
  const bgmMode = spec.bgmMode || 'uploaded'
  const voiceId = spec.voiceId || 'auto'
  const speechTempo = Number(spec.speechTempo) || 1.0
  const allowPlaceholder = Boolean(spec.allowPlaceholder)
  const llmSummary = getSafeLlmConfigSummary()

  // Optional initial source import
  if (spec.sources && (Array.isArray(spec.sources) ? spec.sources.length > 0 : true)) {
    await importAssets({ projectDir: absDir, sources: spec.sources })
  }

  // =========================================================================
  // AGENT 1: 策划导演 Agent (director)
  // =========================================================================
  if (!isDoneTask(run, 't-director')) {
    await waitIfPaused('t-director')
    updateTask('t-director', {
      status: 'running',
      progress: 12,
      message: `策划导演 Agent 启动：正在整合主题「${spec.topic || '智能短片'}」与 Step 1 素材库...`,
    })

    const preserveExisting = Boolean(spec.preserveExistingScript && existsSync(join(absDir, 'script.json')))
    if (!preserveExisting) {
      await planVideoFromAssets({
        projectDir: absDir,
        topic: spec.topic || '',
        title: spec.title || spec.topic || '',
        style,
        engine,
        aspectRatio,
        quality,
        width: spec.width,
        height: spec.height,
        aiBadge: Boolean(spec.aiBadge),
        voiceId,
        goal: spec.userPrompt || '',
      })
    }

    if (signal.aborted) throw createAbortError()
    await waitIfPaused('t-director')

    if (mode === 'ai-coded' && llmSummary.configured && !spec.skipLlmDirector) {
      updateTask('t-director', {
        status: 'running',
        progress: 55,
        message: `策划导演 Agent 正在调用大模型 (${llmSummary.model}) 润色分镜口播文案与节奏曲线...`,
      })
      try {
        const curScript = readScriptJson(absDir).data
        const assetsManifest = readAssets(absDir)
        const schemaRes = await runSchemaDirectorWithDegradation({
          projectDir: absDir,
          topic: spec.topic || curScript.topic || curScript.title,
          style,
          targetPlatform,
          scriptData: curScript,
          assetsManifest,
          callLlmChatFn: (p) => callLlmChat({ ...p, signal }),
        })
        if (schemaRes?.resolved?.resolvedShots?.length >= 2) {
          const updatedScenes = curScript.scenes.map((oldSc, i) => {
            const shot = schemaRes.resolved.resolvedShots[i]
            if (!shot) return oldSc
            return {
              ...oldSc,
              title: shot.title || oldSc.title,
              narration: shot.narration || oldSc.narration,
              transition: shot.transition || oldSc.transition,
              durationSec: Number(shot.durationSec) || oldSc.durationSec,
            }
          })
          curScript.scenes = updatedScenes
          curScript.title = schemaRes.plan?.title || curScript.title
          curScript.targetPlatform = targetPlatform
          writeScriptJson(absDir, curScript)
          appendLog('director', `大模型导演调度完成 (${schemaRes.tierLabel || 'Schema Tier'})`)
        }
      } catch (err) {
        if (err?.name === 'AbortError' || signal.aborted) throw createAbortError()
        appendLog('director', `大模型导演增强已回退本地智能规划: ${err.message}`, 'warn')
      }
    }

    const sAfterDir = readScriptJson(absDir).data
    sAfterDir.targetPlatform = targetPlatform
    if (spec.avatarLayout) sAfterDir.avatarLayout = spec.avatarLayout
    writeScriptJson(absDir, sAfterDir)
    updateTask('t-director', {
      status: 'completed',
      progress: 100,
      message: `策划完成：${sAfterDir.scenes?.length || 0} 幕分镜已生成 (${sAfterDir.width}x${sAfterDir.height})`,
    })
  }

  // =========================================================================
  // AGENT 2: 素材剪辑 Agent (editor)
  // =========================================================================
  if (!isDoneTask(run, 't-editor')) {
    await waitIfPaused('t-editor')
    updateTask('t-editor', {
      status: 'running',
      progress: 10,
      message: '素材剪辑 Agent 启动：正在调用 FFmpeg 智能裁切构图、调色增强与镜头对齐...',
    })

    const curScript = readScriptJson(absDir).data
    const editRes = await executeCurateAndEditAssets({
      projectDir: absDir,
      aspectRatio: curScript.aspectRatio || aspectRatio,
      quality: curScript.quality || quality,
      width: curScript.width,
      height: curScript.height,
      style: curScript.style || style,
      trimSeconds: Number(spec.trimSeconds) || 0,
      clipSpeed: Number(spec.clipSpeed) || 1.0,
      chromaKeyColor: spec.mediaChromaKeyColor || '',
      enhanceColor: spec.enhanceColor !== false,
      signal,
      onChild,
      onProgress: (p) => {
        updateTask('t-editor', {
          status: 'running',
          progress: Math.max(10, Math.min(95, Number(p.progress) || 50)),
          message: p.message || '素材剪辑中...',
          log: false,
        })
      },
    })

    updateTask('t-editor', {
      status: 'completed',
      progress: 100,
      message: `素材精修完成：已裁切调色 ${editRes.editedCount || 0} 份视觉素材`,
    })
  }

  // =========================================================================
  // AGENT 3: 配音混音 Agent (audio) + 数字人生成 (avatar)
  // =========================================================================
  if (!isDoneTask(run, 't-audio')) {
    await waitIfPaused('t-audio')
    updateTask('t-audio', {
      status: 'running',
      progress: 10,
      message: '配音混音 Agent 启动：正在生成 IndexTTS-2.5 旁白语音与音色匹配...',
    })

    let scriptNow = readScriptJson(absDir).data
    const assetsNow = readAssets(absDir)
    const fps = Number(scriptNow.fps) || 30
    const hostVideoAsset = (assetsNow.items || []).find((it) => it.role === 'host_video' && it.type === 'video')
    const voiceCloneSample = (assetsNow.items || []).find((it) => it.role === 'voice_clone')

    if (spec.useHostVocal && hostVideoAsset && hostVideoAsset.hasAudio !== false) {
      updateTask('t-audio', {
        status: 'running',
        progress: 25,
        message: '检测到真人出镜原声视频，正在提取 48kHz 干声并绑定配音轨...',
      })
      const { ffmpeg } = resolveBinaries()
      const hostAbs = isAbsolute(hostVideoAsset.path) ? hostVideoAsset.path : resolve(absDir, hostVideoAsset.path)
      const firstSc = scriptNow.scenes?.[0]
      if (firstSc && existsSync(hostAbs)) {
        const hostWavRel = `audio/${firstSc.id}-host.wav`
        const hostWavAbs = join(absDir, hostWavRel)
        mkdirSync(join(absDir, 'audio'), { recursive: true })
        const extRes = await runCommandRedirected(
          ffmpeg,
          ['-y', '-i', hostAbs, '-vn', '-af', 'highpass=f=75,aresample=48000', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', hostWavAbs],
          { timeoutMs: 45_000, signal, onChild },
        )
        if (extRes.code === 0 && existsSync(hostWavAbs)) {
          firstSc.audioFile = hostWavRel
          writeScriptJson(absDir, scriptNow)
        }
      }
    }

    scriptNow = readScriptJson(absDir).data
    matchAllScenesInScript(absDir, { voiceId, forceAuto: false })
    scriptNow = readScriptJson(absDir).data

    const scenesToTts = (scriptNow.scenes || []).filter((sc) => {
      const hasExisting = sc.audioFile && existsSync(isAbsolute(sc.audioFile) ? sc.audioFile : resolve(absDir, sc.audioFile))
      return !hasExisting || !spec.preserveExistingAudio
    })

    for (let i = 0; i < scenesToTts.length; i++) {
      if (signal.aborted) throw createAbortError()
      await waitIfPaused('t-audio')
      const sc = scenesToTts[i]
      if (spec.useHostVocal && sc.audioFile && sc.audioFile.includes('-host.wav')) continue
      updateTask('t-audio', {
        status: 'running',
        progress: Math.round(20 + ((i + 0.5) / Math.max(1, scenesToTts.length)) * 30),
        message: `正在合成第 ${i + 1}/${scenesToTts.length} 幕配音 (${sc.title || sc.id})...`,
        log: false,
      })
      await executeGenerateSpeech({
        text: sc.narration || sc.title || '欢迎来到 AI 视频创作工坊',
        emotion: sc.emotion || '平静',
        outputPath: `audio/${sc.id}.wav`,
        fps,
        voiceId: sc.voiceId || voiceId || 'auto',
        engine: spec.ttsEngine || 'indextts25',
        scriptPath: absDir,
        sceneId: sc.id,
        allowPlaceholder,
      })
    }

    if (signal.aborted) throw createAbortError()
    await waitIfPaused('t-audio')
    updateTask('t-audio', {
      status: 'running',
      progress: 58,
      message: `正在执行 AI 修音去静音、响度标准化与语速调整 (${speechTempo.toFixed(2)}x)...`,
    })
    try {
      await masterVoiceTracks({
        projectDir: absDir,
        useLlm: mode === 'ai-coded' && llmSummary.configured,
        speechTempo,
        trimSilence: true,
        signal,
        onChild,
        onProgress: (msg) => appendLog('audio', msg),
      })
    } catch (err) {
      if (err?.name === 'AbortError' || signal.aborted) throw createAbortError()
      appendLog('audio', `修音阶段跳过未完成音轨: ${err.message}`, 'warn')
    }

    scriptNow = await recomputeCumulativeTimeline(absDir)

    if (signal.aborted) throw createAbortError()
    await waitIfPaused('t-audio')
    updateTask('t-audio', {
      status: 'running',
      progress: 75,
      message: '正在生成转场 SFX 音效与背景配乐，并执行人声闪避侧链混音...',
    })

    if (mode === 'ai-coded' && llmSummary.configured) {
      await generateAiCodedSfxCues({ projectDir: absDir, style, signal }).catch(() => {})
    }

    const totalSec = Math.max(4, Number(scriptNow.totalDurationSec) || 12)
    const uploadedMusic = (assetsNow.items || []).filter((it) => it.role === 'music')
    const chosenUploadPath = spec.uploadedBgmPath || uploadedMusic[0]?.path || scriptNow.bgm?.uploadedPath || ''
    scriptNow.audioSpec = { ...(scriptNow.audioSpec || {}), bgmMode }

    if (bgmMode === 'uploaded' && chosenUploadPath) {
      scriptNow.bgm = {
        ...(scriptNow.bgm || {}),
        mode: 'uploaded',
        source: 'user-imported',
        path: chosenUploadPath,
        uploadedPath: chosenUploadPath,
      }
      writeScriptJson(absDir, scriptNow)
    } else if (bgmMode === 'llm-coded' && llmSummary.configured) {
      try {
        const bgmRes = await generateAiCodedBgmTrack({
          projectDir: absDir,
          topic: spec.topic || scriptNow.topic,
          mood: style,
          bpm: scriptNow.bgm?.bpm || 118,
          durationSec: totalSec + 1.0,
        })
        scriptNow.bgm = { ...(scriptNow.bgm || {}), mode: 'llm-coded', source: 'llm-coded', path: bgmRes.relWavPath }
        writeScriptJson(absDir, scriptNow)
      } catch (err) {
        appendLog('audio', `大模型编曲配乐回退本地合成引擎: ${err.message}`, 'warn')
      }
    } else if (bgmMode === 'tts-engine') {
      try {
        const ttsBgm = await synthesizeTtsEngineAudioCue({
          projectDir: absDir,
          promptText: spec.bgmTtsPrompt || `${spec.topic || '沉浸光影'} 氛围声场`,
          voiceId: voiceCloneSample?.id || voiceId || 'auto',
          durationSec: totalSec + 1.0,
        })
        scriptNow.bgm = { ...(scriptNow.bgm || {}), mode: 'tts-engine', source: 'tts-engine', path: ttsBgm.relWavPath }
        writeScriptJson(absDir, scriptNow)
      } catch (err) {
        appendLog('audio', `配音引擎氛围配乐回退本地合成: ${err.message}`, 'warn')
      }
    }

    await ensureProjectAudioAssets(absDir, readScriptJson(absDir).data, assetsNow)
    await mixVideoAudio({
      projectDir: absDir,
      script: readScriptJson(absDir).data,
      assetsManifest: assetsNow,
      outputPath: join(absDir, 'output', 'master-audio.wav'),
      signal,
      onChild,
    })

    updateTask('t-audio', {
      status: 'completed',
      progress: 100,
      message: '配音混音完成：人声母带 + SFX + 闪避 BGM 已混录为 output/master-audio.wav',
    })
  }

  // Optional Avatar Subtask (`t-avatar`)
  if (spec.avatarEnabled && !isDoneTask(run, 't-avatar')) {
    await waitIfPaused('t-avatar')
    updateTask('t-avatar', {
      status: 'running',
      progress: 12,
      message: '数字人引擎启动：正在准备口播人声与透明通道合成...',
    })
    const scriptForAvatar = readScriptJson(absDir).data
    const assetsAv = readAssets(absDir)
    const avatarBase =
      spec.avatarSourcePath ||
      (assetsAv.items || []).find((it) => it.role === 'avatar_base')?.path ||
      (assetsAv.items || []).find((it) => it.role === 'host_video')?.path ||
      ''
    const voiceCloneItem = (assetsAv.items || []).find((it) => it.role === 'voice_clone')
    const drivingWav = await buildCombinedDryVoiceWav(absDir, scriptForAvatar, signal, onChild)

    const isImgBase = avatarBase && /\.(jpg|jpeg|png|webp|bmp)$/i.test(avatarBase)
    await executeGenerateAvatar({
      projectDir: absDir,
      avatarMode: spec.avatarMode || (avatarBase ? 'cloned-human' : 'ai-human'),
      sourceVideoPath: !isImgBase ? avatarBase : '',
      sourceImagePath: isImgBase ? avatarBase : '',
      voiceId,
      voiceSamplePath: spec.voiceSamplePath || voiceCloneItem?.path || '',
      narrationText: (scriptForAvatar.scenes || []).map((s) => s.narration).filter(Boolean).join('。'),
      audioPath: drivingWav,
      avatarLayout: spec.avatarLayout || scriptForAvatar.avatarLayout || 'pip-br',
      presetId: spec.avatarPresetId || 'cyber-anchor',
      chromaKeyColor: spec.avatarChromaKeyColor || '',
      fps: Number(scriptForAvatar.fps) || 30,
      allowPlaceholder,
      signal,
      onProgress: (p) => {
        updateTask('t-avatar', {
          status: 'running',
          progress: Math.max(15, Math.min(96, Number(p.progress) || 50)),
          message: p.message || '数字人生成中...',
          log: false,
        })
      },
    })

    updateTask('t-avatar', {
      status: 'completed',
      progress: 100,
      message: '透明通道数字人叠层 (yuva420p WebM) 已挂载到视频时间轴',
    })
  }

  // =========================================================================
  // AGENT 4a: 动效质检 Agent — 动效编码 + video_lint + video_snapshot (t-motion)
  // =========================================================================
  if (!isDoneTask(run, 't-motion')) {
    await waitIfPaused('t-motion')
    updateTask('t-motion', {
      status: 'running',
      progress: 15,
      message: `动效质检 Agent 启动：正在生成 ${engine.toUpperCase()} 动效工程与透明数字人叠层...`,
    })

    const curScript = readScriptJson(absDir).data
    syncProjectCodeFromScript(absDir, curScript, { forceOverwrite: true })

    if (mode === 'ai-coded' && llmSummary.configured && spec.aiAuthorCode) {
      try {
        updateTask('t-motion', {
          status: 'running',
          progress: 40,
          message: `动效质检 Agent 正在调用大模型 (${llmSummary.model}) 定制动效特效代码...`,
        })
        const promptPkg =
          engine === 'remotion'
            ? buildRemotionCoderSkillsPrompt({
                plan: curScript,
                timingContract: curScript,
                width: curScript.width,
                height: curScript.height,
                aspectRatio: curScript.aspectRatio,
              })
            : buildHtmlCoderSkillsPrompt({
                plan: curScript,
                timingContract: curScript,
                width: curScript.width,
                height: curScript.height,
                aspectRatio: curScript.aspectRatio,
              })

        const aiReply = await callLlmChat({
          system: promptPkg.system,
          messages: [{ role: 'user', content: promptPkg.user }],
          temperature: 0.3,
          maxTokens: 12000,
          signal,
        })
        const parsedFiles = extractJsonFromLlmText(aiReply.text)?.files
        if (parsedFiles && typeof parsedFiles === 'object') {
          const check = scanAiGeneratedCodeSandbox(parsedFiles, engine)
          if (check.safe) {
            for (const [rel, body] of Object.entries(parsedFiles)) {
              let finalBody = String(body || '')
              if (rel === 'index.html') {
                finalBody = finalBody.replace(
                  /(<script\s+id=["']dsh-script-data["'][^>]*>)[\s\S]*?(<\/script>)/i,
                  `$1${JSON.stringify(curScript)}$2`,
                )
              }
              const cleanRel = rel.replace(/^\/+/, '').replace(/\.\.+/g, '.')
              writeFileSync(join(absDir, cleanRel), finalBody, 'utf8')
            }
            if (engine === 'remotion') {
              const tc = await runTypecheckOnProject(absDir)
              if (!tc.ok) throw new Error(tc.output || 'TypeScript check failed')
            }
            curScript.authoringMode = 'ai-coded'
            writeScriptJson(absDir, curScript)
            appendLog('motion_qa', '大模型定制动效代码已通过安全沙箱与编译检查')
          } else {
            appendLog('motion_qa', `AI 动效沙箱检查未通过，自动使用内置 .motion 模板: ${check.violations.join('; ')}`, 'warn')
          }
        }
      } catch (err) {
        if (err?.name === 'AbortError' || signal.aborted) throw createAbortError()
        appendLog('motion_qa', `大模型动效定制已回退高稳内置模板: ${err.message}`, 'warn')
        syncProjectCodeFromScript(absDir, readScriptJson(absDir).data, { forceOverwrite: true })
      }
    }

    if (signal.aborted) throw createAbortError()
    await waitIfPaused('t-motion')
    updateTask('t-motion', {
      status: 'running',
      progress: 70,
      message: '正在执行 video_lint 合规检测与九宫格视觉快照预检...',
    })
    const lintRes = await executeVideoLint({ projectDir: absDir })
    let snapRes = null
    try {
      snapRes = await executeVideoSnapshot({ projectDir: absDir })
    } catch (err) {
      if (err?.name === 'AbortError' || signal.aborted) throw createAbortError()
      appendLog('motion_qa', `九宫格预检跳过: ${err.message}`, 'warn')
    }
    updateTask('t-motion', {
      status: 'completed',
      progress: 100,
      message: `动效质检完成：Lint ${lintRes.passed ? '通过' : '带警告'} · 九宫格快照${snapRes?.ok ? '已生成' : '略过'}`,
    })
  }

  // =========================================================================
  // AGENT 4b: 高清 MP4 渲染交付 (t-render)
  // =========================================================================
  let finalRender = null
  if (!isDoneTask(run, 't-render')) {
    await waitIfPaused('t-render')
    updateTask('t-render', {
      status: 'running',
      progress: 8,
      message: `正在启动 ${engine.toUpperCase()} 全帧率高清渲染与自动音画质检...`,
    })

    finalRender = await executeVideoRender({
      projectDir: absDir,
      engine,
      signal,
      onProgress: (p) => {
        updateTask('t-render', {
          status: 'running',
          progress: Math.max(8, Math.min(97, Number(p?.progress) || 50)),
          message: p?.message || '全帧率编码渲染中...',
          log: false,
        })
      },
    })

    updateTask('t-render', {
      status: 'completed',
      progress: 100,
      message: `成品导出成功：${finalRender.resolution} · ${finalRender.durationSec}s (${Math.round((finalRender.fileSizeBytes || 0) / 1024)} KB)`,
    })
  }

  return {
    ok: true,
    projectDir: absDir,
    engine,
    mode,
    outputPath: finalRender?.outputPath || join(absDir, 'output', 'final.mp4'),
    snapshotPath: finalRender?.snapshotPath || join(absDir, 'output', 'snapshot-3x3.png'),
    qa: finalRender?.qa || null,
  }
}

// Register default runner factory so historical persisted runs remain retryable across daemon restarts
taskManager.setDefaultRunnerFactory(() => executeMultiAgentRunner)

/**
 * Start a 4-Agent pipeline in the background (returns immediately with runId + initial status).
 */
export async function startPipelineBackground(spec = {}) {
  if (!spec.projectDir) throw new Error('projectDir is required')
  const modeLabel = spec.mode === 'fast-draft' ? '极速本地出片' : 'AI 团队协同出片'
  const run = taskManager.createRun({
    projectDir: spec.projectDir,
    title: spec.title || `${modeLabel} · ${spec.topic || '视觉作品'}`,
    topic: spec.topic || '',
    mode: spec.mode || 'ai-coded',
    spec,
  })
  const started = await taskManager.startRun(run.id, executeMultiAgentRunner)
  started.promise.catch(() => {})
  return started.run
}

/**
 * Synchronous pipeline entrypoint for MCP/Cordis tool call `run_agent_pipeline`.
 */
export async function runMultiAgentPipeline(spec = {}) {
  if (!spec.projectDir) throw new Error('projectDir is required')
  const modeLabel = spec.mode === 'fast-draft' ? '极速本地出片' : 'AI 团队协同出片'
  const run = taskManager.createRun({
    projectDir: spec.projectDir,
    title: spec.title || `${modeLabel} · ${spec.topic || '视觉作品'}`,
    topic: spec.topic || '',
    mode: spec.mode || 'ai-coded',
    spec,
  })
  const started = await taskManager.startRun(run.id, executeMultiAgentRunner)
  return await started.promise
}
