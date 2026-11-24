/**
 * 动漫形象数字人 · tier 2 — optional one-click installer of the free local models (contract: ANIME-AVATAR.md).
 *
 *   tha3     Talking Head Anime 3 (code MIT, weights CC BY 4.0 — attribution in ANIME-NOTICE.md): makes the character
 *            talk, blink, raise the eyebrows, nod and breathe. NVIDIA (CUDA 12.8 wheels, RTX 50 ready) fast, CPU slow.
 *   stylize  DCT-Net (code + weights Apache-2.0, ModelScope) turns the user's photo into an anime likeness; U²-Net
 *            human segmentation (Apache-2.0, ONNX by rembg, MIT) + SkyTNT anime segmentation (Apache-2.0) cut the person
 *            out. CPU only.
 *
 * - One uv-managed Python 3.12 virtual environment inside the install folder; every cache (uv / pip / HF / temp /
 *   bytecode / CUDA kernels) lives on the install drive — nothing is written to C: when the folder is elsewhere.
 * - Every model file is pinned by SHA-256 (hashes of the official files): a mirror is only accepted when the hash
 *   matches. THA3 weights: official Dropbox zip or the Hugging Face copy `OktayAlpk/talking-head-anime-3` (all 20 files
 *   byte-identical to the official zip). U²-Net: rembg's GitHub release or byte-identical Hugging Face copies. Anime
 *   segmentation: the author's Hugging Face repo `skytnt/anime-seg` or rembg's byte-identical copy. DCT-Net: ModelScope.
 * - Every package install uses exactly ONE index (buildPipInstallArgs, shared with the MuseTalk installer).
 * - Manifest: `<DSH_VIDEO_HOME>/anime-local.json` (read by getAnimeLocalStatus / anime-local.js).
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'
import { loadEnv, probeHardwareProfile, REPO_ROOT, resolveEnvPath, resolvePackagePath } from '../shared/index.js'
import { buildPipInstallArgs, dirSizeBytes, PYPI_INDEX_URLS, withoutInheritedIndexEnv } from './lipsync-installer.js'

export const ANIME_LOCAL_VERSION = 1
export const ANIME_LOCAL_COMPONENTS = ['tha3', 'stylize']
export const ANIME_PYTHON_VERSION = '3.12'
export const ANIME_TORCH_VERSION = '2.8.0'
// Official PyTorch wheel indexes. cu128 runs every NVIDIA card from Turing (RTX 20) to Blackwell (RTX 50); the CUDA
// 12.8 builds no longer carry Maxwell / Pascal kernels, so cards older than compute capability 7.0 get cu126.
export const ANIME_TORCH_INDEXES = Object.freeze({
  cu128: 'https://download.pytorch.org/whl/cu128',
  cu126: 'https://download.pytorch.org/whl/cu126',
})
export const ANIME_BASE_PACKAGES = ['numpy==2.2.6', 'pillow==11.3.0']
// DCT-Net ships as TensorFlow 1.x frozen graphs (no faithful torch / ONNX port exists); tensorflow-cpu has Windows
// Python 3.12 wheels and never touches the GPU.
export const ANIME_STYLIZE_PACKAGES = ['tensorflow-cpu==2.20.0', 'protobuf==5.29.5', 'opencv-python-headless==4.10.0.84', 'onnxruntime==1.22.1']
// uv itself, bootstrapped from PyPI (hash-pinned) when it is not on this computer (Windows x64)
export const UV_BOOTSTRAP = Object.freeze({
  version: '0.12.3',
  file: 'uv-0.12.3-py3-none-win_amd64.whl',
  path: '59/ed/3f816f972357578f1a21afdff8af9c93e87416afd0e150fc60be7eb280ab/uv-0.12.3-py3-none-win_amd64.whl',
  sha256: 'aeafd6e02b9a8d8beb447040bfc57ab172bdf244208f7147b4f7bbc327135797',
  bytes: 20215028,
})
// python-build-standalone download sources for `uv python install` (uv verifies every archive against its own SHA-256 list)
export const PYTHON_INSTALL_MIRRORS = Object.freeze({
  cn: ['https://registry.npmmirror.com/-/binary/python-build-standalone', ''],
  global: ['', 'https://registry.npmmirror.com/-/binary/python-build-standalone'],
})

/* ------------------------------------------------------------------------------------------- pinned model files */

const THA3_NAMES = ['editor.pt', 'eyebrow_decomposer.pt', 'eyebrow_morphing_combiner.pt', 'face_morpher.pt', 'two_algo_face_body_rotator.pt']
// SHA-256 + size of every file of the official THA3 zip (talking-head-anime-3-models.zip, Dropbox, 2022-05-06)
export const THA3_WEIGHTS = Object.freeze({
  standard_float: {
    'editor.pt': ['11953fe7767b6ff98e028e16d025239275bb046e440b9c9c8f59096f9f9c781e', 33471839],
    'eyebrow_decomposer.pt': ['0648f8f649212b0ebba62630d289112395862d486d927d28a1dda12583e42178', 125942879],
    'eyebrow_morphing_combiner.pt': ['07211acbba94eec777b894abfef6fe14504a9066dfd97fe828f1889f6031201a', 126168279],
    'face_morpher.pt': ['64487e894d6a6d7fdac8c9103ab8dcb7313ea0cb19d58116863a6b696ed2faaa', 126444711],
    'two_algo_face_body_rotator.pt': ['6f5bf9d7430f89641a5971d055fc24bd4306f40c17fe2a0deaed52138a9cb08b', 130675279],
  },
  separable_float: {
    'editor.pt': ['ecbc46808aeed3088a215d3884d0b162d76337211d73a9bb21cdd92fc45fc50b', 3802999],
    'eyebrow_decomposer.pt': ['1fbf5015083876653d64885481cc7b7145df0321101648b2692696042f97b799', 13313007],
    'eyebrow_morphing_combiner.pt': ['de9cacc5d47e65e9c5b4b6317c0e86a31a27a5d01378edff3010a10f6deab106', 13334119],
    'face_morpher.pt': ['e6977e73e3fcfc7614e37592f255d67d0eeba0cd86e7e700ecacffd7a4e53818', 13374071],
    'two_algo_face_body_rotator.pt': ['79d2609cdac8fc61335c3f3045dc20094324bd5854d6427b21d4c388928282cf', 14355239],
  },
  standard_half: {
    'editor.pt': ['3ef0733f62bb8107d25e32d775d0f36abe72ad960b56d1d686ededd62eb8bb31', 16748511],
    'eyebrow_decomposer.pt': ['56176ef6126c9ecbf2f33a9078a7975044672ce5df7cf62f48b95b6672056080', 62984031],
    'eyebrow_morphing_combiner.pt': ['ccbbb532f581df140a98f57387503dfc60cfe60fac5c78318259fcd55fbe1652', 63096535],
    'face_morpher.pt': ['7d4ee28ca05645c2a8ea923f34621bb4778f633a5d5fa5a33c18440a55fac1cc', 63234727],
    'two_algo_face_body_rotator.pt': ['f20df3d6a5431011454fa8484b02d5e7ce89692fef4ed0b5b68615f837ed4f98', 65350735],
  },
  separable_half: {
    'editor.pt': ['a3b00f325d241df80c1177684b304d76f716f816d43dc3a038bb7eaf6bba6d05', 1918327],
    'eyebrow_decomposer.pt': ['b2842fbaa865a76f2c573c11eae5043b6e3401997b4ff8f7bfd14aae51aa0e10', 6673071],
    'eyebrow_morphing_combiner.pt': ['5a3b34d36bfb67c71e08561ef9969c2222cfc262023db10ff28f8bb690f8736b', 6683431],
    'face_morpher.pt': ['c3e5824c5234ba3048fcc8426e6d1b54e27dd47ac8ff3d3e94268feb369caaaf', 6703671],
    'two_algo_face_body_rotator.pt': ['cfffc72c4509c9b9d39858049cf756b5697dec227855f3385bae0542f81725e9', 7195239],
  },
})
export const THA3_SOURCES = Object.freeze({
  page: 'https://github.com/pkhungurn/talking-head-anime-3-demo',
  officialZip: {
    url: 'https://www.dropbox.com/s/y7b8jl4n2euv8xe/talking-head-anime-3-models.zip?dl=1',
    sha256: '854184e03e883978efaffa27ff7dd09bb21c5e6b643e12fb9c0a6a55bf8d935a',
    bytes: 834700485,
  },
  licenseInZip: { file: 'LICENSE.txt', sha256: 'd07988f4be47912f75a73b44da8a9c0b602bf6c8ced69de858b848f379ecd973', bytes: 19053 },
  hfMirrorRepo: 'OktayAlpk/talking-head-anime-3',
})
// The model a device renders with: standard_float = the official default (largest, most accurate) on CUDA; the
// separable_float variant is ~9× smaller and the fastest acceptable one on a CPU (the half variants need a GPU).
export const THA3_DEVICE_VARIANT = Object.freeze({ cuda: 'standard_float', cpu: 'separable_float' })

