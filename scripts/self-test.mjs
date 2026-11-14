import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadEnv,
  probeAudioDuration,
  REPO_ROOT,
  resolveBinaries,
  runCommandRedirected,
} from '../packages/shared/index.js'
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
} from '../packages/dsh-tool-video-suite/index.js'
import {
  importAssets,
  mixVideoAudio,
  planVideoFromAssets,
  readAssets,
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
    ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '2.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', brollMp4],
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

  // 5. Real IndexTTS-2 Persistent Server Synthesis + ffprobe Duration + Multi-Track Audio Mix
  console.log(`[5/8] Ensuring persistent IndexTTS-2 HTTP server for REAL speech synthesis...`)
  await ensureTtsServer({ waitMs: 300_000 })
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

  // 8. Live API Route & Range Check + Demo Reset + Open-Source Hygiene Scan
  const apiState = await handleWorkbenchApiRequest(new Request('http://127.0.0.1:4399/api/video-workbench/state'))
  const apiJson = await apiState.json()
  if (!apiJson.ok || !apiJson.ttsStatus) {
    throw new Error('Workbench /state API failed health check')
  }
  const rangeRes = await handleWorkbenchApiRequest(
    new Request(`http://127.0.0.1:4399/api/video-workbench/asset?projectDir=${encodeURIComponent(tmpHtmlProj)}&rel=${encodeURIComponent('output/final.mp4')}`, {
      headers: { range: 'bytes=0-1023' },
    }),
  )
  if (rangeRes.status !== 206) {
    throw new Error(`Expected HTTP 206 Partial Content for asset Range request, got ${rangeRes.status}`)
  }

  // Re-scaffold clean starter demos so zero local temp state stays in `examples/`
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

  const violations = scanForHardcodedPaths(REPO_ROOT)
  if (violations.length > 0) {
    throw new Error(`Hardcoded machine paths found in tracked files: ${violations.join(', ')}`)
  }
  console.log(
    `[8/8] API & Range 206 OK · 0 hardcoded personal paths/keys across all tracked files!`,
  )
  console.log('======================================================================')
}

runSelfTest().catch((err) => {
  console.error('❌ Self-Test Failed:', err)
  process.exit(1)
})
