#!/usr/bin/env node
/**
 * Standalone tests: optional MuseTalk 1.5 installer — package-index arguments for uv / pip (exactly one index per
 * install: the PyTorch CUDA index for torch, PyPI or its CN mirror for everything else; inherited index env vars are
 * dropped) and the NVIDIA GPU hardware gate (decision on simulated hardware profiles, refusal before anything is
 * downloaded, catalog flags for the panel).
 *
 *   node scripts/tests/lipsync-install.test.mjs
 *
 * Offline and side-effect free: nothing is installed or downloaded. When `uv` is on PATH, its real argument parser is
 * asked (with --dry-run --offline and a cache inside the scratch folder) to confirm the old arguments fail and the new
 * ones parse. Env: DSH_LIPSYNC_TEST_DIR (scratch root), DSH_LIPSYNC_TEST_FILTER=<regex>.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const SCRATCH = resolve(process.env.DSH_LIPSYNC_TEST_DIR || join(REPO, '.tmp', 'lipsync-install-test', `run-${process.pid}`))
mkdirSync(SCRATCH, { recursive: true })
// a private, empty .env: the user's own settings (cloud keys, install paths) never influence the results
const ENV_FILE = join(SCRATCH, 'test.env')
writeFileSync(ENV_FILE, '# lipsync-install test\n')
process.env.DSH_VIDEO_ENV_PATH = ENV_FILE
for (const k of ['AVATAR_LIPSYNC_CLOUD_API_KEY', 'FAL_KEY', 'AVATAR_LIPSYNC_ENGINE', 'AVATAR_LIPSYNC_HOME']) delete process.env[k]

const imp = (rel) => import(pathToFileURL(join(REPO, rel)).href)
const inst = await imp('packages/dsh-tool-avatar/lipsync-installer.js')
const {
  assessLipsyncHardware,
  buildPipInstallArgs,
  getLipsyncInstallerCatalog,
  INHERITED_INDEX_ENV_KEYS,
  installLipsyncEngine,
  MUSETALK_EXTRA_PACKAGES,
  MUSETALK_TORCH_PACKAGES,
  PYPI_INDEX_URLS,
  resolvePackageIndex,
  TORCH_CUDA_INDEX_URL,
  withoutInheritedIndexEnv,
} = inst

// ------------------------------------------------------------------------------------------
// Harness
// ------------------------------------------------------------------------------------------
const results = []
const FILTER = process.env.DSH_LIPSYNC_TEST_FILTER ? new RegExp(process.env.DSH_LIPSYNC_TEST_FILTER, 'i') : null
async function test(name, fn, { skip = false } = {}) {
  if (FILTER && !FILTER.test(name)) return
  if (skip) {
    results.push({ name, status: 'skip' })
    console.log(`- SKIP ${name}${typeof skip === 'string' ? ` (${skip})` : ''}`)
    return
  }
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass' })
    console.log(`✔ ${name} (${Date.now() - t0} ms)`)
  } catch (err) {
    results.push({ name, status: 'fail', err })
    console.log(`✘ ${name}\n    ${String(err?.stack || err).split('\n').slice(0, 6).join('\n    ')}`)
  }
}

/** every flag that names a package source, with its value */
const SOURCE_FLAGS = new Set(['-i', '--index-url', '--extra-index-url', '--index', '--default-index', '-f', '--find-links'])
const sourcesOf = (args) => args.flatMap((a, i) => (SOURCE_FLAGS.has(a) ? [`${a} ${args[i + 1]}`] : /^--(index-url|extra-index-url|index|default-index|find-links)=/.test(a) ? [a] : []))

