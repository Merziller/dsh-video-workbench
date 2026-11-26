#!/usr/bin/env node
/**
 * Host compatibility of the plugin entry (index.js → dsh-preset-video → the four tool plugins + the web workbench):
 *   - NEW DSH host (DSH NEXT: @deepseek-ai/cordis 4 + @deepseek-ai/dsh-tools): reading `ctx.<service>` throws
 *     `cannot get property "<name>" without inject` unless the plugin (or an ancestor plugin) lists it in `inject`, a
 *     plugin waits until its injected services exist, an error thrown by apply() is logged by the host, and
 *     `tools.register()` refuses a definition without `output.schema` and a function `output.render`
 *     (`render(args, value) => ContentBlock[]`). Every tool must register and every render must return text blocks;
 *   - OLD-style host / the MCP and CLI shims (no checks): exactly the same tools;
 *   - installed layouts: dependencies are resolved from the package root (own node_modules, hoisted parent
 *     node_modules, pnpm virtual store), never from the REPO_ROOT data folder; three's "exports" hides package.json;
 *   - the MCP server still lists the same tools with the same input schemas.
 *
 *   node scripts/tests/host-compat.test.mjs
 *
 * Offline; scratch data only (<repo>/.tmp/host-compat/<stamp>); the real .env, DSH profiles and projects are not used.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'host-compat', new Date().toISOString().replace(/[:.]/g, '-'))
// The MCP server lists the plugin's tools plus its two MCP-only helpers. Update when a tool is added or removed.
const EXPECTED_PLUGIN_TOOLS = 47
const MCP_ONLY_TOOLS = ['install_tts_engine', 'open_video_studio']

const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), voices: join(SCR, 'voices'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
const BASE_ENV = {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  VOICE_PACKS_DIR: dirs.voices,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
}
delete process.env.REMOTION_TEMPLATE_ROOT
Object.assign(process.env, BASE_ENV)
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const imp = (file) => import(pathToFileURL(join(ROOT, file)).href)
const rel = (p) => (p ? relative(SCR, p) : String(p))
const sorted = (xs) => [...xs].sort()
const sameList = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/**
 * A NEW DSH host, modelled on the published @deepseek-ai/cordis 4 context and @deepseek-ai/dsh-tools typings.
 * `rejectTools` makes register() refuse those names (a host rejecting one definition).
 */
function createStrictHost({ services: only = null, rejectTools = [], presetRegister = true } = {}) {
  const tools = new Map()
  const log = []
  const waiting = []
  const presets = []
  const routes = []
  const staticModules = []
  const services = {
    tools: {
      register(def) {
        const name = def?.name
        if (typeof name !== 'string' || !name) throw new TypeError('tool definition without a name')
        if (typeof def.execute !== 'function') throw new TypeError(`${name}: execute must be a function`)
        const out = def.output
        if (!out || typeof out !== 'object' || !out.schema || typeof out.schema !== 'object') throw new TypeError(`${name}: output.schema is required`)
        if (typeof out.render !== 'function') throw new TypeError(`${name}: output.render must be a function`)
        if (name === 'run_code' || tools.has(name)) throw new Error(`${name}: duplicate or reserved tool name`)
        if (rejectTools.includes(name)) throw new Error(`${name}: rejected by this host`)
        tools.set(name, def)
        return () => tools.delete(name)
      },
    },
    agentPresets: {
      register(p) {
        presets.push(p?.id)
        return () => {}
      },
    },
    connection: {
      fetch: {
        register(r) {
          routes.push(r?.path)
          return () => {}
        },
      },
    },
    webui: {
      addStaticModule(m) {
        staticModules.push(m)
      },
    },
  }
  if (only) for (const k of Object.keys(services)) if (!only.includes(k)) delete services[k]
  // DSH NEXT: the agentPresets service reads preset folders itself and has no register() for plugins
  if (!presetRegister && services.agentPresets) services.agentPresets = {}
  const injectNames = (decl) => (Array.isArray(decl) ? decl : decl && typeof decl === 'object' ? Object.keys(decl) : [])
  const makeCtx = (allowed) => {
    const target = {
      plugin: (plg) => load(plg, allowed),
      inject: (deps, apply) => load({ inject: deps, apply }, allowed),
      effect: (fn) => {
        try {
          fn()
        } catch {}
      },
    }
    return new Proxy(target, {
      get(t, prop, receiver) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'prototype' || prop.startsWith('_') || Reflect.has(t, prop)) {
          return Reflect.get(t, prop, receiver)
        }
        if (allowed.has(prop) && prop in services) return services[prop]
        throw new Error(`cannot get property "${prop}" without inject`)
      },
      set(t, prop, value) {
        if (typeof prop === 'string' && !prop.startsWith('_')) throw new Error(`cannot set property "${prop}" without provide`)
        return Reflect.set(t, prop, value)
      },
    })
  }
  function load(plg, parentAllowed = new Set()) {
    const apply = typeof plg === 'function' ? plg : plg?.apply
    const label = plg?.name || apply?.name || 'anonymous'
    if (typeof apply !== 'function') {
      log.push(`${label}: not a plugin`)
      return
    }
    const deps = injectNames(plg.inject)
    const missing = deps.filter((d) => !(d in services))
    if (missing.length) {
      waiting.push({ label, missing })
      return
    }
    try {
      apply.call(plg, makeCtx(new Set([...parentAllowed, ...deps])))
    } catch (err) {
      log.push(`${label}: ${err?.message || err}`)
    }
  }
  return { load, tools, log, waiting, presets, routes, staticModules }
}