const DCT_REPO = (name) => `iic/${name}`
// DCT-Net (ModelScope, Apache-2.0). Every style is a head model + a full-picture model; detector / keypoints / alpha are
// shared. SHA-256 + size as listed by ModelScope (and re-checked on download).
export const DCTNET_COMMON = Object.freeze({
  repo: DCT_REPO('cv_unet_person-image-cartoon_compound-models'),
  files: {
    'detector.pb': ['8e42012b74def7225fd70b0df5814090a8f36787b860e91032c06d55adae5ad4', 4475998],
    'keypoints.pb': ['80d03c931bc15ec9d3113e446cba4f35b4d8a0f8323b04fe547fb8d280f446d6', 4146481],
    'alpha.jpg': ['cfde5c765d2ade4a4e968bbe4149682c2557d5e84f5ae48e9e20f48499faac2e', 23133],
  },
})
export const DCTNET_STYLES = Object.freeze({
  anime: { label: '日系动漫', repo: DCT_REPO('cv_unet_person-image-cartoon_compound-models'), head: ['cartoon_anime_h.pb', '338e7bf7ab4014ba9da864c2dda104f26d8af6c7f468038782d92ccc8e2dedda'], bg: ['cartoon_anime_bg.pb', '71efec51b4566cce3a3123822fb4e17794ad062c3e324b33f2a65df850c037ad'] },
  '3d': { label: '3D 卡通', repo: DCT_REPO('cv_unet_person-image-cartoon-3d_compound-models'), head: ['cartoon_h.pb', 'bca966dded317de32b6870b758fd01c6ab8f6ab76a285149fbf450a71624fe80'], bg: ['cartoon_bg.pb', 'bca966dded317de32b6870b758fd01c6ab8f6ab76a285149fbf450a71624fe80'] },
  design: { label: '萌系插画', repo: DCT_REPO('cv_unet_person-image-cartoon-sd-design_compound-models'), head: ['cartoon_h.pb', 'a9f0ebcdce3152429b1169d3c5501ffd8b3ab7614622a5f420620056fb50f1cf'], bg: ['cartoon_bg.pb', '45f2fcb2421d9f288c53e7bba21c7d6e14adfc077ea36295da7fbeb5d7bb1c7a'] },
  handdrawn: { label: '手绘', repo: DCT_REPO('cv_unet_person-image-cartoon-handdrawn_compound-models'), head: ['cartoon_h.pb', 'b5c8c54cfc96420feacdde140c7c81c3b8e6612162d58bc70a6fd4d35b340ce2'], bg: ['cartoon_bg.pb', 'fc1553a316698b1e7fa85a286bd2994e29ae8ece233004cb42192b5b17accc64'] },
  sketch: { label: '素描', repo: DCT_REPO('cv_unet_person-image-cartoon-sketch_compound-models'), head: ['cartoon_h.pb', 'a6acab53c080318a6c8f0571e8db0f7922ad6bd84005ae30115a4dc6c89ed90f'], bg: ['cartoon_bg.pb', 'a6acab53c080318a6c8f0571e8db0f7922ad6bd84005ae30115a4dc6c89ed90f'] },
  artstyle: { label: '艺术', repo: DCT_REPO('cv_unet_person-image-cartoon-artstyle_compound-models'), head: ['cartoon_h.pb', '34ceb2100f1fcb665afa9af44d2bd49f280a4a031fc74681370303e61993bec9'], bg: ['cartoon_bg.pb', '34ceb2100f1fcb665afa9af44d2bd49f280a4a031fc74681370303e61993bec9'] },
  illustration: { label: '写实插画', repo: DCT_REPO('cv_unet_person-image-cartoon-sd-illustration_compound-models'), head: ['cartoon_h.pb', '17e2103006c5fb289ce4e109c255f588a1ae19645cc459fa31474586fb8084a6'], bg: ['cartoon_bg.pb', '17e2103006c5fb289ce4e109c255f588a1ae19645cc459fa31474586fb8084a6'] },
})
const DCTNET_MODEL_BYTES = 5894895
export const DCTNET_DEFAULT_STYLES = ['anime', '3d', 'design']
// the character library's styles (anime-character.js ANIME_STYLES) → the closest DCT-Net style
export const STYLE_TO_DCTNET = Object.freeze({ anime: 'anime', cartoon3d: '3d', chibi: 'design', flat: 'design' })
export const U2NET_HUMAN_SEG = Object.freeze({
  file: 'u2net_human_seg.onnx',
  sha256: '01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c',
  bytes: 175997641,
  officialUrl: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx',
  hfMirrors: ['tomjackson2023/rembg', 'skillsafe-ai/u2net-human-seg'],
})
// SkyTNT anime-segmentation (Apache-2.0): the author's own ONNX on Hugging Face; rembg ships the same bytes as
// isnet-anime.onnx. It traces the outline of the stylized picture (U²-Net on the photo decides where the person is).
export const ANIME_SEG = Object.freeze({
  file: 'isnetis.onnx',
  sha256: 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99',
  bytes: 176069933,
  officialRepo: 'skytnt/anime-seg',
  mirrorUrl: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx',
})

const MODELSCOPE_FILE = (repo, file) => `https://www.modelscope.cn/api/v1/models/${repo}/repo?Revision=master&FilePath=${encodeURIComponent(file)}`
const HF_FILE = (endpoint, repo, file) => `${endpoint}/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`
const HF_ENDPOINTS = { cn: ['https://hf-mirror.com', 'https://huggingface.co'], global: ['https://huggingface.co', 'https://hf-mirror.com'] }

/* --------------------------------------------------------------------------------------------- paths / config */