// Simulated probeHardwareProfile() results (packages/shared/hardware-guard.js): nvidia-smi entries carry freeVramGB
const PROFILES = {
  nvidia12: {
    gpu: {
      primaryName: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU',
      vendor: 'nvidia',
      vramGB: 11.94,
      hasNvidiaCuda: true,
      hasDedicatedGpu: true,
      all: [
        { name: 'Intel(R) Graphics', vendor: 'intel', vramGB: 2, dedicated: false },
        { name: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', vendor: 'nvidia', vramGB: 11.94, freeVramGB: 10.5, dedicated: true },
      ],
    },
  },
  nvidia2: {
    gpu: {
      primaryName: 'NVIDIA GeForce MX450',
      vendor: 'nvidia',
      vramGB: 2,
      hasNvidiaCuda: true,
      hasDedicatedGpu: true,
      all: [
        { name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'intel', vramGB: 1, dedicated: false },
        { name: 'NVIDIA GeForce MX450', vendor: 'nvidia', vramGB: 2, freeVramGB: 1.8, dedicated: true },
      ],
    },
  },
  // the reported computer: Core Ultra 9 285H, Intel Arc 140T (WMI shows 2 GB), no NVIDIA
  intelArc: {
    gpu: {
      primaryName: 'Intel(R) Arc(TM) 140T GPU',
      vendor: 'intel',
      vramGB: 2,
      hasNvidiaCuda: false,
      hasDedicatedGpu: false,
      all: [{ name: 'Intel(R) Arc(TM) 140T GPU', vendor: 'intel', vramGB: 2, dedicated: false }],
    },
  },
  none: { gpu: { primaryName: '通用显卡 / 核显', vendor: 'integrated', vramGB: 0, hasNvidiaCuda: false, hasDedicatedGpu: false, all: [] } },
}
const nvidiaWmiOnly = (vramGB) => ({
  gpu: { primaryName: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', vramGB, hasNvidiaCuda: false, hasDedicatedGpu: true, all: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', vramGB, dedicated: true }] },
})
const smiCard = (name, vramGB) => ({ gpu: { primaryName: name, vendor: 'nvidia', vramGB, hasNvidiaCuda: true, all: [{ name, vendor: 'nvidia', vramGB, freeVramGB: vramGB * 0.9, dedicated: true }] } })

// ------------------------------------------------------------------------------------------
// Package indexes
// ------------------------------------------------------------------------------------------
await test('index choice: torch always from the official PyTorch CUDA index, the rest from PyPI or the CN mirror', () => {
  assert.equal(TORCH_CUDA_INDEX_URL, 'https://download.pytorch.org/whl/cu128')
  assert.equal(resolvePackageIndex('torch', 'cn'), TORCH_CUDA_INDEX_URL)
  assert.equal(resolvePackageIndex('torch', 'global'), TORCH_CUDA_INDEX_URL)
  assert.equal(resolvePackageIndex('pypi', 'cn'), PYPI_INDEX_URLS.cn)
  assert.equal(resolvePackageIndex('pypi', ''), PYPI_INDEX_URLS.cn, 'the installer default mirror is cn')
  assert.equal(resolvePackageIndex('pypi', 'GLOBAL'), PYPI_INDEX_URLS.global)
  assert.equal(PYPI_INDEX_URLS.cn, 'https://pypi.tuna.tsinghua.edu.cn/simple')
  assert.equal(PYPI_INDEX_URLS.global, 'https://pypi.org/simple')
})