/** An older host / the MCP and CLI shims: no inject checks, register() takes any definition. */
function createLegacyHost() {
  const tools = new Map()
  const presets = []
  const ctx = {
    tools: {
      register(def) {
        tools.set(def.name, def)
      },
    },
    agentPresets: {
      register(p) {
        presets.push(p?.id)
      },
    },
    connection: { fetch: { register() {} } },
    webui: { addStaticModule() {} },
    plugin(plg) {
      if (typeof plg === 'function') plg(ctx)
      else if (plg && typeof plg.apply === 'function') plg.apply(ctx)
    },
    inject(_deps, fn) {
      fn(ctx)
    },
  }
  return { ctx, tools, presets }
}

/** A fake npm package: package.json + files. */
function fakePackage(dir, pkgJson, files = {}) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2))
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, body)
  }
}

/** The plugin's code dependencies as found in real installs (versions tagged to tell the copies apart). */
function installDeps(nmDir, tag) {
  const deps = {
    three: [
      {
        name: 'three',
        version: `0.170.0-${tag}`,
        type: 'module',
        main: './build/three.cjs',
        // like three@0.170: no "./package.json" export
        exports: { '.': { import: './build/three.module.js', require: './build/three.cjs' }, './examples/jsm/*': './examples/jsm/*' },
      },
      {
        'build/three.cjs': 'module.exports = {}\n',
        'build/three.module.js': 'export {}\n',
        'examples/jsm/libs/tween.module.js': 'export {}\n',
        'examples/jsm/libs/ammo.wasm.js': '// ammo\n',
        'examples/jsm/libs/ammo.wasm.wasm': 'wasm',
      },
    ],
    animejs: [
      { name: 'animejs', version: `4.5.0-${tag}`, type: 'module', exports: { './package.json': './package.json', '.': { require: './dist/index.cjs', import: './dist/index.js' } } },
      { 'dist/index.cjs': 'module.exports = {}\n', 'dist/index.js': 'export {}\n' },
    ],
    // ESM-only (no "require" entry): only the folder probe finds it
    'tsl-textures': [{ name: 'tsl-textures', version: `2.0.0-${tag}`, exports: { '.': { import: './dist/tsl-textures.js' } } }, { 'dist/tsl-textures.js': 'export {}\n' }],
    remotion: [{ name: 'remotion', version: `4.0.542-${tag}`, main: 'dist/cjs/index.js' }, { 'dist/cjs/index.js': 'module.exports = {}\n' }],
    '@remotion/renderer': [{ name: '@remotion/renderer', version: `4.0.542-${tag}`, main: 'dist/index.js' }, { 'dist/index.js': 'module.exports = {}\n' }],
    '@remotion/bundler': [{ name: '@remotion/bundler', version: `4.0.542-${tag}`, main: 'dist/index.js' }, { 'dist/index.js': 'module.exports = {}\n' }],
  }
  for (const [name, [pkgJson, files]] of Object.entries(deps)) fakePackage(join(nmDir, ...name.split('/')), pkgJson, files)
}