const isWin = process.platform === 'win32'
const venvPython = (venvDir) => (isWin ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python'))

export function defaultAnimeLocalHome() {
  return join(REPO_ROOT, 'ai-engines', 'anime-local')
}

/** `<DSH_VIDEO_HOME>/anime-local.json` */
export function animeLocalManifestPath() {
  return join(resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home'), 'anime-local.json')
}

function readJsonSafe(p) {
  try {
    if (p && existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  } catch {}
  return null
}

function writeJsonAtomic(p, data) {
  mkdirSync(dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  renameSync(tmp, p)
}

/** Where everything is (manifest first, then ANIME_LOCAL_HOME, then the default folder). */
export function resolveAnimeLocalConfig({ home = '' } = {}) {
  loadEnv()
  const manifestPath = animeLocalManifestPath()
  const manifest = readJsonSafe(manifestPath)
  const root = resolve(home || resolveEnvPath('ANIME_LOCAL_HOME', '') || manifest?.home || defaultAnimeLocalHome())
  const sameHome = manifest?.home && resolve(manifest.home).toLowerCase() === root.toLowerCase()
  const mf = sameHome ? manifest : null
  const venvDir = join(root, '.venv')
  const cacheDir = resolve(mf?.cacheDir || join(dirname(root), '.cache'))
  return {
    home: root,
    manifestPath,
    manifest: mf,
    venvDir,
    python: venvPython(venvDir),
    pythonDir: join(root, 'python'),
    modelsDir: join(root, 'models'),
    tha3Dir: join(root, 'models', 'tha3'),
    dctnetDir: join(root, 'models', 'dctnet'),
    u2netPath: join(root, 'models', 'u2net', U2NET_HUMAN_SEG.file),
    animeSegPath: join(root, 'models', 'animeseg', ANIME_SEG.file),
    cacheDir,
    scripts: {
      tha3: resolvePackagePath('scripts', 'avatar', 'tha3_render.py'),
      stylize: resolvePackagePath('scripts', 'avatar', 'anime_stylize.py'),
      codeRoot: dirname(resolvePackagePath('scripts', 'avatar', 'tha3_render.py')),
    },
  }
}

/**
 * Environment of the local-model Python (installs and runs): every cache on the install drive, user site-packages and
 * inherited PYTHONPATH / PYTHONHOME off, no bytecode next to the plugin's scripts.
 */
export function animeLocalPythonEnv(cfg, extra = {}) {
  const c = cfg.cacheDir
  const tmp = join(c, 'tmp')
  for (const d of [c, tmp]) mkdirSync(d, { recursive: true })
  return {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONNOUSERSITE: '1',
    PYTHONHOME: '',
    PYTHONPATH: '',
    PYTHONPYCACHEPREFIX: join(c, 'pycache'),
    UV_CACHE_DIR: join(c, 'uv'),
    UV_PYTHON_INSTALL_DIR: cfg.pythonDir,
    UV_NO_CONFIG: '1',
    UV_HTTP_TIMEOUT: '300',
    PIP_CACHE_DIR: join(c, 'pip'),
    HF_HOME: join(c, 'hf'),
    TORCH_HOME: join(c, 'torch'),
    KERAS_HOME: join(c, 'keras'),
    MPLCONFIGDIR: join(c, 'matplotlib'),
    CUDA_CACHE_PATH: join(c, 'nv-compute'),
    CUDA_CACHE_MAXSIZE: process.env.CUDA_CACHE_MAXSIZE || '1073741824',
    PYTORCH_CUDA_ALLOC_CONF: process.env.PYTORCH_CUDA_ALLOC_CONF || 'expandable_segments:True',
    TF_CPP_MIN_LOG_LEVEL: '2',
    TF_ENABLE_ONEDNN_OPTS: '0',
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
    ...extra,
  }
}

/* ----------------------------------------------------------------------------------------------- file catalog */

/** Every model file one component needs on one device: [{ id, dest, sha256, bytes, sources: [{ name, url }] }] (pure). */
export function animeModelFiles(cfg, { components = ANIME_LOCAL_COMPONENTS, device = 'cpu', mirror = 'cn', styles = DCTNET_DEFAULT_STYLES, variants = null } = {}) {
  const cn = String(mirror || 'cn').toLowerCase() !== 'global'
  const hf = HF_ENDPOINTS[cn ? 'cn' : 'global']
  const out = []
  if (components.includes('tha3')) {
    const vs = Array.isArray(variants) && variants.length ? variants : thaVariantsFor(device)
    for (const v of vs) {
      const pins = THA3_WEIGHTS[v]
      if (!pins) throw new Error(`未知的 THA3 模型版本: ${v}`)
      for (const name of THA3_NAMES) {
        const [sha256, bytes] = pins[name]
        const rel = `${v}/${name}`
        const mirrorSources = hf.map((ep) => ({ name: ep.includes('hf-mirror') ? 'hf-mirror' : 'huggingface', url: HF_FILE(ep, THA3_SOURCES.hfMirrorRepo, rel) }))
        const official = { name: 'official-zip', zipEntry: rel }
        out.push({
          id: `tha3/${rel}`,
          component: 'tha3',
          dest: join(cfg.tha3Dir, v, name),
          sha256,
          bytes,
          sources: cn ? [...mirrorSources, official] : [official, ...mirrorSources.reverse()],
        })
      }
    }
  }
  if (components.includes('stylize')) {
    const list = (Array.isArray(styles) && styles.length ? styles : DCTNET_DEFAULT_STYLES).filter((s) => DCTNET_STYLES[s])
    for (const [name, [sha256, bytes]] of Object.entries(DCTNET_COMMON.files)) {
      out.push({ id: `dctnet/common/${name}`, component: 'stylize', dest: join(cfg.dctnetDir, 'common', name), sha256, bytes, sources: [{ name: 'modelscope', url: MODELSCOPE_FILE(DCTNET_COMMON.repo, name) }] })
    }
    for (const s of list) {
      const st = DCTNET_STYLES[s]
      for (const [role, [file, sha256]] of [['head', st.head], ['bg', st.bg]]) {
        out.push({
          id: `dctnet/${s}/${role}`,
          component: 'stylize',
          dest: join(cfg.dctnetDir, s, role === 'head' ? 'cartoon_h.pb' : 'cartoon_bg.pb'),
          sha256,
          bytes: DCTNET_MODEL_BYTES,
          sources: [{ name: 'modelscope', url: MODELSCOPE_FILE(st.repo, file) }],
        })
      }
    }
    const u = U2NET_HUMAN_SEG
    const mirrors = hf.flatMap((ep) => u.hfMirrors.map((repo) => ({ name: ep.includes('hf-mirror') ? 'hf-mirror' : 'huggingface', url: HF_FILE(ep, repo, u.file) })))
    const official = { name: 'github-rembg', url: u.officialUrl }
    out.push({ id: 'u2net/human_seg', component: 'stylize', dest: cfg.u2netPath, sha256: u.sha256, bytes: u.bytes, sources: cn ? [mirrors[0], official, ...mirrors.slice(1)] : [official, ...mirrors] })
    const s = ANIME_SEG
    const segOfficial = hf.map((ep) => ({ name: ep.includes('hf-mirror') ? 'hf-mirror' : 'huggingface', url: HF_FILE(ep, s.officialRepo, s.file) }))
    const segMirror = { name: 'github-rembg', url: s.mirrorUrl }
    out.push({ id: 'animeseg/isnetis', component: 'stylize', dest: cfg.animeSegPath, sha256: s.sha256, bytes: s.bytes, sources: [segOfficial[0], segMirror, segOfficial[1]] })
  }
  return out
}

export function thaVariantsFor(device) {
  return device === 'cuda' ? [THA3_DEVICE_VARIANT.cuda, THA3_DEVICE_VARIANT.cpu] : [THA3_DEVICE_VARIANT.cpu]
}

const fileSizeIs = (p, bytes) => {
  try {
    return statSync(p).size === bytes
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------------------------------------ hardware */

const NVIDIA_NAME_RX = /nvidia|geforce|quadro|tesla|titan|\brtx\b|\bgtx\b/i
export const ANIME_MIN_RAM_GB = 7.5
export const ANIME_MIN_CUDA_VRAM_GB = 2

/** nvidia-smi details of the first NVIDIA GPU (compute capability decides cu128 / cu126); null without nvidia-smi. */
export function queryNvidiaGpu() {
  try {
    const r = spawnSync('nvidia-smi', ['--query-gpu=name,compute_cap,driver_version,memory.total,memory.free', '--format=csv,noheader,nounits'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    })
    if (r.status !== 0) return null
    const [name, cap, driver, total, free] = String(r.stdout || '').trim().split(/\r?\n/)[0].split(',').map((s) => s.trim())
    if (!name) return null
    return { name, computeCap: Number(cap) || null, driver: driver || '', vramGB: Number(total) / 1024 || null, freeVramGB: Number(free) / 1024 || null }
  } catch {
    return null
  }
}

/**
 * Pure: which device this computer renders with and whether installing makes sense.
 * → { suitable, code: 'CUDA' | 'CUDA_UNVERIFIED' | 'CPU' | 'LOW_RAM' | 'LOW_CPU', device, torchIndex: 'cu128' | 'cu126' | 'cpu',
 *     gpuName, vramGB, title, message }
 */
export function assessAnimeLocalHardware(profile, { nvidia = null } = {}) {
  const gpu = (profile && profile.gpu) || {}
  const all = (Array.isArray(gpu.all) ? gpu.all : []).filter((g) => g && String(g.name || '').trim())
  const isNv = (g) => g.vendor === 'nvidia' || NVIDIA_NAME_RX.test(String(g.name))
  const smi = gpu.hasNvidiaCuda ? all.filter((g) => isNv(g) && g.freeVramGB !== undefined).sort((a, b) => (Number(b.vramGB) || 0) - (Number(a.vramGB) || 0)) : []
  const best = nvidia?.name ? { name: nvidia.name, vramGB: nvidia.vramGB, computeCap: nvidia.computeCap } : smi[0] || (gpu.hasNvidiaCuda && gpu.vendor === 'nvidia' ? { name: gpu.primaryName, vramGB: gpu.vramGB } : null)
  const wmiNv = all.filter(isNv)[0] || null
  const ramGB = Number(profile?.memory?.totalGB) || 0
  const threads = Number(profile?.cpu?.threads) || 0
  const fmt = (v) => `${Number(v) >= 9.5 ? Math.round(v) : Number(v).toFixed(1).replace(/\.0$/, '')} GB`
  const base = { ramGB, cpuThreads: threads }
  if (ramGB > 0 && ramGB < ANIME_MIN_RAM_GB) {
    return { ...base, suitable: false, code: 'LOW_RAM', device: 'cpu', torchIndex: 'cpu', gpuName: best?.name || '', vramGB: best?.vramGB || null, title: '内存不够，不建议安装', message: `本地动漫模型至少需要 8 GB 内存，这台电脑只有 ${fmt(ramGB)}，装好后很可能卡住或失败。` }
  }
  if (best && (Number(best.vramGB) || 0) + 0.25 >= ANIME_MIN_CUDA_VRAM_GB) {
    const cap = Number(best.computeCap) || 0
    const torchIndex = cap > 0 && cap < 7 ? 'cu126' : 'cu128'
    return { ...base, suitable: true, code: 'CUDA', device: 'cuda', torchIndex, gpuName: best.name, vramGB: Number(best.vramGB) || null, computeCap: cap || null, title: '可以用显卡加速', message: `检测到 NVIDIA 显卡「${best.name}」${best.vramGB ? `（显存 ${fmt(best.vramGB)}）` : ''}，生成会比较快。` }
  }
  if (!best && wmiNv) {
    return { ...base, suitable: true, code: 'CUDA_UNVERIFIED', device: 'cuda', torchIndex: 'cu128', gpuName: wmiNv.name, vramGB: null, title: '检测到 NVIDIA 显卡，但读不到显存', message: `检测到「${wmiNv.name}」，但读不到它的显存（通常是显卡驱动太旧）。会先按显卡加速安装，装好后自动检查；用不了就改用 CPU（较慢）。建议先把 NVIDIA 驱动更新到最新版。` }
  }
  if (threads > 0 && threads < 4) {
    return { ...base, suitable: false, code: 'LOW_CPU', device: 'cpu', torchIndex: 'cpu', gpuName: best?.name || '', vramGB: best?.vramGB || null, title: '电脑太慢，不建议安装', message: `这台电脑没有可用的 NVIDIA 显卡，只能用 CPU 计算，但 CPU 只有 ${threads} 个线程，生成一段视频可能要很久。` }
  }
  const name = best?.name || all[0]?.name || ''
  return { ...base, suitable: true, code: 'CPU', device: 'cpu', torchIndex: 'cpu', gpuName: name, vramGB: null, title: '可以安装（用 CPU，较慢）', message: `${name ? `这台电脑的显卡是「${name}」，不是 NVIDIA 显卡` : '这台电脑没有 NVIDIA 显卡'}，可以安装，但只能用 CPU 计算：生成会比较慢，1 秒视频大约要等 5～30 秒（看电脑快慢）。` }
}

/* ---------------------------------------------------------------------------------------------- size estimates */

// Measured on Windows 11 (Python 3.12, uv installs hard-linked from its cache, so the cache adds almost nothing):
// download MB / disk MB per part. torch 2.8.0+cu128 alone is 3.2 GB to download and 7.0 GB installed.
export const ANIME_SIZE_ESTIMATES = Object.freeze({
  python: { downloadMb: 21, diskMb: 70 },
  torchCuda: { downloadMb: 3300, diskMb: 7250 },
  torchCpu: { downloadMb: 235, diskMb: 1350 },
  base: { downloadMb: 20, diskMb: 90 },
  stylizePackages: { downloadMb: 420, diskMb: 1650 },
  tha3Cuda: { downloadMb: 602, diskMb: 602 },
  tha3Cpu: { downloadMb: 58, diskMb: 58 },
  stylizeModels: { downloadMb: 380, diskMb: 380 },
})

/** Estimated download / disk size of a component list on a device (MB, rounded; pure). */
export function estimateAnimeInstallSize({ components = ANIME_LOCAL_COMPONENTS, device = 'cpu' } = {}) {
  const e = ANIME_SIZE_ESTIMATES
  const parts = [e.python, e.base]
  if (components.includes('tha3')) parts.push(device === 'cuda' ? e.torchCuda : e.torchCpu, device === 'cuda' ? e.tha3Cuda : e.tha3Cpu)
  if (components.includes('stylize')) parts.push(e.stylizePackages, e.stylizeModels)
  const downloadMb = parts.reduce((a, p) => a + p.downloadMb, 0)
  const diskMb = parts.reduce((a, p) => a + p.diskMb, 0)
  return { downloadMb, diskMb, label: `下载约 ${mbLabel(downloadMb)}，占用硬盘约 ${mbLabel(diskMb)}` }
}

const mbLabel = (mb) => (mb >= 1000 ? `${(mb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : `${Math.round(mb)} MB`)

/* -------------------------------------------------------------------------------------------- status / catalog */

/** Pure: what is installed in `cfg` (size checks of every pinned file + the Python environment). */
export function inspectAnimeLocalInstall(cfg) {
  const mf = cfg.manifest || {}
  const pyOk = existsSync(cfg.python)
  const device = mf.device === 'cuda' ? 'cuda' : 'cpu'
  const comp = {}
  for (const id of ANIME_LOCAL_COMPONENTS) {
    const want = mf.components?.[id]?.installed
    const files = animeModelFiles(cfg, { components: [id], device, styles: mf.components?.stylize?.styles, variants: mf.components?.tha3?.variants })
    const missing = files.filter((f) => !fileSizeIs(f.dest, f.bytes)).map((f) => f.id)
    const script = id === 'tha3' ? cfg.scripts.tha3 : cfg.scripts.stylize
    if (!existsSync(script)) missing.push(`script:${id}`)
    if (!pyOk) missing.push('python')
    comp[id] = { installed: Boolean(want) && missing.length === 0, recorded: Boolean(want), missing }
  }
  const variants = (mf.components?.tha3?.variants || []).filter((v) => THA3_WEIGHTS[v])
  const renderVariant = device === 'cuda' && variants.includes(THA3_DEVICE_VARIANT.cuda) ? THA3_DEVICE_VARIANT.cuda : variants.includes(THA3_DEVICE_VARIANT.cpu) ? THA3_DEVICE_VARIANT.cpu : variants[0] || ''
  return { components: comp, device, renderVariant, pythonOk: pyOk }
}

function statusText({ tha3, stylize, device, gpu, speed }) {
  if (!tha3 && !stylize) return '本地动漫模型还没有安装（可选，免费）：装好后动漫形象能张嘴说话、眨眼、点头，还能在电脑上把照片画成动漫形象。'
  const parts = []
  if (tha3) {
    const sp = speed?.fps ? `，每秒约生成 ${speed.fps >= 10 ? Math.round(speed.fps) : speed.fps.toFixed(1)} 帧` : ''
    parts.push(device === 'cuda' ? `动作模型已安装 · 用 NVIDIA 显卡加速${gpu ? `（${gpu}）` : ''}${sp}` : `动作模型已安装 · 没有可用的 NVIDIA 显卡，用 CPU 生成（较慢${sp}）`)
  } else parts.push('动作模型还没有安装')
  parts.push(stylize ? '照片动漫化模型已安装' : '照片动漫化模型还没有安装')
  return parts.join('；')
}

/**
 * What is installed (quick file checks, no Python). Shape used by anime-engines.js: `ready` (= tier 2 can render),
 * `summary` / `message` (plain Chinese), `device` ('cuda' | 'cpu'), plus per-component details.
 */
export function getAnimeLocalStatus({ home = '' } = {}) {
  const cfg = resolveAnimeLocalConfig({ home })
  const info = inspectAnimeLocalInstall(cfg)
  const mf = cfg.manifest || {}
  const tha3 = info.components.tha3.installed
  const stylize = info.components.stylize.installed
  const summary = statusText({ tha3, stylize, device: info.device, gpu: mf.gpu || '', speed: mf.speed?.tha3 })
  return {
    ready: tha3,
    stylizeReady: stylize,
    installed: { tha3, stylize },
    tha3: { installed: tha3, missing: info.components.tha3.missing.slice(0, 8), variant: info.renderVariant, variants: mf.components?.tha3?.variants || [] },
    stylize: { installed: stylize, missing: info.components.stylize.missing.slice(0, 8), styles: mf.components?.stylize?.styles || [] },
    device: tha3 || stylize ? info.device : '',
    gpu: mf.gpu || '',
    speed: mf.speed || null,
    home: cfg.home,
    python: cfg.python,
    manifestPath: cfg.manifestPath,
    installedAt: mf.installedAt || '',
    version: mf.version || 0,
    summary,
    message: summary,
    notice: 'Talking Head Anime 3 模型作者 Pramook Khungurn（CC BY 4.0）；DCT-Net 阿里巴巴达摩院（Apache-2.0）',
  }
}

/** What the install panel shows: the components, this computer's device, sizes and the current status. */
export function getAnimeLocalCatalog({ hardwareProfile = null } = {}) {
  const cfg = resolveAnimeLocalConfig()
  let hw = hardwareProfile
  if (!hw) {
    try {
      hw = probeHardwareProfile({ targetDir: REPO_ROOT })
    } catch {
      hw = null
    }
  }
  const hardware = assessAnimeLocalHardware(hw, { nvidia: hardwareProfile ? null : queryNvidiaGpu() })
  const status = getAnimeLocalStatus()
  const device = hardware.device
  const sizeOf = (components) => estimateAnimeInstallSize({ components, device })
  return {
    defaultHome: defaultAnimeLocalHome(),
    home: cfg.home,
    manifestPath: cfg.manifestPath,
    device,
    hardware,
    status,
    total: sizeOf(ANIME_LOCAL_COMPONENTS),
    components: [
      {
        id: 'tha3',
        name: '动作模型（Talking Head Anime 3）',
        text: '让动漫形象跟着你的声音张嘴说话，还会眨眼、挑眉、点头、轻轻晃动和呼吸。',
        speed: device === 'cuda' ? '用 NVIDIA 显卡：很快（1 秒视频不到 1 秒）' : '用 CPU：比较慢（1 秒视频大约要等 5～30 秒，看电脑快慢）',
        license: '代码 MIT；模型 CC BY 4.0（作者 Pramook Khungurn，可商用，需署名）',
        installed: status.installed.tha3,
        size: sizeOf(['tha3']),
      },
      {
        id: 'stylize',
        name: '照片动漫化模型（DCT-Net + 人物抠图）',
        text: '在你的电脑上把照片画成动漫形象并抠掉背景，不花钱。风格：日系动漫、3D 卡通、萌系插画。',
        speed: '只用 CPU，一张照片几秒钟',
        license: 'DCT-Net 代码与模型 Apache-2.0（阿里巴巴达摩院）；U²-Net 人像分割、SkyTNT 动漫人物分割 Apache-2.0',
        installed: status.installed.stylize,
        size: sizeOf(['stylize']),
      },
    ],
  }
}

/* --------------------------------------------------------------------------------------------- process helpers */

function streamCmd(bin, args, { cwd, env, timeoutMs = 3_600_000, onLine, signal } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (signal?.aborted) return rejectPromise(abortError())
    let child
    try {
      child = spawn(bin, args, { cwd: cwd || REPO_ROOT, env: env || process.env, windowsHide: true, shell: false })
    } catch (err) {
      return rejectPromise(err)
    }
    let outTail = ''
    let errTail = ''
    const partial = { out: '', err: '' }
    const push = (chunk, key) => {
      const txt = chunk.toString('utf8')
      if (key === 'err') errTail = (errTail + txt).slice(-8000)
      else outTail = (outTail + txt).slice(-8000)
      const parts = (partial[key] + txt).split(/\r?\n|\r/)
      partial[key] = parts.pop() || ''
      for (const line of parts) if (line.trim()) onLine?.(line.trim())
    }
    child.stdout?.on('data', (c) => push(c, 'out'))
    child.stderr?.on('data', (c) => push(c, 'err'))
    const kill = () => {
      try {
        if (isWin && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {})
        child.kill('SIGKILL')
      } catch {}
    }
    let settled = false
    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      kill()
      finish(() => rejectPromise(abortError()))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      kill()
      finish(() => rejectPromise(new Error(`安装步骤超时（${Math.round(timeoutMs / 60000)} 分钟）：${bin} ${args.slice(0, 3).join(' ')}`)))
    }, timeoutMs)
    child.on('error', (err) => finish(() => rejectPromise(err)))
    child.on('close', (code) => {
      for (const k of ['out', 'err']) if (partial[k].trim()) onLine?.(partial[k].trim())
      finish(() => resolvePromise({ code: Number(code ?? 1), stdout: outTail, stderr: errTail }))
    })
  })
}

function abortError() {
  const err = new Error('安装已手动停止')
  err.name = 'AbortError'
  err.code = 'ABORT_ERR'
  return err
}

function freeBytesOf(dir) {
  try {
    let probe = resolve(dir)
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
    const s = statfsSync(probe)
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/* ------------------------------------------------------------------------------------------------- downloads */

export function sha256File(abs) {
  return new Promise((resolveP, rejectP) => {
    const h = createHash('sha256')
    createReadStream(abs)
      .on('data', (d) => h.update(d))
      .on('error', rejectP)
      .on('end', () => resolveP(h.digest('hex')))
  })
}

// verified-file memo (path → size + mtime + sha) so a re-run does not hash 600 MB again
function verifiedMemo(cfg) {
  const p = join(cfg.modelsDir, '.verified.json')
  const data = readJsonSafe(p) || {}
  return {
    ok(dest, sha256) {
      const m = data[dest]
      if (!m || m.sha256 !== sha256) return false
      try {
        const st = statSync(dest)
        return st.size === m.size && Math.round(st.mtimeMs) === m.mtimeMs
      } catch {
        return false
      }
    },
    put(dest, sha256) {
      try {
        const st = statSync(dest)
        data[dest] = { sha256, size: st.size, mtimeMs: Math.round(st.mtimeMs) }
        writeJsonAtomic(p, data)
      } catch {}
    },
  }
}

/** Is `dest` already the pinned file? (size, then the memo, then a real hash) */
async function hasVerifiedFile(dest, sha256, bytes, memo) {
  if (!fileSizeIs(dest, bytes)) return false
  if (memo?.ok(dest, sha256)) return true
  const got = await sha256File(dest)
  if (got === sha256) {
    memo?.put(dest, sha256)
    return true
  }
  return false
}

/**
 * Resumable download of one URL to `partPath` (appends when the server honours Range). Aborts after `idleMs` without
 * bytes. → { url, bytes }
 */
export async function downloadToPart({ url, partPath, onBytes, signal, idleMs = 90_000, timeoutMs = 4 * 3_600_000, userAgent = 'dsh-video-workbench-anime-installer' }) {
  mkdirSync(dirname(partPath), { recursive: true })
  const startAt = existsSync(partPath) ? statSync(partPath).size : 0
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
  let idleTimer = null
  const bumpIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => ctrl.abort(new Error('IDLE')), idleMs)
  }
  const timer = setTimeout(() => ctrl.abort(new Error('TIMEOUT')), timeoutMs)
  try {
    bumpIdle()
    const headers = { 'User-Agent': userAgent }
    if (startAt > 0) headers.Range = `bytes=${startAt}-`
    const resp = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal })
    if (resp.status === 416 && startAt > 0) return { url, bytes: startAt }
    if (!(resp.status === 200 || resp.status === 206)) throw new Error(`HTTP ${resp.status}`)
    const append = resp.status === 206 && startAt > 0
    const len = Number(resp.headers.get('content-length') || 0)
    const expected = append ? startAt + len : len
    let received = append ? startAt : 0
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length
        bumpIdle()
        onBytes?.(received, expected)
        cb(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(resp.body), counter, createWriteStream(partPath, { flags: append ? 'a' : 'w' }))
    if (expected > 0 && statSync(partPath).size !== expected) throw new Error(`下载不完整 (${statSync(partPath).size}/${expected})`)
    return { url, bytes: statSync(partPath).size }
  } catch (err) {
    if (signal?.aborted) throw abortError()
    const reason = ctrl.signal.reason?.message
    if (reason === 'IDLE') throw new Error('长时间没有收到数据')
    if (reason === 'TIMEOUT') throw new Error('下载超时')
    throw err
  } finally {
    clearTimeout(timer)
    clearTimeout(idleTimer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}

/**
 * Download a pinned file from the first source that delivers the exact bytes (SHA-256 + size). A `.part` is only ever
 * continued from the same source; a wrong hash discards it and moves on to the next source. → { source, url }
 */
export async function downloadPinnedFile({ sources, dest, sha256, bytes, signal, onBytes, onNote, retries = 3, memo = null }) {
  const errors = []
  const partPath = `${dest}.part`
  const srcPath = `${dest}.part.src`
  for (const src of sources) {
    if (!src?.url) continue
    if (existsSync(partPath) && (readFileSafe(srcPath) !== src.url || statSync(partPath).size > bytes)) rmSync(partPath, { force: true })
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(srcPath, src.url)
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await downloadToPart({ url: src.url, partPath, onBytes, signal })
        const size = statSync(partPath).size
        if (size !== bytes) throw new Error(`文件大小不对（${size} / ${bytes}）`)
        const got = await sha256File(partPath)
        if (got !== sha256) {
          rmSync(partPath, { force: true })
          errors.push(`${src.name}: 指纹不符`)
          onNote?.(`⚠ ${src.name} 上的文件和官方文件不一致，已丢弃，换下一个下载源`)
          break
        }
        rmSync(dest, { force: true })
        renameSync(partPath, dest)
        rmSync(srcPath, { force: true })
        memo?.put(dest, sha256)
        return { source: src.name, url: src.url }
      } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') throw abortError()
        const msg = String(err?.message || err).slice(0, 160)
        if (/HTTP (40[0-9]|410)/.test(msg) || attempt >= retries) {
          errors.push(`${src.name}: ${msg}`)
          onNote?.(`⚠ ${src.name} 下载失败（${msg}），换下一个下载源`)
          if (/HTTP/.test(msg)) rmSync(partPath, { force: true })
          break
        }
        onNote?.(`⚠ 下载中断（${msg}），${2 ** attempt} 秒后继续…`)
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }
  }
  rmSync(srcPath, { force: true })
  const err = new Error(`下载失败：所有下载源都不可用（${errors.join('；').slice(0, 400)}）`)
  err.code = 'DOWNLOAD_FAILED'
  throw err
}

function readFileSafe(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/* ----------------------------------------------------------------------------------------- minimal zip reader */

/** Central-directory listing of a zip (no zip64): [{ name, method, compSize, size, localOffset }]. */
export function readZipEntries(zipPath) {
  const fd = openSync(zipPath, 'r')
  try {
    const size = fstatSync(fd).size
    const tailLen = Math.min(size, 65557)
    const tail = Buffer.alloc(tailLen)
    readSync(fd, tail, 0, tailLen, size - tailLen)
    let eocd = -1
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error('不是有效的 zip 文件')
    const count = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('暂不支持 zip64 格式')
    const cd = Buffer.alloc(cdSize)
    readSync(fd, cd, 0, cdSize, cdOffset)
    const out = []
    let p = 0
    for (let k = 0; k < count; k++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目录损坏')
      const method = cd.readUInt16LE(p + 10)
      const compSize = cd.readUInt32LE(p + 20)
      const usize = cd.readUInt32LE(p + 24)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
      out.push({ name, method, compSize, size: usize, localOffset })
      p += 46 + nameLen + extraLen + commentLen
    }
    return out
  } finally {
    closeSync(fd)
  }
}

/** Stream one entry (stored or deflate) to `dest`. */
export async function extractZipEntry(zipPath, entry, dest) {
  const fd = openSync(zipPath, 'r')
  let dataStart = 0
  try {
    const hdr = Buffer.alloc(30)
    readSync(fd, hdr, 0, 30, entry.localOffset)
    if (hdr.readUInt32LE(0) !== 0x04034b50) throw new Error('zip 文件头损坏')
    dataStart = entry.localOffset + 30 + hdr.readUInt16LE(26) + hdr.readUInt16LE(28)
  } finally {
    closeSync(fd)
  }
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.unzip`
  const src = entry.compSize > 0 ? createReadStream(zipPath, { start: dataStart, end: dataStart + entry.compSize - 1 }) : Readable.from([])
  if (entry.method === 8) await pipeline(src, createInflateRaw(), createWriteStream(tmp))
  else if (entry.method === 0) await pipeline(src, createWriteStream(tmp))
  else throw new Error(`不支持的 zip 压缩方式 ${entry.method}`)
  rmSync(dest, { force: true })
  renameSync(tmp, dest)
}

/* ---------------------------------------------------------------------------------------------------- uv */

async function findUv(env) {
  const cands = [
    String(process.env.UV_BIN || '').trim(),
    'uv',
    join(homedir(), '.local', 'bin', isWin ? 'uv.exe' : 'uv'),
    join(homedir(), '.cargo', 'bin', isWin ? 'uv.exe' : 'uv'),
  ].filter(Boolean)
  for (const c of cands) {
    try {
      const r = await streamCmd(c, ['--version'], { env, timeoutMs: 20_000 })
      if (r.code === 0) return { bin: c, version: r.stdout.trim() }
    } catch {}
  }
  return null
}

/** uv on PATH, or a hash-pinned copy bootstrapped from PyPI into `<home>/tools` (Windows x64). */
async function ensureUv({ cfg, env, mirror, signal, emit, memo }) {
  const local = join(cfg.home, 'tools', isWin ? 'uv.exe' : 'uv')
  if (existsSync(local)) {
    const r = await streamCmd(local, ['--version'], { env, timeoutMs: 20_000 }).catch(() => null)
    if (r?.code === 0) return { bin: local, version: r.stdout.trim(), bootstrapped: true }
  }
  const found = await findUv(env)
  if (found) return found
  if (!(isWin && process.arch === 'x64')) throw new Error('需要先安装 uv（https://docs.astral.sh/uv/）再安装本地动漫模型')
  emit(4, '正在下载 Python 环境管理工具 uv（约 20 MB）…')
  const b = UV_BOOTSTRAP
  const whl = join(cfg.home, 'tools', b.file)
  const cn = String(mirror || 'cn').toLowerCase() !== 'global'
  const urls = [`https://pypi.tuna.tsinghua.edu.cn/packages/${b.path}`, `https://files.pythonhosted.org/packages/${b.path}`]
  if (!(await hasVerifiedFile(whl, b.sha256, b.bytes, memo))) {
    await downloadPinnedFile({ sources: (cn ? urls : urls.reverse()).map((url) => ({ name: 'pypi', url })), dest: whl, sha256: b.sha256, bytes: b.bytes, signal, memo })
  }
  const entry = readZipEntries(whl).find((e) => /\/scripts\/uv\.exe$/i.test(e.name))
  if (!entry) throw new Error('uv 安装包里没有找到 uv.exe')
  await extractZipEntry(whl, entry, local)
  const r = await streamCmd(local, ['--version'], { env, timeoutMs: 20_000 })
  if (r.code !== 0) throw new Error('uv 无法运行')
  return { bin: local, version: r.stdout.trim(), bootstrapped: true }
}

/* ------------------------------------------------------------------------------------------------ install */

const VERIFY_CODE = (withTha, withStylize) =>
  [
    'import json, sys',
    'info = {"python": sys.version.split()[0], "executable": sys.executable}',
    'try:',
    '    import numpy, PIL',
    '    info.update(numpy=numpy.__version__, pillow=PIL.__version__)',
    'except Exception as exc:',
    '    info["baseError"] = str(exc)[:300]',
    ...(withTha
      ? [
          'try:',
          '    import torch',
          '    info.update(torch=torch.__version__, cudaVersion=torch.version.cuda, cudaAvailable=bool(torch.cuda.is_available()))',
          '    if torch.cuda.is_available():',
          '        x = torch.ones(64, 64, device="cuda")',
          '        info["cudaKernelOk"] = bool(float((x @ x).sum().item()) == 64.0 * 64 * 64)',
          '        info.update(gpu=torch.cuda.get_device_name(0), capability=list(torch.cuda.get_device_capability(0)), vramGB=round(torch.cuda.get_device_properties(0).total_memory / 1024 ** 3, 2))',
          'except Exception as exc:',
          '    info["torchError"] = str(exc)[:400]',
        ]
      : []),
    ...(withStylize
      ? [
          'try:',
          '    import tensorflow as tf, cv2, onnxruntime',
          '    info.update(tensorflow=tf.__version__, opencv=cv2.__version__, onnxruntime=onnxruntime.__version__)',
          'except Exception as exc:',
          '    info["stylizeError"] = str(exc)[:400]',
        ]
      : []),
    'print(json.dumps(info))',
  ].join('\n')

const lastJsonLine = (txt) => {
  const lines = String(txt || '').trim().split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i])
    } catch {}
  }
  return null
}

/** Pure: the ordered steps of an install (what is downloaded from where), for the panel / tests. */
export function planAnimeLocalInstall({ cfg, components = ANIME_LOCAL_COMPONENTS, hardware, mirror = 'cn', styles = DCTNET_DEFAULT_STYLES, variants = null } = {}) {
  const comps = ANIME_LOCAL_COMPONENTS.filter((c) => components.includes(c))
  if (!comps.length) throw new Error('请选择要安装的模型（tha3 / stylize）')
  const device = hardware?.device === 'cuda' ? 'cuda' : 'cpu'
  const cn = String(mirror || 'cn').toLowerCase() !== 'global'
  const pypi = cn ? PYPI_INDEX_URLS.cn : PYPI_INDEX_URLS.global
  const steps = [{ id: 'python', what: `Python ${ANIME_PYTHON_VERSION}（uv 管理）`, mirrors: PYTHON_INSTALL_MIRRORS[cn ? 'cn' : 'global'] }]
  const packages = []
  if (comps.includes('tha3')) {
    const idx = device === 'cuda' ? ANIME_TORCH_INDEXES[hardware?.torchIndex === 'cu126' ? 'cu126' : 'cu128'] : pypi
    packages.push({ group: 'torch', indexUrl: idx, packages: [`torch==${ANIME_TORCH_VERSION}`] })
  }
  const pyPkgs = [...ANIME_BASE_PACKAGES, ...(comps.includes('stylize') ? ANIME_STYLIZE_PACKAGES : [])]
  packages.push({ group: 'pypi', indexUrl: pypi, packages: pyPkgs })
  steps.push({ id: 'packages', packages })
  const files = animeModelFiles(cfg, { components: comps, device, mirror, styles, variants })
  steps.push({ id: 'models', files })
  return { components: comps, device, mirror: cn ? 'cn' : 'global', steps, files, packages }
}

/**
 * Install the local anime models. `components`: ['tha3', 'stylize'] (default both). `force`: install even when the
 * hardware check advises against it (too little memory / a very slow CPU). `reinstall`: reinstall the Python packages.
 * `styles`: DCT-Net styles (default anime / 3d / design). Never writes outside `installDir` and the cache folder next to
 * it (`<installDir>/../.cache`, shared with the MuseTalk installer so torch is downloaded once).
 * → { ok, home, manifest, status, usage, logs, hardware }
 */
export async function installAnimeLocal({
  installDir = '',
  mirror = 'cn',
  components = ANIME_LOCAL_COMPONENTS,
  force = false,
  reinstall = false,
  styles = DCTNET_DEFAULT_STYLES,
  variants = null,
  cacheDir = '',
  hardwareProfile = null,
  signal,
  onProgress,
} = {}) {
  loadEnv()
  const comps = ANIME_LOCAL_COMPONENTS.filter((c) => (Array.isArray(components) ? components : [components]).includes(c))
  if (!comps.length) throw Object.assign(new Error('请选择要安装的模型（动作模型 tha3 / 照片动漫化 stylize）'), { code: 'BAD_REQUEST' })
  const logs = []
  let lastPct = 0
  const emit = (pct, message) => {
    lastPct = Math.max(lastPct, Math.min(100, Math.round(pct)))
    logs.push(message)
    if (logs.length > 300) logs.shift()
    onProgress?.({ stage: 'anime-local-install', pct: lastPct, progress: lastPct, message, logs: logs.slice(-24) })
  }
  const prevCfg = resolveAnimeLocalConfig()
  const home = resolve(installDir || prevCfg.home)
  const cfg = resolveAnimeLocalConfig({ home })
  if (cacheDir) cfg.cacheDir = resolve(cacheDir)

  // 0. hardware (nothing is created before this passes)
  let hw = hardwareProfile
  if (!hw) {
    try {
      hw = probeHardwareProfile({ targetDir: REPO_ROOT, forceRefresh: true })
    } catch {
      hw = null
    }
  }
  const hardware = assessAnimeLocalHardware(hw, { nvidia: hardwareProfile ? null : queryNvidiaGpu() })
  if (!hardware.suitable && !force) {
    const err = new Error(`${hardware.title}：${hardware.message}（如果确定仍要安装：点「仍要安装」）`)
    err.code = 'ANIME_LOCAL_UNSUITABLE'
    err.status = 409
    err.expose = true
    err.hardware = hardware
    throw err
  }
  const plan = planAnimeLocalInstall({ cfg, components: comps, hardware, mirror, styles, variants })
  const device = plan.device
  emit(1, hardware.suitable ? `电脑检查：${hardware.message}` : `⚠ ${hardware.title}：已按你的要求仍然安装`)

  // 1. disk space (only what is still missing)
  const est = estimateAnimeInstallSize({ components: comps, device })
  const freeBytes = freeBytesOf(home)
  const haveBytes = dirSizeBytes(home)
  const needBytes = Math.max(0, est.diskMb * 1024 * 1024 - haveBytes) + 1024 ** 3
  emit(2, `安装位置：${home}（剩余空间 ${(freeBytes / 1024 ** 3).toFixed(1)} GB，${est.label}）`)
  if (Number.isFinite(freeBytes) && freeBytes < needBytes) {
    const err = new Error(`硬盘空间不够：${home} 所在的盘只剩 ${(freeBytes / 1024 ** 3).toFixed(1)} GB，至少需要 ${(needBytes / 1024 ** 3).toFixed(1)} GB。请清理空间，或换一个盘安装。`)
    err.code = 'DISK_FULL'
    throw err
  }
  for (const d of [home, cfg.modelsDir, cfg.cacheDir]) mkdirSync(d, { recursive: true })
  const env = animeLocalPythonEnv(cfg)
  const pipEnv = withoutInheritedIndexEnv(env)
  const memo = verifiedMemo(cfg)

  // 2. uv + Python 3.12 (uv-managed, inside the install folder; no PATH shims, no registry entries)
  const uv = await ensureUv({ cfg, env, mirror, signal, emit, memo })
  emit(5, `uv：${uv.version}`)
  let pythonSource = 'uv-managed'
  if (!existsSync(cfg.python)) {
    emit(6, `正在准备 Python ${ANIME_PYTHON_VERSION}（只装在安装文件夹里，不影响电脑上别的 Python）…`)
    let installed = false
    const errors = []
    for (const m of plan.steps[0].mirrors) {
      const args = ['python', 'install', ANIME_PYTHON_VERSION, '--install-dir', cfg.pythonDir, '--no-bin', '--no-registry', ...(m ? ['--mirror', m] : [])]
      const r = await streamCmd(uv.bin, args, { env: pipEnv, timeoutMs: 900_000, signal, onLine: (l) => emit(7, `[python] ${l.slice(0, 140)}`) })
      if (r.code === 0) {
        installed = true
        break
      }
      errors.push((r.stderr || r.stdout).slice(-200))
    }
    const venvArgs = ['venv', '--python', ANIME_PYTHON_VERSION, ...(installed ? ['--managed-python', '--no-python-downloads'] : ['--no-managed-python']), ...(existsSync(cfg.venvDir) ? ['--clear'] : []), cfg.venvDir]
    if (!installed) {
      pythonSource = 'system'
      emit(8, `⚠ 下载 Python 失败（${errors.join(' | ').slice(0, 200)}），改用这台电脑上已有的 Python ${ANIME_PYTHON_VERSION}`)
    }
    const v = await streamCmd(uv.bin, venvArgs, { env: pipEnv, timeoutMs: 300_000, signal, onLine: (l) => emit(9, `[venv] ${l.slice(0, 140)}`) })
    if (v.code !== 0 || !existsSync(cfg.python)) {
      throw new Error(`创建 Python 环境失败：${(v.stderr || v.stdout).slice(-400)}${installed ? '' : `（也没能下载 Python ${ANIME_PYTHON_VERSION}，请检查网络）`}`)
    }
  } else emit(9, '已有 Python 环境，继续补齐')

  // 3. Python packages: one install per index (torch from the official PyTorch index on NVIDIA, the rest from PyPI)
  const pip = async (group, indexUrl, pkgs, pct, label) => {
    emit(pct, label)
    const args = buildPipInstallArgs({ uv: true, python: cfg.python, packages: pkgs, indexUrl, extraArgs: reinstall ? ['--reinstall'] : [] })
    // uv prints nothing while a big wheel downloads: a heartbeat keeps the panel alive
    const t0 = Date.now()
    const beat = setInterval(() => emit(pct, `${label.replace(/…$/, '')}（已进行 ${Math.max(1, Math.round((Date.now() - t0) / 60000))} 分钟，请耐心等待）`), 30_000)
    try {
      const r = await streamCmd(uv.bin, args, { env: pipEnv, timeoutMs: 4 * 3_600_000, signal, onLine: (l) => emit(pct, `[uv] ${l.slice(0, 140)}`) })
      if (r.code !== 0) throw new Error(`安装 Python 组件失败（${group}）：${(r.stderr || r.stdout).slice(-500)}`)
    } finally {
      clearInterval(beat)
    }
  }
  for (const p of plan.packages) {
    if (p.group === 'torch') {
      await pip('torch', p.indexUrl, p.packages, 12, device === 'cuda' ? `正在下载显卡加速组件 PyTorch ${ANIME_TORCH_VERSION}（${p.indexUrl.endsWith('cu126') ? 'CUDA 12.6' : 'CUDA 12.8，支持 RTX 50 系'}，约 3 GB，第一次要等一会儿）…` : `正在下载 PyTorch ${ANIME_TORCH_VERSION}（CPU 版，约 250 MB）…`)
    } else {
      await pip('pypi', p.indexUrl, p.packages, 30, comps.includes('stylize') ? '正在安装照片动漫化需要的组件（TensorFlow CPU 版等，约 400 MB）…' : '正在安装基础组件…')
    }
  }

  // 4. check the environment (and that the GPU really runs CUDA kernels)
  emit(40, '正在检查 Python 环境…')
  const ver = await streamCmd(cfg.python, ['-I', '-c', VERIFY_CODE(comps.includes('tha3'), comps.includes('stylize'))], { env, timeoutMs: 600_000, signal })
  const info = lastJsonLine(ver.stdout) || {}
  if (ver.code !== 0 || info.baseError || info.torchError || info.stylizeError) {
    throw new Error(`Python 环境检查没通过：${info.baseError || info.torchError || info.stylizeError || (ver.stderr || ver.stdout).slice(-400)}`)
  }
  let renderDevice = 'cpu'
  let deviceNote = ''
  if (comps.includes('tha3') || prevCfg.manifest?.components?.tha3?.installed) {
    if (device === 'cuda' && info.cudaAvailable && info.cudaKernelOk) renderDevice = 'cuda'
    else if (device === 'cuda') deviceNote = info.cudaAvailable ? '显卡不支持这个版本的 CUDA，改用 CPU 生成（较慢）' : 'PyTorch 用不了显卡（多半是 NVIDIA 驱动太旧，更新驱动后点「重新检查」），先用 CPU 生成（较慢）'
  }
  emit(44, `环境检查通过：Python ${info.python}${info.torch ? ` · torch ${info.torch}` : ''}${renderDevice === 'cuda' ? ` · ${info.gpu}` : ''}${info.tensorflow ? ` · TensorFlow ${info.tensorflow}` : ''}${deviceNote ? ` · ${deviceNote}` : ''}`)

  // 5. model files (pinned; mirrors only with the exact official hash)
  const filesDevice = renderDevice === 'cuda' ? 'cuda' : device
  const files = animeModelFiles(cfg, { components: comps, device: filesDevice, mirror, styles, variants })
  const totalBytes = files.reduce((a, f) => a + f.bytes, 0)
  let doneBytes = 0
  const downloaded = []
  const haveBySha = new Map()
  let zipPath = ''
  const zipEntries = () => {
    if (!zipPath) return null
    return readZipEntries(zipPath)
  }
  const ensureOfficialZip = async () => {
    if (zipPath) return zipPath
    const z = THA3_SOURCES.officialZip
    const dest = join(cfg.home, 'downloads', 'talking-head-anime-3-models.zip')
    if (!(await hasVerifiedFile(dest, z.sha256, z.bytes, null))) {
      emit(50, '正在从作者官方网盘（Dropbox）下载动作模型压缩包（约 800 MB）…')
      let last = 0
      await downloadPinnedFile({
        sources: [{ name: 'official-zip', url: z.url }],
        dest,
        sha256: z.sha256,
        bytes: z.bytes,
        signal,
        retries: 4,
        onNote: (m) => emit(50, m),
        onBytes: (got, total) => {
          const now = Date.now()
          if (now - last < 2000) return
          last = now
          emit(50 + Math.round((got / (total || z.bytes)) * 10), `下载动作模型压缩包：${Math.round(got / 1048576)} / ${Math.round((total || z.bytes) / 1048576)} MB`)
        },
      })
    }
    zipPath = dest
    return dest
  }
  for (const f of files) {
    if (await hasVerifiedFile(f.dest, f.sha256, f.bytes, memo)) {
      doneBytes += f.bytes
      haveBySha.set(f.sha256, f.dest)
      downloaded.push({ id: f.id, skipped: true })
      continue
    }
    // the same bytes already downloaded under another name (some DCT-Net styles use one model for head and picture)
    const twin = haveBySha.get(f.sha256)
    if (twin && existsSync(twin)) {
      mkdirSync(dirname(f.dest), { recursive: true })
      copyFileSync(twin, f.dest)
      if (await hasVerifiedFile(f.dest, f.sha256, f.bytes, memo)) {
        doneBytes += f.bytes
        downloaded.push({ id: f.id, copiedFrom: twin })
        continue
      }
    }
    const pct = () => 48 + Math.round((doneBytes / Math.max(1, totalBytes)) * 44)
    emit(pct(), `正在下载 ${f.id}（${mbLabel(f.bytes / 1048576)}）…`)
    let last = 0
    const urlSources = []
    let res = null
    const errors = []
    for (const src of f.sources) {
      if (src.zipEntry) {
        // official route for THA3: the author's zip, then extract + check the single file
        try {
          if (urlSources.length) {
            res = await downloadPinnedFile({ sources: urlSources.splice(0), dest: f.dest, sha256: f.sha256, bytes: f.bytes, signal, memo, onNote: (m) => emit(pct(), m), onBytes: (got) => Date.now() - last > 2000 && (last = Date.now()) && emit(pct(), `下载 ${f.id}：${Math.round(got / 1048576)} MB`) })
            break
          }
        } catch (err) {
          if (err?.name === 'AbortError') throw err
          errors.push(err.message)
        }
        try {
          await ensureOfficialZip()
          const entry = (zipEntries() || []).find((e) => e.name === src.zipEntry)
          if (!entry) throw new Error(`官方压缩包里没有 ${src.zipEntry}`)
          await extractZipEntry(zipPath, entry, f.dest)
          if (!(await hasVerifiedFile(f.dest, f.sha256, f.bytes, memo))) {
            rmSync(f.dest, { force: true })
            throw new Error('解压出来的文件指纹不对')
          }
          res = { source: 'official-zip', url: THA3_SOURCES.officialZip.url }
          break
        } catch (err) {
          if (err?.name === 'AbortError') throw err
          errors.push(`official-zip: ${err.message}`)
          emit(pct(), `⚠ 官方网盘下载失败（${String(err.message).slice(0, 120)}），换镜像`)
        }
      } else urlSources.push(src)
    }
    if (!res && urlSources.length) {
      try {
        res = await downloadPinnedFile({ sources: urlSources, dest: f.dest, sha256: f.sha256, bytes: f.bytes, signal, memo, onNote: (m) => emit(pct(), m), onBytes: (got) => Date.now() - last > 2000 && (last = Date.now()) && emit(pct(), `下载 ${f.id}：${Math.round(got / 1048576)} / ${Math.round(f.bytes / 1048576)} MB`) })
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        errors.push(err.message)
      }
    }
    if (!res) {
      const err = new Error(`下载模型文件 ${f.id} 失败：${errors.join('；').slice(0, 500)}`)
      err.code = 'DOWNLOAD_FAILED'
      throw err
    }
    doneBytes += f.bytes
    haveBySha.set(f.sha256, f.dest)
    downloaded.push({ id: f.id, source: res.source })
  }
  if (zipPath) {
    // keep the official licence text next to the weights, then drop the 800 MB zip
    try {
      const lic = (zipEntries() || []).find((e) => e.name === THA3_SOURCES.licenseInZip.file)
      if (lic) await extractZipEntry(zipPath, lic, join(cfg.tha3Dir, 'LICENSE.txt'))
    } catch {}
    rmSync(zipPath, { force: true })
  }
  if (comps.includes('tha3')) writeFileSync(join(cfg.tha3Dir, 'ATTRIBUTION.txt'), THA3_ATTRIBUTION_TEXT, 'utf8')

  // 6. self-test: load the models and time one frame / one picture
  const speed = { ...(prevCfg.manifest?.speed || {}) }
  const variantsInstalled = comps.includes('tha3') ? (Array.isArray(variants) && variants.length ? variants : thaVariantsFor(filesDevice)) : prevCfg.manifest?.components?.tha3?.variants || []
  if (comps.includes('tha3')) {
    emit(94, '正在试运行动作模型（加载模型并生成几帧）…')
    const variant = renderDevice === 'cuda' ? THA3_DEVICE_VARIANT.cuda : THA3_DEVICE_VARIANT.cpu
    const r = await streamCmd(cfg.python, ['-I', cfg.scripts.tha3, '--doctor', '--models', cfg.tha3Dir, '--variant', variant, '--device', renderDevice], { env, timeoutMs: 900_000, signal })
    const doc = lastJsonLine(r.stdout)
    if (r.code !== 0 || !doc?.ok) throw new Error(`动作模型试运行失败：${doc?.message || (r.stderr || r.stdout).slice(-400)}`)
    speed.tha3 = { device: doc.device, variant, fps: doc.fps, secPerFrame: doc.secPerFrame, vramMb: doc.vramPeakMb || 0, measuredAt: new Date().toISOString() }
    emit(96, `动作模型试运行成功：${doc.device === 'cuda' ? '显卡' : 'CPU '}每秒约 ${doc.fps >= 10 ? Math.round(doc.fps) : Number(doc.fps).toFixed(1)} 帧`)
  }
  if (comps.includes('stylize')) {
    emit(97, '正在试运行照片动漫化模型…')
    const r = await streamCmd(cfg.python, ['-I', cfg.scripts.stylize, '--doctor', '--models', cfg.modelsDir], { env, timeoutMs: 600_000, signal })
    const doc = lastJsonLine(r.stdout)
    if (r.code !== 0 || !doc?.ok) throw new Error(`照片动漫化模型试运行失败：${doc?.message || (r.stderr || r.stdout).slice(-400)}`)
    speed.stylize = { secs: doc.secs, measuredAt: new Date().toISOString() }
  }

  // 7. manifest
  const prev = prevCfg.manifest && resolve(prevCfg.manifest.home || '').toLowerCase() === home.toLowerCase() ? prevCfg.manifest : null
  const styleList = (Array.isArray(styles) && styles.length ? styles : DCTNET_DEFAULT_STYLES).filter((s) => DCTNET_STYLES[s])
  const manifest = {
    schema: 1,
    engine: 'anime-local',
    version: ANIME_LOCAL_VERSION,
    home,
    python: cfg.python,
    pythonSource,
    cacheDir: cfg.cacheDir,
    device: comps.includes('tha3') ? renderDevice : prev?.device || 'cpu',
    deviceNote,
    gpu: renderDevice === 'cuda' ? info.gpu || hardware.gpuName : prev?.gpu || '',
    vramGB: renderDevice === 'cuda' ? info.vramGB || null : prev?.vramGB || null,
    torch: info.torch || prev?.torch || '',
    torchCuda: info.cudaVersion || prev?.torchCuda || '',
    packages: { numpy: info.numpy, pillow: info.pillow, tensorflow: info.tensorflow || prev?.packages?.tensorflow || '', opencv: info.opencv || prev?.packages?.opencv || '', onnxruntime: info.onnxruntime || prev?.packages?.onnxruntime || '' },
    mirror: plan.mirror,
    components: {
      tha3: comps.includes('tha3') ? { installed: true, variants: variantsInstalled } : prev?.components?.tha3 || { installed: false },
      stylize: comps.includes('stylize') ? { installed: true, styles: styleList, segmenter: 'u2net_human_seg' } : prev?.components?.stylize || { installed: false },
    },
    speed,
    downloaded,
    installedAt: new Date().toISOString(),
  }
  writeJsonAtomic(cfg.manifestPath, manifest)
  writeJsonAtomic(join(home, 'anime-local-receipt.json'), manifest)
  const status = getAnimeLocalStatus({ home })
  const usage = { homeBytes: dirSizeBytes(home), cacheBytes: dirSizeBytes(cfg.cacheDir) }
  emit(100, `✅ 安装完成：${status.summary}`)
  return { ok: true, home, manifest, status, usage, hardware, logs }
}

export const THA3_ATTRIBUTION_TEXT = [
  'Talking Head(?) Anime from a Single Image 3: Now the Body Too — model weights',
  'Creator: Pramook Khungurn (https://github.com/pkhungurn/talking-head-anime-3-demo)',
  'License: Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/)',
  'Files downloaded unmodified (SHA-256 checked against the official talking-head-anime-3-models.zip).',
  '',
].join('\n')