const VENV_PY = join('E:', 'ai', 'lipsync', '.venv', 'Scripts', 'python.exe')
const MATRIX = [
  { uv: true, mirror: 'cn', group: 'torch' },
  { uv: true, mirror: 'cn', group: 'pypi' },
  { uv: true, mirror: 'global', group: 'torch' },
  { uv: true, mirror: 'global', group: 'pypi' },
  { uv: false, mirror: 'cn', group: 'torch' },
  { uv: false, mirror: 'cn', group: 'pypi' },
  { uv: false, mirror: 'global', group: 'torch' },
  { uv: false, mirror: 'global', group: 'pypi' },
]
for (const c of MATRIX) {
  await test(`install args (${c.uv ? 'uv' : 'pip'} · ${c.mirror} · ${c.group}): exactly one index, the right one`, () => {
    const packages = c.group === 'torch' ? MUSETALK_TORCH_PACKAGES : MUSETALK_EXTRA_PACKAGES
    const extraArgs = c.group === 'torch' ? [] : ['--no-deps']
    const indexUrl = resolvePackageIndex(c.group, c.mirror)
    const args = buildPipInstallArgs({ uv: c.uv, python: VENV_PY, packages, indexUrl, extraArgs })
    assert.deepEqual(sourcesOf(args), [`--index-url ${indexUrl}`], `one package source only: ${args.join(' ')}`)
    if (c.group === 'torch') {
      assert.equal(indexUrl, TORCH_CUDA_INDEX_URL)
      assert.ok(!args.some((a) => /tsinghua|pypi\.org/.test(a)), 'no PyPI / mirror next to the torch index (CPU-only torch on Windows)')
    } else {
      assert.equal(indexUrl, c.mirror === 'global' ? PYPI_INDEX_URLS.global : PYPI_INDEX_URLS.cn)
      assert.ok(!args.some((a) => /download\.pytorch\.org/.test(a)))
    }
    if (c.uv) assert.deepEqual(args.slice(0, 4), ['pip', 'install', '--python', VENV_PY])
    else assert.deepEqual(args.slice(0, 3), ['-m', 'pip', 'install'])
    assert.deepEqual(args.slice(-packages.length), packages, 'packages come last')
    for (const x of extraArgs) assert.ok(args.includes(x))
  })
}

await test('install args: the reported failure (mirror + torch index in one uv call) can no longer be built', () => {
  // the old installer passed ['--index-url', <torch index>] as extra args next to its own --index-url <mirror>
  assert.throws(() => buildPipInstallArgs({ uv: true, python: VENV_PY, packages: MUSETALK_TORCH_PACKAGES, indexUrl: PYPI_INDEX_URLS.cn, extraArgs: ['--index-url', TORCH_CUDA_INDEX_URL] }), /second package source/)
  for (const bad of ['-i', '-ihttps://x.example/simple', '--extra-index-url', `--extra-index-url=${PYPI_INDEX_URLS.cn}`, '--index', '--default-index', '--find-links', '-f', '--no-index', '--index-strategy', '--torch-backend=cu128']) {
    assert.throws(() => buildPipInstallArgs({ uv: false, python: VENV_PY, packages: ['x'], indexUrl: PYPI_INDEX_URLS.cn, extraArgs: [bad] }), /second package source/, bad)
  }
  // ordinary extras stay allowed
  assert.ok(buildPipInstallArgs({ uv: true, python: VENV_PY, packages: ['x'], indexUrl: PYPI_INDEX_URLS.cn, extraArgs: ['--no-deps', '-U', '--force-reinstall'] }).includes('--force-reinstall'))
})

await test('install args: missing packages / index / target python are programming errors', () => {
  assert.throws(() => buildPipInstallArgs({ uv: true, python: VENV_PY, packages: [], indexUrl: PYPI_INDEX_URLS.cn }), /no packages/)
  assert.throws(() => buildPipInstallArgs({ uv: true, python: VENV_PY, packages: ['x'], indexUrl: '' }), /index URL/)
  assert.throws(() => buildPipInstallArgs({ uv: true, python: VENV_PY, packages: ['x'], indexUrl: `${PYPI_INDEX_URLS.cn} ${TORCH_CUDA_INDEX_URL}` }), /index URL/, 'two URLs in one value')
  assert.throws(() => buildPipInstallArgs({ uv: true, python: '', packages: ['x'], indexUrl: PYPI_INDEX_URLS.cn }), /--python/)
  assert.ok(buildPipInstallArgs({ uv: false, python: '', packages: ['x'], indexUrl: PYPI_INDEX_URLS.cn }), 'pip runs with the venv python itself')
})