try {
  const shared = await imp('packages/shared/index.js')
  const vibe = await imp('packages/dsh-tool-media/vibe-toolkit-lib.js')
  const rootPlugin = (await imp('index.js')).default
  const preset = (await imp('packages/dsh-preset-video/index.js')).default
  const subPlugins = []
  for (const rel of ['dsh-tool-local-tts/index.js', 'dsh-tool-avatar/index.js', 'dsh-tool-video-suite/index.js', 'dsh-tool-media/index.js']) {
    subPlugins.push((await imp(`packages/${rel}`)).default)
  }

  // ---- 1. plugin declarations --------------------------------------------------------------------------------------
  {
    const declaresTools = (p) => (Array.isArray(p?.inject) ? p.inject : Object.keys(p?.inject || {})).includes('tools')
    const missing = [preset, ...subPlugins].filter((p) => !declaresTools(p)).map((p) => p?.name)
    check('the preset and the four tool plugins declare inject: [\'tools\'] on their default export', missing.length === 0, missing.join(', '))

    const offenders = []
    const scan = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
        const p = join(dir, ent.name)
        if (ent.isDirectory()) scan(p)
        else if (/\.(?:m?js|cjs)$/.test(ent.name) && /\.tools\.register\s*\(/.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(ROOT.length + 1))
      }
    }
    scan(join(ROOT, 'packages'))
    check('every tool registration goes through registerTool() (no direct ctx.tools.register calls)', offenders.length === 0, offenders.join(', '))
  }

  // ---- 2. helpers --------------------------------------------------------------------------------------------------
  {
    const sample = { ok: true, note: '中文 ✓', n: 1, nested: { list: [1, 2] } }
    const circular = { a: 1 }
    circular.self = circular
    check('toolResultText: objects as the MCP server writes them (indented JSON)', shared.toolResultText(sample) === JSON.stringify(sample, null, 2))
    check(
      'toolResultText: strings as they are, undefined → null, circular / BigInt without throwing',
      shared.toolResultText('纯文本') === '纯文本' && shared.toolResultText(undefined) === 'null' && shared.toolResultText(circular).includes('[Circular]') && shared.toolResultText({ big: 10n }).includes('"10"'),
    )
    const blocks = shared.renderToolResultText({ projectDir: 'x' }, sample)
    check('renderToolResultText(args, value) → [{ type: "text", text }]', Array.isArray(blocks) && blocks.length === 1 && blocks[0].type === 'text' && blocks[0].text === JSON.stringify(sample, null, 2))
    check(
      'renderToolResultText tolerates render(value) and never returns an empty text block',
      shared.renderToolResultText(sample)[0].text === JSON.stringify(sample, null, 2) && shared.renderToolResultText({}, '')[0].text === '""',
    )
    const ownRender = () => [{ type: 'text', text: 'own' }]
    const schema = { type: 'object', additionalProperties: true }
    const withOwn = { name: 't', output: { schema, render: ownRender } }
    const withoutRender = { name: 't2', output: { schema } }
    const sameObj = shared.withToolRender(withoutRender)
    check(
      'withToolRender adds render only when missing and keeps the definition and its schema',
      shared.withToolRender(withOwn).output.render === ownRender && sameObj === withoutRender && sameObj.output.schema === schema && typeof sameObj.output.render === 'function',
    )
    check('registerTool on a context without a tools service is a no-op', shared.registerTool({}, { name: 'x' }) === null)
  }

  // ---- 3. NEW host (strict inject + required output.render) --------------------------------------------------------
  const strict = createStrictHost()
  strict.load(rootPlugin)
  const strictNames = [...strict.tools.keys()]
  // the native DSH Jobs bridge is optional: waiting for a `jobs` service the host does not offer is expected (it is
  // injected dynamically and attaches when the service appears); anything else waiting would be a plugin that never runs
  const strictWaits = strict.waiting.filter((w) => !/\bjobs\b/.test(String(w.missing)))
  check('NEW host: index.js loads without any plugin error', strict.log.length === 0 && strictWaits.length === 0, [...strict.log, ...strictWaits.map((w) => `${w.label} waits for ${w.missing}`)].join(' | '))
  check('NEW host: the optional Jobs bridge waits for a jobs service through inject (never reads ctx.jobs directly)', strict.waiting.some((w) => /\bjobs\b/.test(String(w.missing))) && strict.log.length === 0)
  check(`NEW host: all ${EXPECTED_PLUGIN_TOOLS} tools register`, strictNames.length === EXPECTED_PLUGIN_TOOLS, `registered ${strictNames.length}`)
  check(
    'NEW host: the 视频制作模式 preset, the API routes and the web UI module are mounted',
    strict.presets.includes('video-maker') && strict.routes.length > 30 && strict.staticModules.length >= 1,
    `presets=${strict.presets} routes=${strict.routes.length} webui=${strict.staticModules.length}`,
  )
  {
    const circular = { a: 1 }
    circular.self = circular
    const samples = [{ ok: true, projectDir: 'projects/demo', scenes: [{ id: 'scene-01' }] }, '完成', null, undefined, circular]
    const bad = []
    for (const [name, def] of strict.tools) {
      if (!def.output?.schema || typeof def.output.schema !== 'object') bad.push(`${name}: no output.schema`)
      for (const s of samples) {
        let out
        try {
          out = def.output.render({}, s)
        } catch (err) {
          bad.push(`${name}: render threw ${err?.message}`)
          continue
        }
        const ok = Array.isArray(out) && out.length > 0 && out.every((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.length > 0)
        if (!ok) bad.push(`${name}: ${JSON.stringify(out)}`)
      }
    }
    check('NEW host: every tool keeps its output.schema and its render returns non-empty text blocks for sample results', bad.length === 0, bad.slice(0, 3).join(' | '))
  }

  // the defects the strict host reproduces (proves the simulation is strict)
  {
    const bare = createStrictHost()
    bare.load({ name: 'dsh-preset-video (no inject)', apply: preset.apply })
    check(
      'contrast: the preset without inject fails on the NEW host and registers nothing (the reported error)',
      bare.tools.size === 0 && bare.log.some((l) => l.includes('cannot get property "tools" without inject')),
      bare.log[0] || '',
    )
    const raw = createStrictHost()
    let rawError = ''
    raw.load({
      name: 'raw-register',
      inject: ['tools'],
      apply(ctx) {
        try {
          ctx.tools.register({ name: 'raw_tool', description: 'x', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'object' } }, async execute() {} })
        } catch (err) {
          rawError = err.message
        }
      },
    })
    check('contrast: the NEW host refuses a definition without output.render', rawError.includes('output.render'), rawError)
  }

  // one definition rejected by the host does not take the other tools down
  {
    const flaky = createStrictHost({ rejectTools: ['list_assets'] })
    const warned = []
    const origWarn = console.warn
    console.warn = (...a) => warned.push(a.join(' '))
    try {
      flaky.load(rootPlugin)
    } finally {
      console.warn = origWarn
    }
    check(
      'a rejected tool is reported and skipped; the plugin keeps all its other tools',
      flaky.tools.size === EXPECTED_PLUGIN_TOOLS - 1 && !flaky.tools.has('list_assets') && flaky.log.length === 0 && warned.some((w) => w.includes('list_assets')),
      `registered ${flaky.tools.size}, warnings ${warned.length}`,
    )
  }

  // a host without the tools service: the preset waits for it, nothing crashes
  {
    const noTools = createStrictHost({ services: ['agentPresets', 'connection', 'webui'] })
    noTools.load(rootPlugin)
    check(
      'a host without a tools service: the preset waits for it, the web workbench still mounts, no errors',
      noTools.log.length === 0 && noTools.waiting.some((w) => w.label === 'dsh-preset-video' && w.missing.includes('tools')) && noTools.routes.length > 30,
      noTools.log.join(' | '),
    )
  }

  // DSH NEXT reads presets from <dshHome>/.agent-presets/<id>/ (no register()): the preset writes its own folder there
  {
    const presetDir = join(dirs.dshClient, '.agent-presets', 'video-maker')
    const next = createStrictHost({ presetRegister: false })
    next.load(rootPlugin)
    const presetYml = existsSync(join(presetDir, 'preset.yml')) ? readFileSync(join(presetDir, 'preset.yml'), 'utf8') : ''
    const cordisYml = existsSync(join(presetDir, 'agent.cordis.yml')) ? readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8') : ''
    check(
      'DSH NEXT (agentPresets without register): 「视频制作模式」 is written to <dshHome>/.agent-presets/video-maker, tools still register',
      next.log.length === 0 && presetYml.startsWith('# generated by dsh-video-workbench') && presetYml.includes('name: "视频制作模式"') && cordisYml.includes("name: '@deepseek-ai/dsh-persona'") && next.tools.size === strictNames.length,
      `${rel(presetDir)} · ${next.log.join(' | ')}`,
    )
    // a real YAML parse when js-yaml is around (transitive dependency), with the host's !!js tag
    const pnpm = join(ROOT, 'node_modules', '.pnpm')
    const jsYamlDir = existsSync(pnpm) ? readdirSync(pnpm).find((d) => /^js-yaml@4\./.test(d)) : ''
    if (jsYamlDir) {
      const yaml = (await import(pathToFileURL(join(pnpm, jsYamlDir, 'node_modules', 'js-yaml', 'index.js')).href)).default
      const jsTag = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => ({ js: d }) })
      const meta = yaml.load(presetYml)
      const plugins = yaml.load(cordisYml, { schema: yaml.DEFAULT_SCHEMA.extend([jsTag]) })
      const persona = plugins.find((p) => p.id === 'persona')
      const { VIDEO_MAKER_SYSTEM_PROMPT } = await imp('packages/dsh-preset-video/index.js')
      check(
        'the preset files are valid YAML: metadata, the plugin list, the persona text verbatim, shells switched by platform',
        meta.name === '视频制作模式' && /全链路视频工作台/.test(meta.description) && Array.isArray(plugins) && plugins.length === 10 && persona.config.text.startsWith(VIDEO_MAKER_SYSTEM_PROMPT.trim()) && persona.config.text.includes('{{cwd}}') && plugins.find((p) => p.id === 'tool-pwsh').disabled.js.includes('win32'),
        `${plugins.length} plugins`,
      )
    } else {
      check('the preset files look like YAML (no js-yaml to parse them here)', !/\t/.test(cordisYml) && /^- id: persona$/m.test(cordisYml) && /^ {4}text: \|-$/m.test(cordisYml))
    }
    const pf = await imp('packages/dsh-preset-video/preset-folder.js')
    const again = pf.installVideoMakerPresetFolder({ personaText: (await imp('packages/dsh-preset-video/index.js')).VIDEO_MAKER_SYSTEM_PROMPT, version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version, dshHome: dirs.dshClient })
    check('loading the plugin again leaves an up-to-date preset untouched', again.action === 'unchanged', again.action)
    const userHome = join(SCR, 'user-dsh-home')
    mkdirSync(join(userHome, '.agent-presets', 'video-maker'), { recursive: true })
    writeFileSync(join(userHome, '.agent-presets', 'video-maker', 'preset.yml'), 'name: 我自己的视频模式\n')
    const kept = pf.installVideoMakerPresetFolder({ personaText: 'x', version: '0.0.0', dshHome: userHome })
    check('a same-named preset the user made is never overwritten', kept.action === 'kept-user' && readFileSync(join(userHome, '.agent-presets', 'video-maker', 'preset.yml'), 'utf8') === 'name: 我自己的视频模式\n', kept.action)
    const older = join(SCR, 'older-dsh-home')
    mkdirSync(join(older, '.agent-presets', 'video-maker'), { recursive: true })
    writeFileSync(join(older, '.agent-presets', 'video-maker', 'preset.yml'), '# generated by dsh-video-workbench 0.6.9 — old\nname: "视频制作模式"\n')
    const upd = pf.installVideoMakerPresetFolder({ personaText: 'new persona', version: '9.9.9', dshHome: older })
    check('an older preset written by the plugin is refreshed', upd.action === 'updated' && readFileSync(join(older, '.agent-presets', 'video-maker', 'agent.cordis.yml'), 'utf8').includes('new persona'), upd.action)
    process.env.DSH_VIDEO_SKIP_PRESET_INSTALL = '1'
    const skipped = pf.installVideoMakerPresetFolder({ personaText: 'x', version: '1', dshHome: join(SCR, 'skip-home') })
    delete process.env.DSH_VIDEO_SKIP_PRESET_INSTALL
    check('DSH_VIDEO_SKIP_PRESET_INSTALL=1 writes nothing; a missing DSH home is skipped too', skipped.action === 'skipped' && pf.installVideoMakerPresetFolder({ personaText: 'x', dshHome: join(SCR, 'no-such-home') }).action === 'skipped' && !existsSync(join(SCR, 'skip-home')))
  }

  // ---- 4. OLD-style host (no checks) -------------------------------------------------------------------------------
  {
    const legacy = createLegacyHost()
    rootPlugin.apply(legacy.ctx)
    check('OLD host: exactly the same tools register', sameList([...legacy.tools.keys()], strictNames), `${legacy.tools.size} vs ${strictNames.length}`)
    const badParams = [...legacy.tools.values()].filter((d) => !d.parameters || d.parameters.type !== 'object').map((d) => d.name)
    check('OLD host: the preset registers and every tool keeps its JSON-schema parameters', legacy.presets.includes('video-maker') && badParams.length === 0, badParams.join(', '))
  }

  // ---- 5. installed layouts (dependency resolution from the package, not from the data folder) ---------------------
  {
    const versionsOf = (status) => Object.fromEntries(status.map((t) => [t.id, t.version]))
    const expectLayout = (label, packageRoot, nmDir, tag) => {
      const threeDir = join(nmDir, 'three')
      const found = shared.resolveDependencyDir('three', { packageRoot })
      check(`${label}: three is found from the package (its "exports" hides package.json)`, found === threeDir, rel(found))
      const status = vibe.getVibeToolkitStatus({ packageRoot })
      const avail = Object.fromEntries(status.map((t) => [t.id, t.available]))
      const ver = versionsOf(status)
      const want = ['threejs', 'animejs', 'tweenjs', 'ammojs', 'tsl-textures', 'remotion']
      check(
        `${label}: the Vibecoding libraries and Remotion are available, with the installed versions`,
        want.every((id) => avail[id]) && [ver.threejs, ver.animejs, ver['tsl-textures'], ver.remotion].every((v) => String(v).endsWith(`-${tag}`)),
        want.filter((id) => !avail[id]).join(', ') || JSON.stringify(ver),
      )
      check(`${label}: the Ammo.js runtime files are resolved inside that three`, vibe.resolveThreeLibFile('ammo.wasm.wasm', { packageRoot }).startsWith(threeDir))
      const rt = shared.resolveRemotionRuntime({ packageRoot })
      check(`${label}: the Remotion runtime is that node_modules`, rt?.nodeModulesDir === nmDir, rel(rt?.nodeModulesDir))
    }

    // a) DSH / npm hoisted: <profile>/node_modules/dsh-video-workbench + deps in the parent node_modules
    const hoistedNm = join(SCR, 'hoisted', 'node_modules')
    const hoistedPkg = join(hoistedNm, 'dsh-video-workbench')
    fakePackage(hoistedPkg, { name: 'dsh-video-workbench', version: '0.6.0', type: 'module' })
    installDeps(hoistedNm, 'hoisted')
    expectLayout('hoisted install', hoistedPkg, hoistedNm, 'hoisted')

    // b) pnpm virtual store: deps are siblings of the package inside .pnpm/<id>/node_modules
    const pnpmNm = join(SCR, 'pnpm', 'node_modules', '.pnpm', 'dsh-video-workbench@0.6.0', 'node_modules')
    const pnpmPkg = join(pnpmNm, 'dsh-video-workbench')
    fakePackage(pnpmPkg, { name: 'dsh-video-workbench', version: '0.6.0', type: 'module' })
    installDeps(pnpmNm, 'pnpm')
    expectLayout('pnpm store', pnpmPkg, pnpmNm, 'pnpm')
    // ... and the same store reached through the package's link in node_modules (a loader that keeps link paths)
    const pnpmLink = join(SCR, 'pnpm', 'node_modules', 'dsh-video-workbench')
    symlinkSync(pnpmPkg, pnpmLink, 'junction')
    expectLayout('pnpm store via its node_modules link', pnpmLink, pnpmNm, 'pnpm')

    // c) nested: the package's own node_modules wins over the parent's
    const nestedParentNm = join(SCR, 'nested', 'node_modules')
    const nestedPkg = join(nestedParentNm, 'dsh-video-workbench')
    fakePackage(nestedPkg, { name: 'dsh-video-workbench', version: '0.6.0', type: 'module' })
    installDeps(nestedParentNm, 'parent')
    installDeps(join(nestedPkg, 'node_modules'), 'own')
    const nestedRt = shared.resolveRemotionRuntime({ packageRoot: nestedPkg })
    const nestedThree = shared.resolveDependencyDir('three', { packageRoot: nestedPkg })
    check(
      'nested install: the package\'s own node_modules comes first',
      nestedThree === join(nestedPkg, 'node_modules', 'three') && nestedRt?.templateRoot === nestedPkg,
      `${rel(nestedThree)} | ${rel(nestedRt?.templateRoot)}`,
    )

    // d) the original defects: lookups anchored at the data folder miss the plugin's dependencies, and
    //    'three/package.json' is not exported
    const dataDir = join(SCR, 'data')
    mkdirSync(dataDir, { recursive: true })
    const fromData = versionsOf(vibe.getVibeToolkitStatus({ packageRoot: dataDir }))
    check('contrast: a lookup from the data folder does not see the installed copies', !String(fromData.threejs).endsWith('-hoisted') && !String(fromData.remotion).endsWith('-hoisted'), JSON.stringify(fromData))
    let code = ''
    try {
      createRequire(join(hoistedPkg, 'package.json')).resolve('three/package.json')
    } catch (err) {
      code = err?.code || err?.message
    }
    check('contrast: require.resolve("three/package.json") is refused by three\'s exports map', code === 'ERR_PACKAGE_PATH_NOT_EXPORTED', code)

    // e) this checkout itself (dev layout) keeps working
    const dev = vibe.getVibeToolkitStatus()
    const devAvail = Object.fromEntries(dev.map((t) => [t.id, t.available]))
    check(
      'this checkout: the Vibecoding libraries and the Remotion runtime are found',
      ['threejs', 'animejs', 'tweenjs', 'ammojs', 'tsl-textures', 'remotion'].every((id) => devAvail[id]) && Boolean(shared.resolveRemotionRuntime()?.rendererEntry),
      dev.filter((t) => !t.available).map((t) => t.id).join(', '),
    )
  }

  // ---- 6. MCP server: same tools, same input schemas ---------------------------------------------------------------
  {
    const proc = spawn(process.execPath, [join(ROOT, 'bin', 'dsh-video-mcp.mjs')], {
      cwd: ROOT,
      env: { ...process.env, ...BASE_ENV },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let out = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.resume()
    const send = (msg) => proc.stdin.write(JSON.stringify(msg) + '\n')
    const waitFor = async (id, ms = 90_000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) {
        for (const line of out.split('\n')) {
          try {
            const m = JSON.parse(line)
            if (m && m.id === id) return m
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      return null
    }
    try {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'host-compat-test', version: '1.0.0' } } })
      const init = await waitFor(1)
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      const list = await waitFor(2)
      const tools = Array.isArray(list?.result?.tools) ? list.result.tools : []
      const names = tools.map((t) => t.name)
      check(
        `MCP: tools/list returns ${EXPECTED_PLUGIN_TOOLS + MCP_ONLY_TOOLS.length} tools = the plugin's tools + ${MCP_ONLY_TOOLS.join(' + ')}`,
        Boolean(init?.result) && names.length === EXPECTED_PLUGIN_TOOLS + MCP_ONLY_TOOLS.length && sameList(names, [...strictNames, ...MCP_ONLY_TOOLS]),
        `listed ${names.length}`,
      )
      const changed = tools
        .filter((t) => strict.tools.has(t.name))
        .filter((t) => JSON.stringify(t.inputSchema) !== JSON.stringify(strict.tools.get(t.name).parameters) || Object.keys(t).some((k) => !['name', 'description', 'inputSchema'].includes(k)))
        .map((t) => t.name)
      check('MCP: every tool keeps its input schema and nothing host-specific (output / render) leaks into tools/list', changed.length === 0, changed.join(', '))
    } finally {
      proc.kill()
    }
  }
} catch (err) {
  check('host-compat suite', false, err?.stack || err)
} finally {
  // Scratch removal never follows links (a project folder may hold a node_modules junction)
  const walk = (p) => {
    let st
    try {
      st = lstatSync(p)
    } catch {
      return
    }
    if (st.isSymbolicLink() || !st.isDirectory()) {
      try {
        unlinkSync(p)
      } catch {
        try {
          rmdirSync(p)
        } catch {}
      }
      return
    }
    for (const n of readdirSync(p)) walk(join(p, n))
    try {
      rmdirSync(p)
    } catch {}
  }
  if (existsSync(SCR)) walk(SCR)
}
const failed = results.filter((r) => !r.ok).length
console.log(`host-compat: ${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
