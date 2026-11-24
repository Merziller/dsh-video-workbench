#!/usr/bin/env node
/**
 * DSH Video Workbench — Optional Local Lip-Sync (Talking-Head) Engine Installer CLI
 *
 * Usage:
 *   node scripts/install-lipsync-engine.mjs --list
 *   node scripts/install-lipsync-engine.mjs --status [--deep]
 *   node scripts/install-lipsync-engine.mjs --engine musetalk --dir D:/dsh-ai/lipsync --mirror cn
 *   node scripts/install-lipsync-engine.mjs --engine musetalk --dir E:/dsh-ai/lipsync --mirror global --python <python-with-cuda-torch>
 *
 * Flags:
 *   --dir <path>            install home (MuseTalk/, .venv/, torch-hub/, eval/, lipsync-engine.json)
 *   --cache-dir <path>      uv / pip / HF / temp caches (default: <dir>/../.cache)
 *   --mirror cn|global      cn = hf-mirror.com + Tsinghua PyPI (default cn)
 *   --python <exe>          interpreter whose CUDA torch should be reused (default: auto, e.g. INDEXTTS_PYTHON)
 *   --no-reuse-torch        create a fresh environment and download torch 2.8 cu128 (~3 GB)
 *   --no-eval-models        skip the optional SyncNet evaluation weights (55 MB)
 *   --no-env                do not write AVATAR_LIPSYNC_* keys into .env
 *   --skip-model-download   only set up code + Python environment
 *   --force                 install even without a suitable NVIDIA GPU (>= 4 GB VRAM); refused by default
 *   --check-gpu             only print whether this computer is suited for MuseTalk (exit 0 suited / 3 not)
 */
import { getLipsyncStatus } from '../packages/dsh-tool-avatar/lipsync-engine.js'
import {
  formatBytes,
  getLipsyncHardwareGate,
  getLipsyncInstallerCatalog,
  installLipsyncEngine,
} from '../packages/dsh-tool-avatar/lipsync-installer.js'

const argv = process.argv.slice(2)
const getFlag = (name, def = '') => {
  const idx = argv.indexOf(`--${name}`)
  if (idx >= 0 && idx + 1 < argv.length && !argv[idx + 1].startsWith('--')) return argv[idx + 1]
  return def
}
const hasFlag = (name) => argv.includes(`--${name}`)

if (hasFlag('help') || hasFlag('h')) {
  console.log(`
🎬 DSH Video Workbench — 可选本地数字人唇形同步引擎安装器

用法:
  node scripts/install-lipsync-engine.mjs --list
  node scripts/install-lipsync-engine.mjs --status [--deep]
  node scripts/install-lipsync-engine.mjs --engine musetalk --dir <安装目录> [--mirror cn|global] [--python <已带 CUDA torch 的 python>] [--force]
  node scripts/install-lipsync-engine.mjs --check-gpu

说明:
  • 需要 NVIDIA（英伟达）显卡，显存至少 4 GB；没有合适显卡的电脑默认不安装（确定要装请加 --force）
  • 仅从官方来源下载：GitHub (TMElyralab/MuseTalk)、官方 Hugging Face 模型仓库、PyPI、PyTorch 官方源；--mirror cn 使用 hf-mirror.com + 清华 PyPI 镜像
  • 自动复用已有的 CUDA PyTorch（例如 IndexTTS-2.5 的运行时），避免重复下载 ~3 GB
  • 所有缓存 (uv / pip / HF / torch hub / 临时文件) 均位于安装目录同级的 .cache/，不会写入系统盘
  • 安装完成后自动写入 .env: AVATAR_LIPSYNC_ENGINE / AVATAR_LIPSYNC_HOME / AVATAR_LIPSYNC_PYTHON（--no-env 可跳过）
`)
  process.exit(0)
}

/** plain explanation of the hardware gate (why MuseTalk does not suit this computer, and what to use instead) */
function printGate(gate) {
  console.log(`${gate.suitable ? '✓' : '✗'} ${gate.title}\n  ${gate.message}`)
  if (!gate.suitable) {
    console.log('\n可以这样做：')
    gate.alternatives.forEach((a, i) => console.log(`  ${i + 1}. ${a.title}：${a.text}`))
  }
}

if (hasFlag('check-gpu')) {
  const gate = getLipsyncHardwareGate({ forceRefresh: true })
  printGate(gate)
  process.exit(gate.suitable ? 0 : 3)
}

if (hasFlag('list') || argv.length === 0) {
  console.log(JSON.stringify(getLipsyncInstallerCatalog(), null, 2))
  process.exit(0)
}

if (hasFlag('status')) {
  const st = await getLipsyncStatus({ deep: hasFlag('deep'), force: true })
  console.log(JSON.stringify(st, null, 2))
  process.exit(st.ready ? 0 : 2)
}

const ctrl = new AbortController()
process.on('SIGINT', () => ctrl.abort())

try {
  const t0 = Date.now()
  const res = await installLipsyncEngine({
    engineId: getFlag('engine', 'musetalk'),
    installDir: getFlag('dir', ''),
    cacheDir: getFlag('cache-dir', ''),
    mirror: getFlag('mirror', 'cn'),
    pythonBin: getFlag('python', ''),
    reuseTorch: hasFlag('no-reuse-torch') ? 'no' : 'auto',
    repoUrl: getFlag('repo-url', ''),
    withEvalModels: !hasFlag('no-eval-models'),
    writeEnv: !hasFlag('no-env'),
    skipModelDownload: hasFlag('skip-model-download'),
    force: hasFlag('force'),
    signal: ctrl.signal,
    onProgress: ({ progress, message }) => {
      console.log(`[${String(progress).padStart(3, ' ')}%] ${message}`)
    },
  })
  console.log(
    '\n安装结果:',
    JSON.stringify(
      {
        ok: res.ok,
        engineId: res.engineId,
        home: res.home,
        python: res.python,
        env: res.env,
        ready: res.status?.ready,
        reason: res.status?.reason,
        diskUsage: { home: formatBytes(res.usage.homeBytes), caches: formatBytes(res.usage.cacheBytes) },
        elapsedSec: Math.round((Date.now() - t0) / 1000),
      },
      null,
      2,
    ),
  )
  process.exit(res.ok ? 0 : 2)
} catch (err) {
  if (err?.code === 'LIPSYNC_GPU_UNSUITABLE' && err.gate) {
    console.error('\n❌ 没有安装：')
    printGate(err.gate)
    console.error('\n如果你确定仍要安装，请加 --force 重新运行。')
    process.exit(3)
  }
  console.error('\n❌ 安装失败:', err?.message || err)
  process.exit(1)
}
