#!/usr/bin/env node
/**
 * 可填空模板 (template fill) — tests (local; the one model call goes to a mock on 127.0.0.1, no keys, no cost):
 *   - the blanks of every built-in plaza template: words per shot with the template's text as the example, picture
 *     places (the template's picture shots vs. "use my picture" on animated shots), film title / music / banner
 *   - the text helpers: phrases of a line, key words, a short title, the banner character
 *   - a pure-music history template filled with two shots of new words and a generated track: every on-screen word of
 *     a changed shot comes from the new words, the other shots keep the template's, the banner follows the new
 *     person, the cuts sit on the generated track's beats, no template voice / local path / music file leaks in
 *   - a picture template filled from a library: chosen items stay, empty places take library items (rotating, never
 *     twice in a shot), long clips get a window, the chosen song is analysed, 'generate' ignores library songs
 *   - the REST routes (slots / fill / fill-suggest) and the AI text suggestion against the mock model
 *   - the MCP tool and the panel kit expose it
 *
 *   node scripts/tests/template-fill.test.mjs
 */
import { spawnSync } from 'node:child_process'
import https from 'node:https'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODEL_ENV_VARS, startMockLlm } from './mock-llm-server.mjs'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'template-fill-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), voices: join(SCR, 'voices'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of MODEL_ENV_VARS) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  VOICE_PACKS_DIR: dirs.voices,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error(`network blocked in tests: ${url}`)
  return realFetch(input, init)
}
https.request = () => {
  throw new Error('https blocked in tests')
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? `  — ${detail}` : ''}`)
}
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 700))
  }
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const tf = await imp('packages/dsh-tool-media/template-fill.js')
const { scaffoldVideoProject } = await imp('packages/dsh-preset-video/index.js')
const { readScriptJson, resolveBinaries } = await imp('packages/shared/index.js')
const am = await imp('packages/dsh-tool-media/asset-manager.js')
const TEMPLATES = ['data-ranking-story', 'history-epic-beat', 'saas-ui-tutorial', 'science-visual-explainer', 'tech-launch-keynote']

// test media made with FFmpeg: a 20 s clip (long enough for a window), a 6 s clip, two pictures, a 40 s beat track
const { ffmpeg } = resolveBinaries()
const SRC = join(SCR, 'src')
mkdirSync(SRC, { recursive: true })
const ff = (args) => spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', ...args], { windowsHide: true })
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=20', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', join(SRC, 'long-clip.mp4')])
ff(['-f', 'lavfi', '-i', 'mandelbrot=s=640x360:r=30,trim=duration=6,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', join(SRC, 'short-clip.mp4')])
ff(['-f', 'lavfi', '-i', 'testsrc=s=640x360:d=1', '-frames:v', '1', join(SRC, 'photo-a.png')])
ff(['-f', 'lavfi', '-i', 'smptebars=s=640x360:d=1', '-frames:v', '1', join(SRC, 'photo-b.png')])
ff(['-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*55*t)*exp(-30*mod(t,0.5))':s=22050:d=40", join(SRC, 'song.wav')])
const LIB = ['long-clip.mp4', 'short-clip.mp4', 'photo-a.png', 'photo-b.png', 'song.wav'].map((f) => join(SRC, f))

let n = 0
async function project(withMedia) {
  const dir = join(SCR, `proj-${++n}`)
  scaffoldVideoProject(dir, { title: '旧工程', engine: 'html', style: 'tech' })
  if (withMedia) await am.importAssets({ projectDir: dir, sources: LIB })
  return dir
}
const leak = (obj) => JSON.stringify(obj).match(/[A-Za-z]:\\\\|voiceRefAudio|voiceMastering|music-uploaded-media|ttsNarrationRef":"(?!.)/)

await section('the blanks of every built-in template', async () => {
  check('test media written', LIB.every((f) => existsSync(f)))
  for (const id of TEMPLATES) {
    const d = tf.describeTemplateSlots(id)
    const all = [...d.filmSlots, ...d.scenes.flatMap((s) => s.slots)]
    const ids = all.map((s) => s.id)
    const lines = d.scenes.map((s) => s.slots.find((x) => x.id.endsWith('.line')))
    check(`${id}: one card per shot with title + line, unique ids`, d.scenes.length === d.template.shotCount && d.scenes.length > 0 && new Set(ids).size === ids.length && lines.every((l) => l && l.example && l.maxLength >= 40))
    check(`${id}: film title and music blanks`, d.filmSlots.some((s) => s.id === 'film.title' && s.example) && d.filmSlots.some((s) => s.id === 'film.music' && s.kind === 'music'))
    check(`${id}: every shot has a picture place`, d.scenes.every((s) => s.slots.some((x) => x.kind !== 'text')))
  }
  const hist = tf.describeTemplateSlots('history-epic-beat')
  check('history: pure music, stage words and a banner blank', hist.template.narrationMode === 'subtitle-mv' && hist.template.stageShots === 53 && hist.scenes[0].slots.some((s) => s.id === 's01.stage.headline') && hist.filmSlots.some((s) => s.id === 'film.bannerChar' && s.example === '汉'))
  check('history: picture places are optional (the shots are animation)', hist.counts.media === 0 && hist.counts.optionalMedia === 53 && hist.scenes.every((s) => s.slots.filter((x) => x.kind !== 'text').every((x) => x.required === false)))
  const tut = tf.describeTemplateSlots('saas-ui-tutorial')
  check('tutorial: 24 required picture places + window titles', tut.counts.media === 24 && tut.scenes.every((s) => s.slots.some((x) => x.id.endsWith('.windowTitle'))))
  const key = tf.describeTemplateSlots('tech-launch-keynote')
  const fan = key.scenes[0].slots.filter((x) => x.kind !== 'text' && x.required)
  check('keynote: vertical, a card fan of 5 still pictures (the layout cannot show clips)', key.template.aspectRatio === '9:16' && fan.length === 5 && fan.every((x) => x.kind === 'image'))
  check('a picture place notes what the template had there', key.scenes[1].slots.some((x) => x.kind === 'visual' && x.prefer === 'image'))
  let bad = null
  try {
    tf.describeTemplateSlots('no-such-template')
  } catch (e) {
    bad = e
  }
  check('an unknown template is an error', Boolean(bad))
})

await section('text helpers', async () => {
  check('phrases: clauses, long clauses split at connectives, never cut mid-word', JSON.stringify(tf.phrasesOf('少年岳飞在汤阴苦练枪法，终成一代名将', 8)) === JSON.stringify(['少年岳飞', '汤阴苦练枪法', '终成一代名将']), JSON.stringify(tf.phrasesOf('少年岳飞在汤阴苦练枪法，终成一代名将', 8)))
  check('phrases: spaces around numbers are not breaks', tf.phrasesOf('他率 800 骑夜袭敌营', 10)[0] === '他率800骑夜袭敌营')
  check('key words: as many as the template had, a number with its unit', JSON.stringify(tf.deriveHighlights('他率 800 骑夜袭敌营，一战成名', ['八百轻骑', '夜袭'])) === JSON.stringify(['一战成名', '800骑']), JSON.stringify(tf.deriveHighlights('他率 800 骑夜袭敌营，一战成名', ['八百轻骑', '夜袭'])))
  check('a short line is its own title, a long one gives its first phrase', tf.titleFromLine('少年岳飞在汤阴苦练枪法', 10) === '少年岳飞在汤阴苦练枪法' && tf.titleFromLine('少年岳飞在汤阴苦练枪法，终成一代名将', 10) === '少年岳飞')
  check('banner character from the words', tf.inferBannerChar('岳飞的一生') === '宋' && tf.inferBannerChar('霍去病封狼居胥') === '汉' && tf.inferBannerChar('我们的新产品') === '')
})

await section('a pure-music history template with new words', async () => {
  const dir = await project(false)
  const fills = { 'film.title': '岳飞传', 's01.title': '少年岳飞', 's01.line': '少年岳飞在汤阴苦练枪法', 's02.line': '他率 800 骑夜袭敌营', 'not.a.slot': 'x', 's03.title': '   ' }
  const progress = []
  const r = await tf.fillTemplateIntoProject({ projectDir: dir, templateId: 'history-epic-beat', fills, onProgress: (p) => progress.push(p.message) })
  const s = readScriptJson(dir).data
  const [a, b, c] = s.scenes
  check('result: 53 shots, 2 changed, generated music at the template tempo', r.ok && r.scenes === 53 && r.changedShots === 2 && r.music.generated && r.music.bpm === 90 && r.needsVoice === false)
  check('the project is a filled template film', s.authoringMode === 'template-fill' && s.productionType === 'ai-film' && s.narrationMode === 'subtitle-mv' && s.templateFill?.templateId === 'history-epic-beat' && s.width === 1920 && s.height === 1080)
  check('the film title', s.title === '岳飞传' && s.displayTitle === '岳飞传')
  check('shot 1: title, line, subtitles and stage words from the new words', a.title === '少年岳飞' && a.narration === '少年岳飞在汤阴苦练枪法' && a.stageSpec.headline === '少年岳飞' && a.subtitles.map((u) => u.text).join('') === '少年岳飞在汤阴苦练枪法' && !a.stageSpec.subheadline)
  check('shot 2: a title from its line, the big number from it', b.title === '他率800骑夜袭敌营' && b.stageSpec.heroNum === '800' && b.stageSpec.heroUnit === '骑' && b.highlights.includes('800骑'), JSON.stringify({ t: b.title, n: b.stageSpec.heroNum, u: b.stageSpec.heroUnit, h: b.highlights }))
  const tpl = tf.describeTemplateSlots('history-epic-beat').scenes[2]
  check('an untouched shot keeps the template words', c.title === tpl.title && c.narration === tpl.slots.find((x) => x.id === 's03.line').example)
  check('the banner follows the new person on every shot (岳飞 → 宋)', s.scenes.filter((x) => x.stageSpec?.bannerChar).every((x) => x.stageSpec.bannerChar === '宋'))
  const beat = 60 / s.bgm.bpm
  const ends = s.scenes.slice(0, -1).map((x) => (x.startFrame + x.durationInFrames) / s.fps)
  check('cuts on the generated track beats, contiguous', s.bgmMode === 'generated' && s.bgm.path === '' && ends.every((t) => Math.abs(t / beat - Math.round(t / beat)) < 0.06) && s.scenes.every((x, i) => i === 0 || x.startFrame === s.scenes[i - 1].startFrame + s.scenes[i - 1].durationInFrames))
  check('scene ids are new, built-in diorama layout for the animated shots', s.scenes.every((x, i) => x.id === `tf-${String(i + 1).padStart(2, '0')}`) && s.scenes.every((x) => x.layout === 'narrative-diorama'))
  check('no template voice / local path / music file in the project', !leak(s) && s.scenes.every((x) => !x.audioFile && x.voiceLocked === false), String(leak(s)))
  check('typed words are recorded as the user\'s own (kept by later AI runs)', s.userOverrides?.['tf-01']?.title === '少年岳飞' && s.userOverrides?.['tf-02']?.narration === '他率 800 骑夜袭敌营' && !s.userOverrides['tf-03'])
  check('unknown and blank fills are ignored, the fills are stored for the next round', s.templateFill.fills['not.a.slot'] === undefined && s.templateFill.fills['s03.title'] === undefined && s.templateFill.fills['s01.line'] === '少年岳飞在汤阴苦练枪法')
  check('Remotion project and HTML written, MOTION.md from the template', existsSync(join(dir, 'src', 'VideoComposition.tsx')) && existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'MOTION.md')))
  const ph = await imp('packages/dsh-tool-media/project-history.js')
  const versions = ph.listProjectVersions(dir).versions || []
  check('a version was saved before the storyboard was replaced', versions.some((v) => /template-fill/.test(JSON.stringify(v))), JSON.stringify(versions.map((v) => v.label || v.stage)))
  check('progress in plain Chinese', progress.some((m) => /套用模板/.test(m)) && progress.some((m) => /完成/.test(m)))
  // a picture of the user's own on an animated shot replaces the animation there
  const dir2 = await project(true)
  const lib = tf.templateFillLibrary(dir2)
  const photo = lib.visuals.find((v) => v.type === 'image')
  await tf.fillTemplateIntoProject({ projectDir: dir2, templateId: 'history-epic-beat', fills: { 's05.media.0': photo.id, 'film.music': 'generate' } })
  const s2 = readScriptJson(dir2).data
  check('an own picture on an animated shot: a picture layout, no stage there, other shots untouched', s2.scenes[4].media?.[0]?.assetId === photo.id && !s2.scenes[4].stageSpec && s2.scenes[4].layout === 'media-split-motion' && s2.scenes.filter((x) => x.media).length === 1)
  const synth = await imp('packages/dsh-tool-media/audio-synth.js')
  const res = await synth.ensureProjectAudioAssets(dir2, s2, am.readAssets(dir2))
  check("'generate' music is generated even with a song in the library", s2.bgmMode === 'generated' && res.bgmPath === 'audio/bgm-generated.wav' && /generated|ai-audio-spec/.test(res.bgmSource), JSON.stringify(res))
})

await section('a picture template from the library', async () => {
  const dir = await project(true)
  const lib = tf.templateFillLibrary(dir)
  const shortClip = lib.visuals.find((v) => v.name === 'short-clip.mp4')
  const song = lib.music[0]
  check('library: pictures, clips and the song', lib.visuals.length === 4 && lib.music.length === 1 && song.name === 'song.wav')
  const r = await tf.fillTemplateIntoProject({ projectDir: dir, templateId: 'tech-launch-keynote', fills: { 's02.media.0': shortClip.id, 's01.line': '三分钟看懂我们的新产品', 'film.music': song.id } })
  const s = readScriptJson(dir).data
  const info = tf.describeTemplateSlots('tech-launch-keynote')
  const required = info.scenes.reduce((n2, sc) => n2 + sc.slots.filter((x) => x.kind !== 'text' && x.required).length, 0)
  const images = lib.visuals.filter((v) => v.type === 'image').length
  const stillShort = info.scenes.reduce((n2, sc) => n2 + Math.max(0, sc.slots.filter((x) => x.kind === 'image' && x.required).length - images), 0)
  check('every picture place filled that can be (stills only where the layout needs stills)', r.filledMedia === 1 && r.autoFilledMedia === required - 1 - stillShort && r.emptyMedia === stillShort && stillShort > 0, JSON.stringify(r))
  check('no clip in a still-picture layout', s.scenes.filter((x) => ['card-fan-opener', 'split-wipe-compare'].includes(x.layout)).every((x) => (x.media || []).every((m) => m.type === 'image')))
  check('the chosen clip is in its shot', s.scenes[1].media?.[0]?.assetId === shortClip.id)
  check('never the same item twice in one shot', s.scenes.every((x) => !x.media || new Set(x.media.map((m) => m.assetId)).size === x.media.length))
  const singles = s.scenes.map((x) => (x.media && x.media.length === 1 ? x.media[0].assetId : null))
  check('one-picture shots in a row do not repeat the same item', singles.every((id, i) => !id || i === 0 || id !== singles[i - 1]))
  check('the long clip gets a window for its shot', s.scenes.some((x) => (x.media || []).some((m) => m.trimAuto && m.trimEndSec > m.trimStartSec)))
  check('the vertical frame of the template', s.width === 1080 && s.height === 1920 && s.aspectRatio === '9:16')
  check('the chosen song is analysed and used', s.bgmMode === 'uploaded' && s.bgm.analyzed && /^assets\//.test(s.bgm.path) && r.music.id === song.id && r.needsVoice === true)
  check('picture layouts keep their pictures, the template layouts stay built-in', s.scenes.every((x) => !['card-fan-opener', 'app-focus-shot', 'compare-dual', 'split-wipe-compare', 'mosaic-pulse-wall'].includes(x.layout) || (x.media && x.media.length)))
  // without a library the picture places become kinetic type (the film still renders)
  const dir3 = await project(false)
  const r3 = await tf.fillTemplateIntoProject({ projectDir: dir3, templateId: 'saas-ui-tutorial', fills: {} })
  const s3 = readScriptJson(dir3).data
  check('no library: empty picture places become type layouts', r3.emptyMedia === 24 && s3.scenes.every((x) => !x.media && ['3d-stage-opener', 'kinetic-impact', 'radial-climax'].includes(x.layout)))
  const r4 = await tf.fillTemplateIntoProject({ projectDir: dir, templateId: 'tech-launch-keynote', fills: {}, autoFillMedia: false })
  check('auto-fill off: only chosen pictures', r4.autoFilledMedia === 0 && r4.filledMedia === 0 && r4.emptyMedia === required)
})

await section('REST routes and the AI text suggestion', async () => {
  const llm = await imp('packages/dsh-tool-media/llm-client.js')
  const mock = await startMockLlm((rec) => {
    // answer every requested blank: 「新:<id>」, plus an unknown key and an over-long value
    const ids = [...rec.text.matchAll(/^(film\.[A-Za-z]+|s\d{2}\.[A-Za-z.]+)｜/gm)].map((m) => m[1])
    const out = Object.fromEntries(ids.map((id) => [id, id === 'film.title' ? '岳飞传' : `新:${id}`]))
    out['evil.key'] = 'x'
    if (ids.includes('s01.line')) out['s01.line'] = '长'.repeat(900)
    return { text: JSON.stringify(out) }
  })
  try {
    writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'custom', configVersion: 2, provider: 'custom', format: 'openai-completions', baseUrl: mock.url, apiKey: 'sk-test-template-fill-0001', model: 'mock-model' }))
    const routes = await imp('packages/dsh-web-video-workbench/lib/routes-talk.js')
    const jobs = new Map()
    const createBackgroundJob = (msg, runner) => {
      const job = { id: `job-${jobs.size + 1}`, status: 'running', message: msg }
      const done = runner(() => {}).then(
        (r) => Object.assign(job, { status: 'done', result: r }),
        (e) => Object.assign(job, { status: 'error', error: String(e?.message || e) }),
      )
      jobs.set(job.id, { job, done })
      return job
    }
    const call = async (method, path, body, query = '') => {
      const url = new URL(`http://localhost/api/video-workbench/${path}${query}`)
      const req = new Request(url, method === 'GET' ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
      const res = await routes.handleTalkApiRequest(req, url, { createBackgroundJob })
      return { status: res.status, body: await res.json() }
    }
    const waitJob = async (r) => {
      const j = jobs.get(r.body.jobId)
      await j.done
      return j.job
    }
    const dir = await project(true)
    const q = (id) => `?id=${encodeURIComponent(id)}&projectDir=${encodeURIComponent(dir)}`
    const s1 = await call('GET', 'plaza/slots', null, q('history-epic-beat'))
    check('GET plaza/slots: the blanks + the project library, nothing filled yet', s1.status === 200 && s1.body.scenes.length === 53 && s1.body.library.visuals.length === 4 && s1.body.last === null)
    const bad = await call('GET', 'plaza/slots', null, q('../secrets'))
    check('a template id that is not a slug is refused', bad.status === 400)
    const f = await call('POST', 'plaza/fill', { projectDir: dir, templateId: 'history-epic-beat', fills: { 's01.line': '新的一句', 'bad key!': 'x', 's02.title': 42 } })
    const fj = await waitJob(f)
    check('POST plaza/fill runs as a job and fills the project', f.status === 200 && fj.status === 'done' && fj.result.changedShots === 1 && readScriptJson(dir).data.scenes[0].narration === '新的一句', fj.error || '')
    const s2 = await call('GET', 'plaza/slots', null, q('history-epic-beat'))
    check('the last fills come back for this template only', s2.body.last?.fills?.['s01.line'] === '新的一句' && Object.keys(s2.body.last.fills).length === 1 && (await call('GET', 'plaza/slots', null, q('tech-launch-keynote'))).body.last === null)
    const noTopic = await call('POST', 'plaza/fill-suggest', { projectDir: dir, templateId: 'history-epic-beat', topic: ' ' })
    check('the AI suggestion needs a topic', noTopic.status === 400 && /讲什么/.test(noTopic.body.error))
    const before = mock.requests.length
    const sg = await call('POST', 'plaza/fill-suggest', { projectDir: dir, templateId: 'history-epic-beat', topic: '岳飞的一生' })
    const sj = await waitJob(sg)
    const info = tf.describeTemplateSlots('history-epic-beat')
    const textIds = [...info.filmSlots, ...info.scenes.flatMap((s) => s.slots)].filter((s) => s.kind === 'text').map((s) => s.id)
    const fills = sj.result?.fills || {}
    check('the model wrote every text blank, in pages of shots', sj.status === 'done' && Object.keys(fills).length === textIds.length && mock.requests.length - before === 4, `${sj.error || ''} ${Object.keys(fills).length}/${textIds.length} requests ${mock.requests.length - before}`)
    check('unknown keys dropped, over-long text clipped to the blank', fills['evil.key'] === undefined && fills['s01.line'].length <= info.scenes[0].slots.find((s) => s.id === 's01.line').maxLength && fills['film.title'] === '岳飞传')
    const req0 = mock.requests[before]
    check('the request carries the topic, the template examples and asks for JSON', /岳飞的一生/.test(req0.text) && /模板原文：你以少年之名出塞/.test(req0.text) && req0.body?.response_format?.type === 'json_object', JSON.stringify(req0.body?.response_format || null))
    check('nothing was written to the project by the suggestion', readScriptJson(dir).data.scenes[0].narration === '新的一句')
  } finally {
    await mock.close()
  }
})

await section('MCP tool and panel kit', async () => {
  const idx = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'index.js'), 'utf8')
  check("manage_template_plaza has the 'slots' and 'fill' actions", /enum: \['list', 'get', 'apply', 'publish', 'slots', 'fill'/.test(idx) && /fillTemplateIntoProject\(\{ projectDir: args\.projectDir/.test(idx))
  const client = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js'), 'utf8')
  check('the panel kit may call the routes', /'plaza\/slots'/.test(client) && /'plaza\/fill', 'plaza\/fill-suggest'/.test(client))
  const kit = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit.js'), 'utf8')
  check('the 模板填空 panel is in the built kit and the plaza opens it', kit.includes("PK.panel('templateFill'") && kit.includes("PK.open('templateFill', { templateId: t.id })"))
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
// let closing sockets / child processes settle (an immediate exit can trip a libuv assertion on Windows)
process.exitCode = failed.length ? 1 : 0
setTimeout(() => process.exit(process.exitCode), 1500).unref()