await test('inherited index env vars are dropped from the install environment (real child process)', () => {
  const base = { ...process.env, UV_INDEX: 'https://evil.example/a', UV_EXTRA_INDEX_URL: 'https://evil.example/b', PIP_EXTRA_INDEX_URL: 'https://evil.example/c', UV_TORCH_BACKEND: 'cpu', UV_CACHE_DIR: join(SCRATCH, 'uv-cache'), PIP_CACHE_DIR: join(SCRATCH, 'pip-cache') }
  const env = withoutInheritedIndexEnv(base)
  for (const k of INHERITED_INDEX_ENV_KEYS) assert.equal(env[k], undefined, k)
  assert.equal(env.UV_CACHE_DIR, base.UV_CACHE_DIR)
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env).filter((k) => /^(UV|PIP)_/i.test(k)).sort()))'], { env, encoding: 'utf8', windowsHide: true })
  assert.equal(r.status, 0, r.stderr)
  const seen = JSON.parse(r.stdout).map((k) => k.toUpperCase())
  assert.ok(seen.includes('UV_CACHE_DIR') && seen.includes('PIP_CACHE_DIR'), seen.join(','))
  for (const k of INHERITED_INDEX_ENV_KEYS) assert.ok(!seen.includes(k), `${k} leaked into the child: ${seen.join(',')}`)
})

