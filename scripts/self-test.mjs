import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadEnv,
  probeAudioDuration,
  REPO_ROOT,
  resolveBinaries,
  resolveVideoDimensions,
  runCommandRedirected,
} from '../packages/shared/index.js'
import { executeGenerateAvatar } from '../packages/dsh-tool-avatar/index.js'
import {
  ensureTtsServer,
  executeGenerateSpeech,
  getVoiceCatalog,
  importVoicePack,
  matchAllScenesInScript,
} from '../packages/dsh-tool-local-tts/index.js'
import {
  executeVideoLint,
  executeVideoRender,
  executeVideoSnapshot,
  runPostRenderQa,
  runTypecheckOnProject,
} from '../packages/dsh-tool-video-suite/index.js'
import {
  executeCurateAndEditAssets,
  importAssets,
  mixVideoAudio,
  planVideoFromAssets,
  readAssets,
  runAiStudioPipeline,
  taskManager,
} from '../packages/dsh-tool-media/index.js'
import { scaffoldVideoProject } from '../packages/dsh-preset-video/index.js'
import { handleWorkbenchApiRequest } from '../packages/dsh-web-video-workbench/lib/index.js'
import { verifyCordisPluginMounting } from './dsh-runner.mjs'

/**
 * Scan repository files to ensure ZERO hardcoded personal paths or API keys exist in open-source files.
 */
function scanForHardcodedPaths(dir, relativePrefix = '') {
  const violations = []
  const skipNames = new Set([
    '.env',
    '.git',
    'node_modules',
    '.npm-cache',
    '.dsh-home',
    '.tmp',
    '.tmp-render',
    'output',
    'assets',
    'uploads',
    'public',
    'audio',
    'cache',
    'publish',
    'vendor',
    'imported',
    'catalog.json',
  ])

  for (const entry of readdirSync(dir)) {
    if (skipNames.has(entry)) continue
    const full = join(dir, entry)
    const rel = relativePrefix ? `${relativePrefix}/${entry}` : entry
    const st = statSync(full)
    if (st.isDirectory()) {
      violations.push(...scanForHardcodedPaths(full, rel))
    } else if (/\.(js|mjs|cjs|ts|tsx|json|yml|yaml|md|py|cmd)$/i.test(entry)) {
      if (rel.startsWith('examples/demo-') || rel === 'scripts/self-test.mjs') {
        continue
      }
      const content = readFileSync(full, 'utf8')
      const driveUserPattern = new RegExp('[C-E]:\\\\Users\\\\[A-Za-z0-9_]+', 'i')
      const personalDrivePattern = new RegExp('(?:D:\\\\index-tts|D:\\\\DeepSeekHarness|E:\\\\05_)', 'i')
      if (driveUserPattern.test(content) || personalDrivePattern.test(content)) {
        violations.push(rel)
      }
    }
  }
  return violations
}

async function generateSyntheticTestAssets(assetDir, ffmpeg) {
  rmSync(assetDir, { recursive: true, force: true })
  mkdirSync(assetDir, { recursive: true })

  const heroPng = join(assetDir, '01_product_hero.png')
  const brollMp4 = join(assetDir, '02_motion_broll.mp4')
  const bgmWav = join(assetDir, 'bgm_synth_track.wav')
  const sfxWav = join(assetDir, 'sfx_whoosh_custom.wav')
  const noteTxt = join(assetDir, 'brief.txt')

  await runCommandRedirected(
    ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'color=c=#0ea5e9:s=1280x720:d=0.1', '-frames:v', '1', heroPng],
    { timeoutMs: 20_000 },
  )
  await runCommandRedirected(
    ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '2.5', '-c:v', 'libx264', '-bf', '0', '-g', '15', '-video_track_timescale', '90000', '-pix_fmt', 'yuv420p', brollMp4],
    { timeoutMs: 30_000 },
  )
  await runCommandRedirected(
    ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=10', '-ac', '2', bgmWav],
    { timeoutMs: 20_000 },
  )
  await runCommandRedirected(
    ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=0.4', '-ac', '2', sfxWav],
    { timeoutMs: 20_000 },
  )
  writeFileSync(
    noteTxt,
    '产品核心亮点：\n1. 全自动素材导入与视觉特效合成。\n2. IndexTTS-2 真人配音与多轨自动闪避混音。',
    'utf8',
  )
  return { heroPng, brollMp4, bgmWav, sfxWav, noteTxt }
}

async function probeMediaStreams(ffprobe, mediaPath) {
  const res = await runCommandRedirected(
    ffprobe,
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', mediaPath],
    { timeoutMs: 15_000 },
  )
  if (res.code !== 0) {
    throw new Error(`ffprobe failed for ${mediaPath}: ${res.stderr}`)
  }
  return JSON.parse(res.stdout)
}