const uvVersion = spawnSync('uv', ['--version'], { encoding: 'utf8', windowsHide: true })
const HAS_UV = uvVersion.status === 0
await test(`real uv argument parser (${HAS_UV ? uvVersion.stdout.trim() : 'uv not installed'}): old args fail, new args parse`, () => {
  const env = { ...withoutInheritedIndexEnv(process.env), UV_CACHE_DIR: join(SCRATCH, 'uv-cache'), UV_NO_CONFIG: '1', TEMP: join(SCRATCH, 'tmp'), TMP: join(SCRATCH, 'tmp') }
  mkdirSync(env.TEMP, { recursive: true })
  const fakePy = join(SCRATCH, 'no-venv', process.platform === 'win32' ? 'python.exe' : 'python')
  const uvRun = (args) => {
    // --dry-run --offline: parse + resolve only, never touches the network or any environment
    const [pip, install, ...rest] = args
    const r = spawnSync('uv', [pip, install, '--dry-run', '--offline', ...rest], { env, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
    return `${r.stderr || ''}${r.stdout || ''}`
  }
  const MULTI = /cannot be used multiple times|unexpected argument/i
  const old = ['pip', 'install', '--python', fakePy, '--index-url', PYPI_INDEX_URLS.cn, '--index-url', TORCH_CUDA_INDEX_URL, ...MUSETALK_TORCH_PACKAGES]
  assert.match(uvRun(old), MULTI, 'the user-reported argument list must still fail in uv (otherwise this check proves nothing)')
  for (const group of ['torch', 'pypi']) {
    for (const mirror of ['cn', 'global']) {
      const args = buildPipInstallArgs({ uv: true, python: fakePy, packages: group === 'torch' ? MUSETALK_TORCH_PACKAGES : MUSETALK_EXTRA_PACKAGES, indexUrl: resolvePackageIndex(group, mirror), extraArgs: group === 'torch' ? [] : ['--no-deps'] })
      const out = uvRun(args)
      assert.doesNotMatch(out, MULTI, `${group}/${mirror}: ${out.slice(0, 300)}`)
      assert.doesNotMatch(out, /^error: (unexpected|invalid value|the argument)/im, `${group}/${mirror}: ${out.slice(0, 300)}`)
    }
  }
}, { skip: HAS_UV ? false : 'uv not on PATH' })

// ------------------------------------------------------------------------------------------
// Hardware gate
// ------------------------------------------------------------------------------------------
await test('gate: NVIDIA 12 GB → suitable', () => {
  const g = assessLipsyncHardware(PROFILES.nvidia12)
  assert.equal(g.suitable, true)
  assert.equal(g.code, 'OK')
  assert.equal(g.gpuName, 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', 'the NVIDIA card, not the integrated one')
  assert.equal(g.minVramGb, 4)
  assert.match(g.message, /12 GB/)
})

await test('gate: NVIDIA with 2 GB VRAM → not suitable (VRAM_LOW), plain explanation + alternatives', () => {
  const g = assessLipsyncHardware(PROFILES.nvidia2)
  assert.equal(g.suitable, false)
  assert.equal(g.code, 'VRAM_LOW')
  assert.equal(g.gpuName, 'NVIDIA GeForce MX450')
  assert.match(g.message, /MX450/)
  assert.match(g.message, /2 GB/)
  assert.match(g.message, /至少 4 GB/)
  assert.deepEqual(g.alternatives.map((a) => a.id), ['composite', 'ai-human', 'cloud-fal'])
})

await test('gate: Intel Arc 140T (the reported computer) → not suitable (NO_NVIDIA), names the card', () => {
  const g = assessLipsyncHardware(PROFILES.intelArc)
  assert.equal(g.suitable, false)
  assert.equal(g.code, 'NO_NVIDIA')
  assert.equal(g.title, '这台电脑不适合安装 MuseTalk')
  assert.match(g.message, /Intel\(R\) Arc\(TM\) 140T GPU/)
  assert.match(g.message, /不是 NVIDIA 显卡/)
  for (const a of g.alternatives) {
    assert.ok(a.title && a.text && !/undefined|null/.test(a.title + a.text), JSON.stringify(a))
    assert.ok(/[一-鿿]/.test(a.text), 'plain Chinese for non-technical users')
  }
  assert.match(g.alternatives.find((a) => a.id === 'cloud-fal').text, /AVATAR_LIPSYNC_CLOUD_API_KEY/)
})

await test('gate: no GPU information at all → not suitable (NO_NVIDIA) without inventing a card name', () => {
  for (const p of [PROFILES.none, null, undefined, {}, { gpu: { all: 'garbage' } }]) {
    const g = assessLipsyncHardware(p)
    assert.equal(g.suitable, false)
    assert.equal(g.code, 'NO_NVIDIA')
    assert.equal(g.gpuName, '')
    assert.match(g.message, /没有检测到 NVIDIA 显卡/)
  }
})

await test('gate: VRAM boundary — a "4 GB" card (4095 MiB / 3.8 GB) passes, 3.5 GB does not', () => {
  assert.equal(assessLipsyncHardware(smiCard('NVIDIA GeForce GTX 1650', 4095 / 1024)).code, 'OK')
  assert.equal(assessLipsyncHardware(smiCard('NVIDIA GeForce RTX 3050 Laptop GPU', 3.8)).code, 'OK')
  assert.equal(assessLipsyncHardware(smiCard('NVIDIA GeForce GTX 1050', 3.5)).code, 'VRAM_LOW')
  assert.equal(assessLipsyncHardware(smiCard('NVIDIA RTX A2000', 6), { minVramGb: 8 }).code, 'VRAM_LOW', 'custom minimum')
})

await test('gate: NVIDIA seen by Windows but nvidia-smi missing → never blocked (unless WMI shows < 4 GB)', () => {
  // WMI caps AdapterRAM at ~4 GB: a 12 GB card reads as 4 GB, so the size is unknown → allowed with a driver hint
  const capped = assessLipsyncHardware(nvidiaWmiOnly(4))
  assert.equal(capped.suitable, true)
  assert.equal(capped.code, 'NVIDIA_UNVERIFIED')
  assert.match(capped.message, /驱动/)
  assert.equal(assessLipsyncHardware(nvidiaWmiOnly(0)).code, 'NVIDIA_UNVERIFIED')
  assert.equal(assessLipsyncHardware(nvidiaWmiOnly(2)).code, 'VRAM_LOW', 'below 4 GB the WMI value is exact')
})

await test('gate: an AMD card is not CUDA → NO_NVIDIA naming the AMD card', () => {
  const g = assessLipsyncHardware({ gpu: { hasNvidiaCuda: false, all: [{ name: 'Intel(R) UHD Graphics', vendor: 'intel', vramGB: 1 }, { name: 'AMD Radeon RX 7800 XT', vendor: 'amd', vramGB: 16, dedicated: true }] } })
  assert.equal(g.code, 'NO_NVIDIA')
  assert.match(g.message, /AMD Radeon RX 7800 XT/)
})

await test('gate: a configured fal.ai key changes the cloud alternative to "already configured"', () => {
  const g = assessLipsyncHardware(PROFILES.intelArc, { cloudReady: true })
  const cloud = g.alternatives.find((a) => a.id === 'cloud-fal')
  assert.match(cloud.title, /已配置/)
  assert.doesNotMatch(cloud.text, /AVATAR_LIPSYNC_CLOUD_API_KEY=/)
})

await test('catalog: the panel gets the gate verdict and per-package suitability', () => {
  const bad = getLipsyncInstallerCatalog({ hardwareProfile: PROFILES.intelArc })
  assert.equal(bad.hardware.suitable, false)
  assert.equal(bad.hardware.code, 'NO_NVIDIA')
  assert.equal(bad.packages.find((p) => p.id === 'musetalk').suitable, false)
  const good = getLipsyncInstallerCatalog({ hardwareProfile: PROFILES.nvidia12 })
  assert.equal(good.hardware.suitable, true)
  assert.equal(good.packages.find((p) => p.id === 'musetalk').suitable, true)
})

for (const [label, profile, code] of [
  ['Intel Arc', PROFILES.intelArc, 'NO_NVIDIA'],
  ['NVIDIA 2 GB', PROFILES.nvidia2, 'VRAM_LOW'],
  ['no GPU', PROFILES.none, 'NO_NVIDIA'],
]) {
  await test(`installer refuses on ${label} before touching the disk (unless forced)`, async () => {
    const installDir = join(SCRATCH, `refused-${code}-${label.replace(/\W+/g, '')}`, 'lipsync')
    const cacheDir = join(SCRATCH, `refused-${code}-${label.replace(/\W+/g, '')}`, 'cache')
    const progress = []
    await assert.rejects(
      installLipsyncEngine({ hardwareProfile: profile, installDir, cacheDir, writeEnv: false, onProgress: (p) => progress.push(p) }),
      (err) => {
        assert.equal(err.code, 'LIPSYNC_GPU_UNSUITABLE')
        assert.equal(err.status, 409)
        assert.equal(err.gate.code, code)
        assert.match(err.message, /仍要安装|--force/)
        return true
      },
    )
    assert.equal(existsSync(installDir), false, 'nothing created in the install folder')
    assert.equal(existsSync(cacheDir), false, 'nothing created in the cache folder')
    assert.equal(progress.length, 0, 'no install step started')
  })
}

await test('CLI help documents --force and --check-gpu', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts', 'install-lipsync-engine.mjs'), '--help'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, DSH_VIDEO_ENV_PATH: ENV_FILE } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /--force/)
  assert.match(r.stdout, /--check-gpu/)
  assert.match(r.stdout, /NVIDIA/)
})

// ------------------------------------------------------------------------------------------
// Summary + cleanup
// ------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.status === 'fail')
const passed = results.filter((r) => r.status === 'pass')
const skipped = results.filter((r) => r.status === 'skip')
if (!process.env.DSH_LIPSYNC_TEST_DIR) {
  try {
    rmSync(SCRATCH, { recursive: true, force: true })
    if (!readdirSync(dirname(SCRATCH)).length) rmdirSync(dirname(SCRATCH))
  } catch {}
}
console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`)
process.exitCode = failed.length ? 1 : 0