async function runSelfTest() {
  loadEnv()
  console.log('======================================================================')
  console.log('🧪 DSH Video Workbench — Full-Chain End-to-End Automated Verification')
  console.log('======================================================================')

  // 1. Binary & Environment Check
  const bins = resolveBinaries()
  console.log(`[1/8] FFmpeg / FFprobe resolved:`)
  console.log(`      ffmpeg  = ${bins.ffmpeg}`)
  console.log(`      ffprobe = ${bins.ffprobe}`)

  // 2. Cordis Plugin & Preset Mounting Check
  const mount = verifyCordisPluginMounting()
  console.log(`[2/8] Cordis Tools (${mount.tools.length}): ${mount.tools.join(', ')}`)
  console.log(`      Presets (${mount.presets.length}): ${mount.presets.map((p) => `${p.name} [${p.id}]`).join(', ')}`)
  const requiredTools = [
    'import_assets',
    'list_assets',
    'generate_sfx_bgm',
    'plan_video_from_assets',
    'produce_video',
    'ai_create_video',
    'ai_master_voice',
    'configure_llm_model',
    'export_publish_pack',
    'import_vendor_motion',
    'list_voices',
    'import_voice_pack',
    'match_scene_voices',
    'generate_speech',
    'video_lint',
    'video_snapshot',
    'video_render',
  ]
  for (const t of requiredTools) {
    if (!mount.tools.includes(t)) {
      throw new Error(`Missing required Cordis tool: ${t}`)
    }
  }
  if (mount.presets.length < 1) {
    throw new Error('Cordis video-maker preset missing!')
  }

  // 3. Asset Import & Voice Pack Catalog Verification
  const initialCatalog = getVoiceCatalog()
  console.log(
    `[3/8] Voice Catalog loaded ${initialCatalog.voices.length} voices | Categories: ${JSON.stringify(initialCatalog.categories)}`,
  )

  if (process.env.DEFAULT_REF_AUDIO && existsSync(process.env.DEFAULT_REF_AUDIO)) {
    const imp = await importVoicePack({
      sourcePath: process.env.DEFAULT_REF_AUDIO,
      id: 'imported-custom-narrator',
      name: '用户导入测试音色包 (Custom Narrator)',
      gender: 'female',
      tags: ['自定义', '清晰', '测试', '旁白'],
      promptText: process.env.DEFAULT_REF_TEXT || '',
    })
    console.log(`      Imported custom voice pack: ${imp.importedVoices[0].name} (${imp.importedVoices[0].durationSec}s)`)
  }

  const tmpAssetSrc = join(REPO_ROOT, '.tmp', 'e2e-assets-src')
  const tmpHtmlProj = join(REPO_ROOT, '.tmp', 'e2e-asset-html')
  const tmpRemotionProj = join(REPO_ROOT, '.tmp', 'e2e-asset-remotion')
  rmSync(tmpHtmlProj, { recursive: true, force: true })
  rmSync(tmpRemotionProj, { recursive: true, force: true })

  await generateSyntheticTestAssets(tmpAssetSrc, bins.ffmpeg)
  const imported = await importAssets({ projectDir: tmpHtmlProj, sources: [tmpAssetSrc] })
  const importedManifest = readAssets(tmpHtmlProj)
  if (!imported.ok || importedManifest.items.length < 4 || importedManifest.notes.length < 1) {
    throw new Error(`Asset import incomplete: ${JSON.stringify(importedManifest)}`)
  }
  console.log(
    `      Asset Import verified: ${importedManifest.items.length} media assets + ${importedManifest.notes.length} note`,
  )

  // 4. AI Storyboard Planning + Code Generation (Both HTML5 & Remotion)
  const htmlPlan = await planVideoFromAssets({
    projectDir: tmpHtmlProj,
    topic: 'AI 智能素材成片与多轨混音演示',
    style: 'tech',
    engine: 'html',
    voiceId: 'auto',
  })
  const scenesWithVisuals = htmlPlan.script.scenes.filter(
    (s) => (Array.isArray(s.media) && s.media.length > 0) || Boolean(s.mediaPath),
  )
  if (scenesWithVisuals.length < 2) {
    throw new Error('Expected planVideoFromAssets to map imported image & video assets onto scenes')
  }
  console.log(
    `[4/8] AI Director Planned ${htmlPlan.sceneCount} scenes (${scenesWithVisuals.length} scenes bound to user visuals, SFX=${htmlPlan.sfxCount})`,
  )

  // Limit to 2 concise scenes for fast yet REAL IndexTTS-2 + dual-engine render E2E test
  const trimmedScenes = htmlPlan.script.scenes.slice(0, 2).map((s, idx) => ({
    ...s,
    narration:
      idx === 0
        ? 'AI 全自动素材成片，支持图文与视频运镜联动。'
        : '支持两百零五个本地音色，叠加转场音效与配乐闪避混音。',
  }))
  scaffoldVideoProject(tmpHtmlProj, {
    title: 'AI 素材生成视频 E2E 实测 (HTML5)',
    engine: 'html',
    style: 'tech',
    scenes: trimmedScenes,
  })
  matchAllScenesInScript(tmpHtmlProj, { voiceId: 'auto' })

  // 5. Real IndexTTS-2.5 Persistent Server Synthesis + ffprobe Duration + Multi-Track Audio Mix
  console.log(`[5/8] Ensuring persistent IndexTTS-2.5 HTTP server for REAL speech synthesis...`)
  const ttsHealth = await ensureTtsServer({ waitMs: 300_000 })
  if (ttsHealth?.engine !== 'indextts25') {
    throw new Error(`Expected IndexTTS-2.5 server engine 'indextts25', got: ${JSON.stringify(ttsHealth)}`)
  }
  const reReadHtml = await import('../packages/shared/index.js').then((m) => m.readScriptJson(tmpHtmlProj))
  const twoScenes = reReadHtml.data.scenes.slice(0, 2)
  reReadHtml.data.scenes = twoScenes
  await import('../packages/shared/index.js').then((m) => m.writeScriptJson(tmpHtmlProj, reReadHtml.data))

  const s1Speech = await executeGenerateSpeech({
    text: twoScenes[0].narration,
    emotion: twoScenes[0].emotion || '平静',
    voiceId: 'auto',
    fps: 30,
    outputPath: join(tmpHtmlProj, 'audio', `${twoScenes[0].id}.wav`),
    scriptPath: tmpHtmlProj,
    sceneId: twoScenes[0].id,
    allowPlaceholder: false,
  })
  const s2Speech = await executeGenerateSpeech({
    text: twoScenes[1].narration,
    emotion: twoScenes[1].emotion || '高兴',
    voiceId: 'indextts-pingshu',
    fps: 30,
    outputPath: join(tmpHtmlProj, 'audio', `${twoScenes[1].id}.wav`),
    scriptPath: tmpHtmlProj,
    sceneId: twoScenes[1].id,
    allowPlaceholder: false,
  })
  if (s1Speech.voicePlaceholder || s2Speech.voicePlaceholder) {
    throw new Error('Expected REAL IndexTTS-2 synthesis, but received placeholder tone!')
  }
  console.log(
    `      • Real IndexTTS-2 verified: scene-01=${s1Speech.durationSec}s (${s1Speech.voiceName}), scene-02=${s2Speech.durationSec}s (${s2Speech.voiceName})`,
  )

  const savedHtml = await import('../packages/shared/index.js').then((m) => m.readScriptJson(tmpHtmlProj))
  const { writeScriptJson, readScriptJson } = await import('../packages/shared/index.js')
  const { syncProjectCodeFromScript } = await import('../packages/dsh-tool-media/index.js')
  syncProjectCodeFromScript(tmpHtmlProj, savedHtml.data)

  const mixRes = await mixVideoAudio({ projectDir: tmpHtmlProj, script: savedHtml.data })
  const mixProbe = await probeAudioDuration(mixRes.outputPath, 30)
  console.log(
    `      • Multi-track Audio Mix verified: voices=${mixRes.voiceCount}, sfx=${mixRes.sfxCount}, bgm=${mixRes.bgmSource}, duration=${mixProbe.durationSec}s`,
  )

  // 6. Lint + Real Full-FPS HTML CDP MP4 Render
  const htmlLint = await executeVideoLint({ projectDir: tmpHtmlProj, engine: 'html' })
  if (!htmlLint.ok) {
    throw new Error(`HTML video_lint failed: ${htmlLint.errors.join('; ')}`)
  }
  const htmlSnap = await executeVideoSnapshot({ projectDir: tmpHtmlProj, engine: 'html' })
  const htmlRender = await executeVideoRender({
    projectDir: tmpHtmlProj,
    engine: 'html',
    renderWidth: 1280,
    renderHeight: 720,
  })
  const htmlMp4Info = await probeMediaStreams(bins.ffprobe, htmlRender.outputPath)
  const hasH264 = htmlMp4Info.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')
  const hasAac = htmlMp4Info.streams.some((s) => s.codec_type === 'audio')
  if (!hasH264 || !hasAac) {
    throw new Error(`HTML rendered MP4 missing expected video/audio streams: ${htmlRender.outputPath}`)
  }
  console.log(
    `[6/8] HTML5 CDP Full-FPS Render verified (${htmlRender.renderMethod}): ${(htmlRender.fileSizeBytes / 1024).toFixed(1)} KB, streams=h264+audio, snap=${htmlSnap.captureMethod}`,
  )

  // 7. Remotion Dual-Engine Lint + Snapshot + Real Render Verification
  await importAssets({ projectDir: tmpRemotionProj, sources: [tmpAssetSrc] })
  await planVideoFromAssets({
    projectDir: tmpRemotionProj,
    topic: 'Remotion 双引擎实时组件合成测试',
    style: 'cinematic',
    engine: 'remotion',
  })
  const remMeta = readScriptJson(tmpRemotionProj)
  remMeta.data.width = 1280
  remMeta.data.height = 720
  remMeta.data.scenes = remMeta.data.scenes.slice(0, 2).map((s, idx) => ({
    ...s,
    audioFile: `audio/${twoScenes[idx].id}.wav`,
    voiceDurationSec: idx === 0 ? s1Speech.durationSec : s2Speech.durationSec,
    durationSec: 2.5,
    durationInFrames: 75,
  }))
  mkdirSync(join(tmpRemotionProj, 'audio'), { recursive: true })
  const { copyFileSync } = await import('node:fs')
  for (const ts of twoScenes) {
    copyFileSync(join(tmpHtmlProj, 'audio', `${ts.id}.wav`), join(tmpRemotionProj, 'audio', `${ts.id}.wav`))
  }
  const savedRem = writeScriptJson(tmpRemotionProj, remMeta.data)
  syncProjectCodeFromScript(tmpRemotionProj, savedRem.data)

  const remLint = await executeVideoLint({ projectDir: tmpRemotionProj, engine: 'remotion' })
  if (!remLint.ok) {
    throw new Error(`Remotion video_lint failed: ${remLint.errors.join('; ')}`)
  }
  const remSnap = await executeVideoSnapshot({ projectDir: tmpRemotionProj, engine: 'remotion' })
  const remRender = await executeVideoRender({ projectDir: tmpRemotionProj, engine: 'remotion' })
  const remMp4Info = await probeMediaStreams(bins.ffprobe, remRender.outputPath)
  const remHasV = remMp4Info.streams.some((s) => s.codec_type === 'video' && s.codec_name === 'h264')
  const remHasA = remMp4Info.streams.some((s) => s.codec_type === 'audio')
  if (!remHasV || !remHasA) {
    throw new Error(`Remotion rendered MP4 missing H.264/audio streams!`)
  }
  console.log(
    `[7/8] Remotion Engine Render verified (${remRender.renderMethod}): ${(remRender.fileSizeBytes / 1024).toFixed(1)} KB, snap=${remSnap.captureMethod}`,
  )

  // 8. Live API Route, LLM Masked Config, & Range Check
  const apiState = await handleWorkbenchApiRequest(new Request('http://127.0.0.1:4399/api/video-workbench/state'))
  const apiJson = await apiState.json()
  if (!apiJson.ok || !apiJson.ttsStatus || !apiJson.llmConfig) {
    throw new Error('Workbench /state API failed health check or missing llmConfig summary')
  }
  if ('apiKey' in (apiJson.llmConfig || {})) {
    throw new Error('Security violation: plaintext apiKey must never be serialized in /state')
  }
  const rangeRes = await handleWorkbenchApiRequest(
    new Request(`http://127.0.0.1:4399/api/video-workbench/asset?projectDir=${encodeURIComponent(tmpHtmlProj)}&rel=${encodeURIComponent('output/final.mp4')}`, {
      headers: { range: 'bytes=0-1023' },
    }),
  )
  if (rangeRes.status !== 206) {
    throw new Error(`Expected HTTP 206 Partial Content for asset Range request, got ${rangeRes.status}`)
  }

  // Verify Post-Render FFmpeg QA Report from HTML render & QA API endpoint
  const qaApiRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: tmpHtmlProj }),
    }),
  )
  const qaJson = await qaApiRes.json()
  if (!qaJson.ok || !qaJson.qa?.passed) {
    throw new Error(`FFmpeg QA verification failed: ${JSON.stringify(qaJson)}`)
  }
  console.log(
    `[8/10] API, Masked LLM Config, Range 206 & FFmpeg QA verified (loudness=${qaJson.qa.loudness?.integratedLufs} LUFS, blackSegments=${qaJson.qa.blackSegments?.length})`,
  )

  // 9. Aspect Ratio Resolver + `tsc --noEmit` Preflight + Mocked LLM Coding 3-Round Auto-Repair Loop
  const autoPortDims = resolveVideoDimensions({
    aspectRatio: 'auto',
    quality: '1080p',
    topic: '抖音爆款产品竖屏推广',
  })
  const xhsDims = resolveVideoDimensions({ aspectRatio: 'auto', quality: '720p', topic: '小红书好物图文笔记' })
  const twoKDims = resolveVideoDimensions({ aspectRatio: '16:9', quality: '2k' })
  const assetPortDims = resolveVideoDimensions({
    aspectRatio: 'auto',
    quality: '1080p',
    topic: '风光记录',
    assets: [{ width: 1080, height: 1920 }, { width: 1080, height: 1920 }],
  })
  if (
    autoPortDims.width !== 1080 || autoPortDims.height !== 1920 ||
    xhsDims.aspectRatio !== '3:4' || xhsDims.width !== 720 || xhsDims.height !== 960 ||
    twoKDims.width !== 2560 || twoKDims.height !== 1440 ||
    assetPortDims.aspectRatio !== '9:16'
  ) {
    throw new Error(`Dimension resolver assertion failed: ${JSON.stringify({ autoPortDims, xhsDims, twoKDims, assetPortDims })}`)
  }

  // Run strict tsc --noEmit on Remotion showcase project (`shotcraft.tsx` + `VideoComposition.tsx`)
  const remTsc = await runTypecheckOnProject(tmpRemotionProj)
  if (!remTsc.ok) {
    throw new Error(`Remotion preflight tsc --noEmit failed: ${remTsc.errors.join(' | ')}`)
  }

  // Test full LLM AI Studio pipeline with mocked Anthropic-format LLM returning broken TSX first, then repairing in Round 1!
  const tmpAiProj = join(REPO_ROOT, '.tmp', 'test-ai-coder')
  rmSync(tmpAiProj, { recursive: true, force: true })
  scaffoldVideoProject(tmpAiProj, { title: 'LLM Auto-Repair Test', engine: 'remotion' })

  let llmCallCounter = 0
  let brokenCodeEmitted = false
  const mockLlmFetch = async (url, init) => {
    llmCallCounter++
    const body = JSON.parse(init?.body || '{}')
    const sysPrompt = String(body?.system || '')
    const userPrompt = String(body?.messages?.[body.messages.length - 1]?.content || '')

    // AI-Coded Audio BGM DSP script call
    if (sysPrompt.includes('DSP') || userPrompt.includes('synthesizeBgm')) {
      const codeStr = `function synthesizeBgm(ctx) {
  const N = ctx.totalSamples;
  for (let i = 0; i < N; i++) {
    const t = i / ctx.sampleRate;
    const kickEnv = Math.exp(-(t % (60 / (ctx.bpm || 112))) * 16);
    const pad = Math.sin(2 * Math.PI * 220 * t) * 0.14 + Math.sin(2 * Math.PI * 329.63 * t) * 0.10;
    const sub = Math.sin(2 * Math.PI * 55 * t) * 0.18 * kickEnv;
    ctx.left[i] = ctx.tanh(pad + sub);
    ctx.right[i] = ctx.tanh(pad * 0.94 + sub);
  }
}`
      return new Response(
        JSON.stringify({
          model: 'mock-opus',
          content: [{ type: 'text', text: JSON.stringify({ files: { 'audio/ai_bgm_synth.js': codeStr }, summary: 'Mock AI DSP 48kHz Synth', bpm: 112 }) }],
        }),
        { status: 200 },
      )
    }

    // Voice Mastering call (after TTS, before audio mix & codegen)
    if (sysPrompt.includes('声学') || userPrompt.includes('integratedLufs') || userPrompt.includes('tracks')) {
      const vmReply = JSON.stringify({
        engineerSummary: 'Mock AI Studio Broadcast Vocal Master -14 LUFS',
        globalPreset: 'broadcast-clean',
        tracks: [
          {
            sceneId: 'scene-01',
            preset: 'broadcast-clean',
            hpfHz: 85,
            presenceGainDb: 2.0,
            deEssDb: -3.0,
            compRatio: 3.0,
            targetLufs: -14,
            reverbWet: 0.04,
            reason: 'Clear vocal presence',
          },
        ],
      })
      return new Response(JSON.stringify({ model: 'mock-opus', content: [{ type: 'text', text: vmReply }] }), { status: 200 })
    }

    // Initial Codegen call: deliberately emit invalid TSX (CSS transition + TypeScript error) to trigger auto-repair!
    if ((userPrompt.includes('生成定制 Remotion TSX') || userPrompt.includes('生成定制 HTML')) && !brokenCodeEmitted) {
      brokenCodeEmitted = true
      const brokenTsx = `import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
export const VideoComposition: React.FC = () => {
  const broken: number = "bad_type_string";
  return <AbsoluteFill style={{ transition: 'all 0.3s' }}><Audio src={staticFile('master-audio.wav')} />{broken}</AbsoluteFill>;
};`
      const brokenReply = JSON.stringify({
        files: {
          'src/theme.ts': `export const THEME = { accent: '#E5A93C' };`,
          'src/VideoComposition.tsx': brokenTsx,
        },
      })
      return new Response(JSON.stringify({ model: 'mock-opus', content: [{ type: 'text', text: brokenReply }] }), { status: 200 })
    }

    // Call 1: Director Architect returning 9:16 portrait plan + custom audioSpec + synth_sfx
    if (!brokenCodeEmitted) {
      const directorReply = JSON.stringify({
        title: 'AI 编程测试短片',
        style: 'cinematic',
        recommendedAspectRatio: '9:16',
        theme: {
          bgPrimary: '#090B10',
          bgSecondary: '#141926',
          textPrimary: '#F8FAFC',
          textMuted: '#94A3B8',
          accentPrimary: '#E5A93C',
          accentSecondary: '#38BDF8',
        },
        audioSpec: {
          mood: 'cinematic',
          bpm: 112,
          drumDensity: 0.72,
          leadStyle: 'glock',
          padCutoff: 1650,
          chords: [
            [38, [62, 65, 69, 72]],
            [34, [58, 65, 69, 74]],
            [41, [60, 65, 69, 76]],
            [36, [60, 64, 67, 72]],
          ],
        },
        scenes: [
          {
            id: 'scene-01',
            title: '竖屏黑金视觉震撼开场',
            shotType: 'hero-title',
            emotion: '激情',
            role: 'host',
            narration: '从零行模板到专属电影动效代码，让每一帧画面由大模型精准编排。',
            headline: 'AI 创意编程',
            kicker: 'CINEMA STUDIO',
            metrics: [{ label: '效率提升', value: 98, suffix: '%' }],
            motionNotes: 'PageCam 缓慢推进 + DigitRoll 数字滚动',
            sfxCues: [{ type: 'synth_sfx', offsetSec: 0.1, freqStart: 920, freqEnd: 160, durationMs: 320, wave: 'saw', volume: 0.55 }],
          },
        ],
      })
      return new Response(JSON.stringify({ model: 'mock-opus', content: [{ type: 'text', text: directorReply }] }), { status: 200 })
    }

    // Auto-repair call: receive exact tsc + lint diagnostics -> emit valid fixed TSX using shotcraft primitives!
    if (!userPrompt.includes('transition') && !userPrompt.includes('TS2322') && !userPrompt.includes('number')) {
      throw new Error(`Auto-repair prompt missing compiler/lint diagnostics: ${userPrompt.slice(0, 200)}`)
    }
    const fixedTsx = `import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import scriptData from '../script.json';
import { AIBadge, ClipCard, DigitRoll, PageCam, ShotCaption } from './lib/shotcraft';
import { THEME } from './theme';

export const VideoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const sData: any = scriptData;
  const scenes: any[] = Array.isArray(sData.scenes) ? sData.scenes : [];
  return (
    <AbsoluteFill style={{ backgroundColor: '#090B10', color: '#F8FAFC' }}>
      {scenes.map((sc: any) => (
        <Sequence key={sc.id} from={sc.startFrame} durationInFrames={sc.durationInFrames}>
          <PageCam startFrame={0} durationFrames={sc.durationInFrames}>
            <ClipCard delay={4} accentColor={THEME.accent}>
              <DigitRoll to={98} suffix="%" />
            </ClipCard>
          </PageCam>
        </Sequence>
      ))}
      <ShotCaption subtitles={sData.subtitles || []} accentColor={THEME.accent} isPortrait={true} />
      <AIBadge visible={Boolean(sData.aiBadge)} accentColor={THEME.accent} />
      <Audio src={staticFile('master-audio.wav')} />
    </AbsoluteFill>
  );
};`
    return new Response(
      JSON.stringify({
        model: 'mock-opus',
        content: [{ type: 'text', text: JSON.stringify({ files: { 'src/VideoComposition.tsx': fixedTsx } }) }],
      }),
      { status: 200 },
    )
  }

  const aiPipeRes = await runAiStudioPipeline({
    projectDir: tmpAiProj,
    topic: 'AI 编程测试短片',
    engine: 'remotion',
    aspectRatio: 'auto',
    quality: '1080p',
    aiBadge: true,
    render: false, // Full tsc + lint + audioSpec + auto-repair verified without duplicating 20s headless chromium in mock pass
    allowPlaceholder: true,
    llmOverride: {
      provider: 'anthropic',
      format: 'anthropic',
      baseUrl: 'https://mock.anthropic.local',
      apiKey: 'mock-test-key',
      model: 'mock-opus',
      maxRepairRounds: 3,
    },
    fetchImpl: mockLlmFetch,
  })
  if (!aiPipeRes.ok || aiPipeRes.buildLog?.repairRoundsUsed !== 1 || aiPipeRes.script?.width !== 1080 || aiPipeRes.script?.height !== 1920) {
    throw new Error(`AI Coding Auto-Repair verification failed: ${JSON.stringify(aiPipeRes.buildLog)}`)
  }
  const codeApiRes = await handleWorkbenchApiRequest(new Request(`http://127.0.0.1:4399/api/video-workbench/code?projectDir=${encodeURIComponent(tmpAiProj)}`))
  const codeApiJson = await codeApiRes.json()
  if (!codeApiJson.ok || !(codeApiJson.files || []).some((f) => f.path === 'src/VideoComposition.tsx')) {
    throw new Error('Workbench /code API failed to list generated TSX files')
  }
  console.log(
    `[9/11] Dimensions Auto-Detection + tsc --noEmit (${remTsc.skipped ? 'skipped' : '0 errors'}) + Mocked LLM 3-Round Self-Repair (repaired cleanly in ${aiPipeRes.buildLog.repairRoundsUsed} round) + Custom audioSpec/synth_sfx OK!`,
  )

  // 10. Follow-DSH Discovery + All 4 Wire Protocols + IndexTTS-2.5 Health + AI Voice Mastering
  const { discoverDshClientConfig, callLlmChat, WIRE_PROTOCOLS } = await import(
    '../packages/dsh-tool-media/llm-client.js'
  )
  const { masterVoiceTracks } = await import('../packages/dsh-tool-media/voice-master.js')
  const { getTtsServerHealth } = await import('../packages/dsh-tool-local-tts/tts-server-manager.js')

  const mockDshDir = join(REPO_ROOT, '.tmp', 'mock-dsh-home')
  rmSync(mockDshDir, { recursive: true, force: true })
  mkdirSync(join(mockDshDir, 'profiles', 'desktop'), { recursive: true })
  mkdirSync(join(mockDshDir, 'storages', 'session_projcache', 'sessions'), { recursive: true })
  writeFileSync(
    join(mockDshDir, 'profiles', 'desktop', 'cordis.patch.yml'),
    [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      mock_resp:',
      '        displayName: MockResponses',
      '        api: openai-responses',
      '        baseURL: https://mock-gateway.invalid/v1',
      '        apiKeyEnv: MOCK_RESP_KEY',
      '        models:',
      '          - id: gpt-6.1-sol',
      '            name: GPT 6.1 Sol',
      '- id: llm-deepseek',
      '  config:',
      '    baseURL: https://mock-ds.invalid/v1',
      '    models:',
      '      - id: deepseek-v4.1-flash',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(mockDshDir, '.credentials.yaml'),
    'refs:\n  MOCK_RESP_KEY: sk-mock-secret-987654321\n',
    'utf8',
  )
  writeFileSync(
    join(mockDshDir, 'storages', 'session_projcache', 'sessions', 'session-1.json'),
    JSON.stringify({
      rows: { modelSelection: { val: { pending: { provider: 'mock_resp', model: 'gpt-6.1-sol' } } } },
    }),
    'utf8',
  )
  const dshDisc = discoverDshClientConfig(mockDshDir)
  rmSync(mockDshDir, { recursive: true, force: true })
  if (
    !dshDisc.available ||
    dshDisc.defaultProviderId !== 'mock_resp' ||
    dshDisc.defaultProtocol !== 'openai-responses' ||
    dshDisc.defaultModelId !== 'gpt-6.1-sol' ||
    !dshDisc.providers[0]?.hasApiKey ||
    JSON.stringify(dshDisc).includes('987654321')
  ) {
    throw new Error(`Follow-DSH discovery check failed: ${JSON.stringify(dshDisc)}`)
  }

  if (!Array.isArray(WIRE_PROTOCOLS) || WIRE_PROTOCOLS.length !== 4) {
    throw new Error(`Expected 4 WIRE_PROTOCOLS, got ${JSON.stringify(WIRE_PROTOCOLS)}`)
  }
  const capturedCalls = []
  const protoCases = [
    {
      format: 'openai-completions',
      baseUrl: 'https://mock-openai.invalid/v1',
      model: 'gpt-test',
      expectUrl: 'https://mock-openai.invalid/v1/chat/completions',
      expectAuthHeader: 'authorization',
      replyPayload: { choices: [{ message: { content: 'ok-chat-comp' } }], usage: { total_tokens: 10 } },
      expectText: 'ok-chat-comp',
    },
    {
      format: 'anthropic-messages',
      baseUrl: 'https://mock-anth.invalid',
      model: 'claude-opus-5-5',
      expectUrl: 'https://mock-anth.invalid/v1/messages',
      expectAuthHeader: 'x-api-key',
      replyPayload: { content: [{ type: 'text', text: 'ok-anth-msg' }], usage: { output_tokens: 8 } },
      expectText: 'ok-anth-msg',
    },
    {
      format: 'openai-responses',
      baseUrl: 'https://mock-resp.invalid/v1',
      model: 'gpt-6.1-sol',
      expectUrl: 'https://mock-resp.invalid/v1/responses',
      expectAuthHeader: 'authorization',
      replyPayload: { output_text: 'ok-oai-resp', usage: { total_tokens: 12 } },
      expectText: 'ok-oai-resp',
    },
    {
      format: 'gemini-native',
      baseUrl: 'https://mock-gem.invalid',
      model: 'gemini-2.5-pro',
      expectUrl: 'https://mock-gem.invalid/v1beta/models/gemini-2.5-pro:generateContent',
      expectAuthHeader: 'x-goog-api-key',
      replyPayload: { candidates: [{ content: { parts: [{ text: 'ok-gem-nat' }] } }] },
      expectText: 'ok-gem-nat',
    },
  ]
  for (const tc of protoCases) {
    const res = await callLlmChat({
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
      overrideConfig: {
        mode: 'custom',
        provider: 'custom',
        format: tc.format,
        baseUrl: tc.baseUrl,
        apiKey: 'mock-proto-key',
        model: tc.model,
      },
      fetchImpl: async (url, init) => {
        capturedCalls.push({ format: tc.format, url, headers: init.headers })
        const hdrLower = Object.fromEntries(
          Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
        )
        if (!hdrLower[tc.expectAuthHeader]) {
          throw new Error(`Protocol ${tc.format} missing header ${tc.expectAuthHeader}`)
        }
        if (url !== tc.expectUrl) {
          throw new Error(`Protocol ${tc.format} endpoint mismatch: ${url} !== ${tc.expectUrl}`)
        }
        return new Response(JSON.stringify(tc.replyPayload), { status: 200 })
      },
    })
    if (res.text !== tc.expectText) {
      throw new Error(`Protocol ${tc.format} text mismatch: ${res.text} !== ${tc.expectText}`)
    }
  }

  const liveHealth = await getTtsServerHealth()
  if (!liveHealth?.ok || liveHealth.engine !== 'indextts25' || liveHealth.version !== '2.5') {
    throw new Error(`IndexTTS-2.5 health assertion failed: ${JSON.stringify(liveHealth)}`)
  }
  const vmDspRes = await masterVoiceTracks({ projectDir: tmpHtmlProj, useLlm: false })
  if (!vmDspRes.ok || vmDspRes.scenesCount < 1 || !existsSync(join(tmpHtmlProj, 'output', 'voice_mastering_report.json'))) {
    throw new Error(`Telemetry DSP voice mastering failed: ${JSON.stringify(vmDspRes)}`)
  }
  const vmLlmRes = await masterVoiceTracks({
    projectDir: tmpHtmlProj,
    useLlm: true,
    llmOverride: {
      provider: 'anthropic',
      format: 'anthropic-messages',
      baseUrl: 'https://mock-anth.invalid',
      apiKey: 'mock-vm-key',
      model: 'mock-opus',
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                engineerSummary: 'Mock AI Broadcast Vocal Master -14 LUFS',
                globalPreset: 'broadcast-clean',
                tracks: twoScenes.map((sc) => ({
                  sceneId: sc.id,
                  preset: 'broadcast-clean',
                  hpfHz: 85,
                  presenceGainDb: 2.2,
                  deEssDb: -3.0,
                  compRatio: 3.0,
                  targetLufs: -14,
                  reverbWet: 0.04,
                  reason: 'Clean clarity',
                })),
              }),
            },
          ],
        }),
        { status: 200 },
      ),
  })
  if (!vmLlmRes.ok || !existsSync(join(tmpHtmlProj, 'audio', 'mastered', `${twoScenes[0].id}.wav`))) {
    throw new Error(`AI LLM voice mastering failed: ${JSON.stringify(vmLlmRes)}`)
  }
  console.log(
    `[10/11] Follow-DSH Discovery + All 4 Wire Protocols (${protoCases.map((c) => c.format).join(', ')}) + IndexTTS-2.5 v${liveHealth.version} + AI Voice Mastering (${vmLlmRes.scenesCount} tracks) OK!`,
  )

  // 11. P0-P2 Fusion Verification (OFL Fonts, Safe-Zones, 3-Mode BGM, Voice Cloning + Audition, Schema Tier 1-4, Segment Cache, Vendor .motion, Publish Pack)
  const { computeSafeZonePreflight } = await import('../packages/shared/compliance.js')
  const { runSchemaDirectorWithDegradation } = await import('../packages/dsh-tool-media/plan-schema.js')
  const { scanAiAudioCodeSandbox } = await import('../packages/dsh-tool-media/audio-coder.js')

  // P0.1 OFL fonts copied + proprietary font explicitly rejected by video_lint
  for (const fontName of ['NotoSansSC-VF.woff2', 'SourceHanSerifSC-Heavy.woff2', 'LICENSES.md']) {
    if (!existsSync(join(tmpHtmlProj, 'fonts', fontName))) {
      throw new Error(`Missing bundled commercial OFL font asset in project: fonts/${fontName}`)
    }
  }
  const origHtmlIndex = readFileSync(join(tmpHtmlProj, 'index.html'), 'utf8')
  writeFileSync(join(tmpHtmlProj, 'index.html'), origHtmlIndex + '\n<!-- font-family: "Microsoft YaHei"; -->\n', 'utf8')
  const badFontLint = await executeVideoLint({ projectDir: tmpHtmlProj, engine: 'html' })
  writeFileSync(join(tmpHtmlProj, 'index.html'), origHtmlIndex, 'utf8')
  if (badFontLint.ok) {
    throw new Error('Expected video_lint to REJECT proprietary Microsoft YaHei font reference!')
  }

  // P0.2 Platform Safe-Zone Geometric Preflight
  const dyCollide = computeSafeZonePreflight({ width: 1080, height: 1920, targetPlatform: 'douyin' }, { subtitleBottomPx: 28 })
  const dySafe = computeSafeZonePreflight({ width: 1080, height: 1920, targetPlatform: 'douyin' })
  if (dyCollide.passed || dyCollide.collisions.length < 1 || !dySafe.passed) {
    throw new Error(`Safe-zone preflight failed assertion: collide=${JSON.stringify(dyCollide)}, safe=${JSON.stringify(dySafe)}`)
  }

  // P1.2 HTML5 Segment Cache: post-mastering invalidates cleanly (render 1), consecutive unchanged hits cache (render 2)
  const cacheRender1 = await executeVideoRender({
    projectDir: tmpHtmlProj,
    engine: 'html',
    renderWidth: 1280,
    renderHeight: 720,
    useSegmentCache: true,
  })
  const cacheRender = await executeVideoRender({
    projectDir: tmpHtmlProj,
    engine: 'html',
    renderWidth: 1280,
    renderHeight: 720,
    useSegmentCache: true,
  })
  const cacheFiles = existsSync(join(tmpHtmlProj, 'cache', 'segments'))
    ? readdirSync(join(tmpHtmlProj, 'cache', 'segments')).filter((f) => f.endsWith('.mp4'))
    : []
  if (
    !cacheRender1.ok ||
    !cacheRender.ok ||
    cacheFiles.length < 2 ||
    (cacheRender.segmentCache?.cacheHits || 0) < 2 ||
    (cacheRender.segmentCache?.cacheMisses || 0) !== 0
  ) {
    throw new Error(`Segment cache verification failed: cacheFiles=${cacheFiles.length}, segRes=${JSON.stringify(cacheRender.segmentCache)}`)
  }

  // 3-Mode BGM Verification (llm-coded / uploaded / tts-engine) + Audio Sandbox security check
  const unsafeAudioScan = scanAiAudioCodeSandbox(`require('fs').readFileSync('/etc/passwd')`)
  if (unsafeAudioScan.ok) {
    throw new Error('Audio sandbox scanner failed to block forbidden require("fs") call!')
  }
  if (!existsSync(join(tmpAiProj, 'audio', 'ai_bgm_synth.js')) || !existsSync(join(tmpAiProj, 'audio', 'bgm-llm.wav'))) {
    throw new Error('Mode 1 (llm-coded) BGM artifact audio/ai_bgm_synth.js or bgm-llm.wav missing in AI project!')
  }
  // Mode 2: Uploaded BGM API
  const testBgmSrc = join(tmpAssetSrc, 'bgm_synth_track.wav')
  const bgmUpRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/bgm/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: tmpHtmlProj,
        fileName: 'user-custom-bgm.wav',
        dataBase64: readFileSync(testBgmSrc).toString('base64'),
      }),
    }),
  )
  const bgmUpJson = await bgmUpRes.json()
  if (!bgmUpJson.ok || bgmUpJson.script?.bgmMode !== 'uploaded' || bgmUpJson.asset?.role !== 'music') {
    throw new Error(`Mode 2 (uploaded) BGM route failed: ${JSON.stringify(bgmUpJson)}`)
  }
  // Mode 3: IndexTTS-2.5 TTS-Engine BGM Cue API
  const ttsBgmRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/audio/tts-compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: tmpHtmlProj,
        promptText: '温暖沉浸氛围哼唱和声',
        voiceId: 'auto',
        mode: 'bgm-pad',
        durationSec: 6,
      }),
    }),
  )
  const ttsBgmJson = await ttsBgmRes.json()
  if (!ttsBgmJson.ok || !existsSync(join(tmpHtmlProj, 'audio', 'bgm-tts.wav'))) {
    throw new Error(`Mode 3 (tts-engine) BGM synthesis failed: ${JSON.stringify(ttsBgmJson)}`)
  }

  // Zero-Shot Voice Cloning Lab (Upload -> FFmpeg Clean/Norm -> Live IndexTTS-2.5 Clone Audition)
  const sampleVoicePath =
    process.env.DEFAULT_REF_AUDIO && existsSync(process.env.DEFAULT_REF_AUDIO)
      ? process.env.DEFAULT_REF_AUDIO
      : join(tmpHtmlProj, 'audio', `${twoScenes[0].id}.wav`)
  const cloneUpRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/voices/clone-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: readFileSync(sampleVoicePath).toString('base64'),
        fileName: 'self-test-clone.wav',
        name: '自检临时克隆音色',
        gender: 'female',
        stripSilence: false,
      }),
    }),
  )
  const cloneUpJson = await cloneUpRes.json()
  if (!cloneUpJson.ok || !cloneUpJson.voice?.id) {
    throw new Error(`Voice cloning upload API failed: ${JSON.stringify(cloneUpJson)}`)
  }
  const auditionRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/voices/clone-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceId: cloneUpJson.voice.id,
        text: '测试声音克隆即时试听输出。',
      }),
    }),
  )
  const auditionJson = await auditionRes.json()
  if (!auditionJson.ok || !String(auditionJson.audioDataUrl || '').startsWith('data:audio/wav;base64,')) {
    throw new Error(`Cloned voice audition API failed: ${JSON.stringify(auditionJson)}`)
  }
  // Remove synthetic test clone from persistent catalog/disk so user's clean library stays untouched
  const userCatFile = join(REPO_ROOT, 'voice-packs', 'catalog.json')
  if (existsSync(userCatFile)) {
    try {
      const parsedCat = JSON.parse(readFileSync(userCatFile, 'utf8'))
      parsedCat.voices = (parsedCat.voices || []).filter((v) => v.id !== cloneUpJson.voice.id && v.id !== 'imported-custom-narrator')
      writeFileSync(userCatFile, JSON.stringify(parsedCat, null, 2) + '\n', 'utf8')
    } catch {}
  }
  rmSync(join(REPO_ROOT, 'voice-packs', 'imported', cloneUpJson.voice.id), { recursive: true, force: true })

  // P1.1 Schema Plan Mode + Tier 1-4 Graceful Degradation
  const tier4Res = await runSchemaDirectorWithDegradation({
    topic: 'Tier 4 Rule Fallback Verification',
    style: 'tech',
    forceTierForTest: 4,
  })
  if (tier4Res.degradationTier !== 4 || tier4Res.plan?.version !== 'promo-plan/1' || (tier4Res.resolved?.resolvedShots?.length || 0) < 2) {
    throw new Error(`Schema Tier 4 fallback assertion failed: ${JSON.stringify(tier4Res)}`)
  }

  // P2.2 Isolated .motion Vendor HTML Clip Importer (-an stripped audio)
  const mockVendorDir = join(REPO_ROOT, '.tmp', 'mock-vendor-motion')
  rmSync(mockVendorDir, { recursive: true, force: true })
  mkdirSync(mockVendorDir, { recursive: true })
  writeFileSync(
    join(mockVendorDir, 'index.html'),
    `<!DOCTYPE html><html><body style="margin:0;background:#090B10;color:#E5A93C;display:flex;align-items:center;justify-content:center;font-size:42px;font-family:sans-serif">VENDOR MOTION CLIP</body></html>`,
    'utf8',
  )
  const vendorRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/vendor/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: tmpHtmlProj,
        sourceDir: mockVendorDir,
        name: 'test-vendor-banner',
        durationSec: 1.5,
      }),
    }),
  )
  const vendorJson = await vendorRes.json()
  if (!vendorJson.ok || !existsSync(join(tmpHtmlProj, vendorJson.assetPath))) {
    throw new Error(`Isolated .motion vendor import failed: ${JSON.stringify(vendorJson)}`)
  }
  const vendorProbe = await probeMediaStreams(bins.ffprobe, join(tmpHtmlProj, vendorJson.assetPath))
  if (vendorProbe.streams.some((s) => s.codec_type === 'audio')) {
    throw new Error('Isolated vendor clip MUST strip audio streams (-an)!')
  }

  // P2.1 Platform Publish Pack One-Click Exporter
  const pubRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/publish-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: tmpHtmlProj, platform: 'douyin' }),
    }),
  )
  const pubJson = await pubRes.json()
  if (!pubJson.ok || !existsSync(pubJson.files?.coverPath || '') || !existsSync(pubJson.files?.metaPath || '')) {
    throw new Error(`Publish Pack export failed: ${JSON.stringify(pubJson)}`)
  }

  console.log(
    `[11/13] P0-P2 Fusion Suite OK (OFL fonts + Douyin Safe-Zone + Segment Cache [${cacheFiles.length} clips] + 3-Mode BGM + Voice Clone Audition + Tier 4 Fallback + Isolated Vendor .motion + Publish Pack)!`,
  )

  // 12. v5 AI Agent Command Deck Verification: Avatar Tool (Alpha WebM -> HTML & Remotion), Curate/Edit, TaskManager Abort/Pause/Resume/Retry, Recording & Teleprompter & Skin APIs
  const avHtml = await executeGenerateAvatar({
    projectDir: tmpHtmlProj,
    avatarMode: 'ai-human',
    presetId: 'cyber-anchor',
    avatarLayout: 'pip-br',
    voiceId: 'auto',
    narrationText: '欢迎来到人工智能作战大屏数字人测试。',
    durationSec: 2,
  })
  if (!avHtml.ok || !existsSync(join(tmpHtmlProj, avHtml.relPath))) {
    throw new Error(`executeGenerateAvatar HTML failed: ${JSON.stringify(avHtml)}`)
  }
  const avProbe = await probeMediaStreams(bins.ffprobe, join(tmpHtmlProj, avHtml.relPath))
  const avVStream = (avProbe.streams || []).find((s) => s.codec_type === 'video')
  if (!avVStream || (avVStream.pix_fmt !== 'yuva420p' && avVStream.tags?.alpha_mode !== '1' && !avHtml.hasAlpha)) {
    throw new Error(`Avatar WebM missing alpha stream metadata: ${JSON.stringify(avVStream)}`)
  }
  syncProjectCodeFromScript(tmpHtmlProj, readScriptJson(tmpHtmlProj).data, { forceOverwrite: true })
  if (!readFileSync(join(tmpHtmlProj, 'index.html'), 'utf8').includes('avatar-overlay-video')) {
    throw new Error('HTML5 generator missing #avatar-overlay-video after avatarClip script update!')
  }

  const avRem = await executeGenerateAvatar({
    projectDir: tmpRemotionProj,
    avatarMode: 'ai-human',
    presetId: 'warm-mentor',
    avatarLayout: 'pip-bl',
    voiceId: 'auto',
    narrationText: 'Remotion 数字人透明通道合成测试。',
    durationSec: 2,
  })
  if (!avRem.ok || !existsSync(join(tmpRemotionProj, avRem.relPath))) {
    throw new Error(`executeGenerateAvatar Remotion failed: ${JSON.stringify(avRem)}`)
  }
  syncProjectCodeFromScript(tmpRemotionProj, readScriptJson(tmpRemotionProj).data, { forceOverwrite: true })
  if (
    !readFileSync(join(tmpRemotionProj, 'src', 'VideoComposition.tsx'), 'utf8').includes('AvatarOverlay') ||
    !existsSync(join(tmpRemotionProj, 'public', avRem.relPath))
  ) {
    throw new Error('Remotion generator missing AvatarOverlay import or public/ avatar WebM sync!')
  }

  const curateRes = await executeCurateAndEditAssets({
    projectDir: tmpHtmlProj,
    aspectRatio: '16:9',
    quality: '720p',
    style: 'cinematic',
    trimSeconds: 1,
  })
  if (!curateRes.ok || (curateRes.editedCount || 0) < 1 || !existsSync(join(tmpHtmlProj, 'assets', 'edited'))) {
    throw new Error(`executeCurateAndEditAssets failed: ${JSON.stringify(curateRes)}`)
  }

  // TaskManager Start -> Pause -> Resume -> Stop (immediate child process termination) -> Retry
  let spawnedChildPid = 0
  const createdRun = taskManager.createRun({
    projectDir: tmpHtmlProj,
    title: 'Self-Test TaskManager Lifecycle',
    mode: 'fast-draft',
    subtasks: [
      { id: 't-step1', stage: 'director', name: '步骤一', kind: 'script_plan' },
      { id: 't-step2', stage: 'motion_qa', name: '步骤二(含阻塞子进程)', kind: 'mp4_render' },
    ],
  })
  let mockPassCount = 0
  await taskManager.startRun(createdRun.id, async (runObj, helpers) => {
    mockPassCount++
    if (mockPassCount >= 2) {
      helpers.updateTask('t-step1', { status: 'completed', progress: 100 })
      helpers.updateTask('t-step2', { status: 'completed', progress: 100 })
      return { retried: true }
    }
    helpers.updateTask('t-step1', { status: 'completed', progress: 100 })
    await helpers.waitIfPaused()
    helpers.updateTask('t-step2', { status: 'running', progress: 35, message: '等待测试子进程...' })
    await new Promise((resolvePromise, rejectPromise) => {
      const ch = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 25000)'], { stdio: 'ignore' })
      spawnedChildPid = ch.pid || 0
      helpers.onChild(ch)
      const onAbort = () => rejectPromise(new Error('Task aborted cleanly'))
      if (helpers.signal.aborted) return onAbort()
      helpers.signal.addEventListener('abort', onAbort, { once: true })
      ch.on('exit', () => resolvePromise())
    })
  })
  await new Promise((r) => setTimeout(r, 150))
  taskManager.pauseRun(createdRun.id)
  if (taskManager.getRun(createdRun.id)?.status !== 'paused') {
    throw new Error('TaskManager pauseRun did not transition status to paused')
  }
  await taskManager.resumeRun(createdRun.id)
  for (let i = 0; i < 20 && !spawnedChildPid; i++) await new Promise((r) => setTimeout(r, 50))
  if (!spawnedChildPid) throw new Error('TaskManager resumed run did not spawn test child process')
  taskManager.stopRun(createdRun.id)
  await new Promise((r) => setTimeout(r, 250))
  const stoppedRun = taskManager.getRun(createdRun.id)
  if (stoppedRun?.status !== 'stopped') {
    throw new Error(`TaskManager stopRun failed: status=${stoppedRun?.status}`)
  }
  let childStillAlive = false
  try {
    process.kill(spawnedChildPid, 0)
    childStillAlive = true
  } catch {}
  if (childStillAlive) {
    throw new Error(`TaskManager stopRun left child PID ${spawnedChildPid} alive!`)
  }
  await taskManager.retryRun(createdRun.id)
  for (let i = 0; i < 30 && taskManager.getRun(createdRun.id)?.status !== 'completed'; i++) {
    await new Promise((r) => setTimeout(r, 50))
  }
  if (taskManager.getRun(createdRun.id)?.status !== 'completed') {
    throw new Error(`TaskManager retryRun did not complete cleanly: ${taskManager.getRun(createdRun.id)?.status}`)
  }

  // Workbench API checks: /assets/recording + /teleprompter/generate + /tasks + /skin/upload
  const syntheticRecWebm = join(REPO_ROOT, '.tmp', 'synthetic-cam.webm')
  await runCommandRedirected(
    bins.ffmpeg,
    ['-y', '-f', 'lavfi', '-i', 'color=c=#1e293b:s=320x240:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libvpx', '-c:a', 'libopus', syntheticRecWebm],
    { timeoutMs: 20_000 },
  )
  const recApiRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/assets/recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: tmpHtmlProj,
        fileName: 'webcam-test.webm',
        role: 'host_video',
        extractVoiceClone: false,
        dataBase64: readFileSync(syntheticRecWebm).toString('base64'),
      }),
    }),
  )
  const recApiJson = await recApiRes.json()
  if (!recApiJson.ok || !existsSync(join(tmpHtmlProj, recApiJson.relPath)) || recApiJson.asset?.role !== 'host_video') {
    throw new Error(`Recording save API failed: ${JSON.stringify(recApiJson)}`)
  }
  const teleRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/teleprompter/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: tmpHtmlProj, topic: 'AI Agent 协同作战测试', durationSec: 30 }),
    }),
  )
  const teleJson = await teleRes.json()
  if (!teleJson.ok || !Array.isArray(teleJson.lines) || teleJson.lines.length < 2) {
    throw new Error(`Teleprompter generate API failed: ${JSON.stringify(teleJson)}`)
  }
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ).toString('base64')
  const skinUpRes = await handleWorkbenchApiRequest(
    new Request('http://127.0.0.1:4399/api/video-workbench/skin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'self-test-skin.png', dataBase64: png1x1 }),
    }),
  )
  const skinUpJson = await skinUpRes.json()
  const skinGetRes = await handleWorkbenchApiRequest(
    new Request(`http://127.0.0.1:4399${skinUpJson.url}`, { method: 'GET' }),
  )
  rmSync(join(REPO_ROOT, '.skins', skinUpJson.name || 'nonexistent'), { force: true })
  if (!skinUpJson.ok || skinGetRes.status !== 200) {
    throw new Error(`Skin upload/get API failed: up=${JSON.stringify(skinUpJson)} get=${skinGetRes.status}`)
  }

  console.log(
    `[12/13] v5 AI Agent Command Deck OK (Alpha Avatar WebM [${avVStream.pix_fmt}] -> HTML5 & Remotion + Curate/Edit [${curateRes.editedCount}] + TaskManager Pause/Resume/Kill/Retry + Webcam Recording + Teleprompter + Skin)!`,
  )

  // 13. Re-scaffold clean starter demos & validate Lint + Open-Source Hygiene Scan
  const demoDir = join(REPO_ROOT, 'examples', 'demo-html-project')
  const demoRemotionDir = join(REPO_ROOT, 'examples', 'demo-remotion-project')
  scaffoldVideoProject(demoDir, {
    title: 'DeepSeek Harness 双引擎视频工作台演示 (HTML5 动效)',
    engine: 'html',
  })
  scaffoldVideoProject(demoRemotionDir, {
    title: 'DeepSeek Harness 双引擎视频工作台演示 (Remotion)',
    engine: 'remotion',
  })
  matchAllScenesInScript(demoDir, { voiceId: 'auto' })
  matchAllScenesInScript(demoRemotionDir, { voiceId: 'auto' })
  syncProjectCodeFromScript(demoDir, readScriptJson(demoDir).data, { forceOverwrite: true })
  syncProjectCodeFromScript(demoRemotionDir, readScriptJson(demoRemotionDir).data, { forceOverwrite: true })
  const demoHtmlLint = await executeVideoLint({ projectDir: demoDir, engine: 'html' })
  const demoRemLint = await executeVideoLint({ projectDir: demoRemotionDir, engine: 'remotion' })
  if (!demoHtmlLint.ok || !demoRemLint.ok) {
    throw new Error(`Demo lint check failed: html=${demoHtmlLint.errors.join(';')} rem=${demoRemLint.errors.join(';')}`)
  }

  const violations = scanForHardcodedPaths(REPO_ROOT)
  if (violations.length > 0) {
    throw new Error(`Hardcoded machine paths found in tracked files: ${violations.join(', ')}`)
  }
  console.log(
    `[13/13] Starter Demos lint-verified & 0 hardcoded personal paths/keys across all tracked files!`,
  )
  console.log('======================================================================')
}

runSelfTest().catch((err) => {
  console.error('❌ Self-Test Failed:', err)
  process.exit(1)
})
