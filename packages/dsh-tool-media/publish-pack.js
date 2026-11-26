import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  buildComplianceNoticeText,
  PLATFORM_SAFE_ZONES,
  readScriptJson,
  resolveBinaries,
  runCommandRedirected,
} from '../shared/index.js'
import { recordPackCover, resolvePackCover, writePackCoverPng } from './cover-studio.js'

function sanitizeSlug(raw) {
  return String(raw || 'dsh-video')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'dsh-video'
}

/** Title / topic limits per platform (characters): what the apps show without cutting off. */
const PLATFORM_COPY = {
  douyin: { title: 30, tags: 5 },
  kuaishou: { title: 30, tags: 5 },
  xiaohongshu: { title: 20, tags: 8 },
  bilibili: { title: 80, tags: 10 },
  shipinhao: { title: 30, tags: 5 },
  universal: { title: 30, tags: 6 },
}

const cut = (s, n) => {
  const a = Array.from(String(s || '').trim())
  return a.length > n ? a.slice(0, n).join('') : a.join('')
}

/**
 * The copy of a publish pack, made only from the film's own title, topic and scene titles — no slogans, no tool
 * names, nothing the film does not say. Titles fit the platform's length; topics come from the title / topic /
 * scene titles (2–12 characters each).
 */
export function buildPublishCopy(script = {}, { platform = 'douyin', durationSec = 0 } = {}) {
  const lim = PLATFORM_COPY[platform] || PLATFORM_COPY.universal
  const title = String(script?.displayTitle || script?.title || '').trim()
  const topic = String(script?.topic || '').replace(/\s+/g, ' ').trim()
  const titleBase = title || cut(topic, 20) || '我的视频'
  const scenes = (Array.isArray(script?.scenes) ? script.scenes : []).map((s) => String(s?.title || '').trim()).filter(Boolean)
  const titles = []
  const add = (t) => {
    const v = cut(t, lim.title)
    if (v && !titles.includes(v)) titles.push(v)
  }
  add(titleBase)
  if (topic && topic !== titleBase) add(topic.split(/[。！？!?\n]/)[0])
  if (scenes.length >= 2) add(`${titleBase}：${scenes[0]}`)
  const words = [title, topic, ...scenes]
    .join(' ')
    .split(/[\s,，、/|｜:：;；。！？!?·「」『』“”"'()（）【】《》]+/)
    .map((s) => s.trim())
    .filter((s) => Array.from(s).length >= 2 && Array.from(s).length <= 12 && !/^\d+$/.test(s))
  const hashtags = [...new Set(words)].slice(0, lim.tags).map((k) => `#${k}`)
  const firstLine = String((script?.scenes || []).map((s) => s?.narration || s?.subtitle || '').find((x) => String(x).trim()) || '').trim()
  const description = cut(firstLine || topic || titleBase, 120) + (Number(durationSec) > 0 ? `（${Math.round(Number(durationSec))} 秒）` : '')
  return { titleBase, titles, hashtags, description }
}

/**
 * Generate a complete platform-ready Publishing Package (`publish/<platform>-pack/`):
 * - Final MP4 copy
 * - `cover.png`: the cover chosen in the Studio (发布包导出 → 封面: auto / a picked frame / an AI cover / with title);
 *   default = the best automatic frame of the film (no black, fade, transition or blurry frame — cover-studio.js)
 * - `snapshot-3x3.png` verification contact sheet (if present)
 * - `qa_report.json` (if present)
 * - `meta.md` with platform-ready titles, captions, hashtags, & AI legal compliance declaration
 */
export async function exportPublishPack({
  projectDir,
  platform = '',
  mp4Path = '',
}) {
  const absDir = resolve(projectDir)
  let script = {}
  try {
    script = readScriptJson(absDir).data
  } catch {}

  const targetPlatform = platform || script?.targetPlatform || 'douyin'
  const platformSpec = PLATFORM_SAFE_ZONES[targetPlatform] || PLATFORM_SAFE_ZONES.universal
  const finalMp4 = mp4Path ? resolve(absDir, mp4Path) : join(absDir, 'output', 'final.mp4')
  if (!existsSync(finalMp4)) {
    throw new Error(`找不到成品视频 ${finalMp4}，请先执行一次导出成片再生成发布包。`)
  }

  const packDir = join(absDir, 'publish', `${targetPlatform}-pack`)
  mkdirSync(packDir, { recursive: true })

  const slug = sanitizeSlug(script?.title || 'dsh-video')
  const packMp4 = join(packDir, `${slug}.mp4`)
  copyFileSync(finalMp4, packMp4)

  // Cover: the choice from 发布包导出 → 封面 (cover-studio.js; default = the best automatic frame). A custom mp4Path, or
  // a failure there, falls back to one frame at ~18 % of the film (the old behaviour).
  const coverPng = join(packDir, 'cover.png')
  const durSec = Math.max(1.5, Number(script?.totalDurationSec) || 6)
  let cover = null
  if (resolve(finalMp4) === resolve(join(absDir, 'output', 'final.mp4'))) {
    try {
      const chosen = await resolvePackCover(absDir)
      await writePackCoverPng(chosen.abs, coverPng)
      cover = {
        mode: chosen.mode,
        source: chosen.rel,
        timeSec: Number.isFinite(chosen.timeSec) ? chosen.timeSec : null,
        aspect: chosen.aspect || '',
        refreshed: Boolean(chosen.refreshed),
        fallbackFrom: chosen.fallbackFrom || '',
      }
      try {
        recordPackCover(absDir, targetPlatform, { ...chosen, packFile: coverPng })
      } catch {}
    } catch (err) {
      cover = { mode: 'legacy', error: String(err?.message || err).slice(0, 300) }
    }
  }
  if (!cover || cover.mode === 'legacy') {
    const coverAt = Math.min(durSec * 0.4, Math.max(0.6, durSec * 0.18))
    const { ffmpeg } = resolveBinaries()
    await runCommandRedirected(
      ffmpeg,
      ['-y', '-ss', coverAt.toFixed(2), '-i', finalMp4, '-frames:v', '1', '-q:v', '2', coverPng],
      { timeoutMs: 20_000 },
    ).catch(() => {})
    cover = { ...(cover || {}), mode: 'legacy', timeSec: Number(coverAt.toFixed(2)) }
  }
  const secText = (t) => (Number.isFinite(t) ? `（第 ${t.toFixed(2)} 秒）` : '')
  const coverWhat =
    cover.mode === 'frame'
      ? `选用的视频画面${secText(cover.timeSec)}`
      : cover.mode === 'ai'
        ? `AI 生成封面${cover.aspect ? `（${cover.aspect}）` : ''}`
        : cover.mode === 'title'
          ? '加了标题的封面'
          : cover.mode === 'auto'
            ? `自动挑选的最佳画面${secText(cover.timeSec)}`
            : '高清建议封面图'

  const snapSrc = existsSync(join(absDir, 'output', 'snapshot-3x3.png'))
    ? join(absDir, 'output', 'snapshot-3x3.png')
    : join(absDir, 'snapshot-3x3.png')
  let packSnap = ''
  if (existsSync(snapSrc)) {
    packSnap = join(packDir, 'snapshot-3x3.png')
    copyFileSync(snapSrc, packSnap)
  }

  const qaSrc = join(absDir, 'output', 'qa_report.json')
  let qaData = null
  if (existsSync(qaSrc)) {
    try {
      qaData = JSON.parse(readFileSync(qaSrc, 'utf8'))
      copyFileSync(qaSrc, join(packDir, 'qa_report.json'))
    } catch {}
  }

  const notice = buildComplianceNoticeText(script)
  const copy = buildPublishCopy(script, { platform: targetPlatform, durationSec: durSec })
  const titleBase = copy.titleBase
  const hashtags = copy.hashtags

  const summaryLines = (script?.scenes || [])
    .map((s, idx) => ({ idx, title: String(s.title || '').trim(), text: String(s.narration || s.subtitle || '').trim() }))
    .filter((s) => s.title || s.text)
    .map((s) => `${s.idx + 1}. ${s.title ? `**${s.title}**` : `第 ${s.idx + 1} 段`}${s.text ? ` — ${Array.from(s.text).slice(0, 60).join('')}` : ''}`)
    .join('\n')
  // what the picture actually carries (the AI badge and the end line are switches of the project)
  const badgeOn = script?.aiBadgeEnabled !== undefined ? Boolean(script.aiBadgeEnabled) : script?.aiBadge !== false
  const markLine = [badgeOn ? `画面角标「${notice.badgeText}」` : '', notice.endNoticeVisible ? '片尾声明' : ''].filter(Boolean)

  const metaMd = [
    `# ${titleBase} · ${platformSpec.label} 发布包`,
    ``,
    `> 生成时间：${new Date().toISOString()}  |  目标平台：**${platformSpec.label}**  |  画面规格：**${script?.width || 1920}×${script?.height || 1080} (${script?.aspectRatio || '16:9'}) @ ${script?.fps || 30}fps**`,
    ``,
    `## 1. 发布标题（可选其一，发布前请按你的实际内容修改）`,
    ...copy.titles.map((t) => `- ${t}`),
    ``,
    `## 2. 发布正文与话题标签`,
    copy.description,
    ``,
    summaryLines ? `**分段看点：**\n${summaryLines}\n` : '',
    hashtags.length ? `**话题标签（可直接复制）：**` : '',
    hashtags.length ? `${hashtags.join(' ')}` : '',
    ``,
    `## 3. 内容说明（平台审核时可能用到）`,
    `- **AI 内容说明**：${notice.endNoticeAiBody}。发布时请按平台要求勾选「含 AI 生成内容」类标识。`,
    `- **画面标识**：${markLine.length ? `已带${markLine.join('和')}` : '画面里没有 AI 角标和片尾声明（可在「画面规格」里打开）'}`,
    `- **字体授权**：画面文字使用随插件提供的 **SIL Open Font License 1.1** 开源字体（Noto Sans SC / Source Han Serif SC），可用于商业发布`,
    qaData?.loudness?.integratedLufs != null
      ? `- **音频响度与质检**：${qaData.loudness.integratedLufs} LUFS · 峰值 ${qaData.loudness.truePeakDbtp} dBTP · 安全区预检 ${qaData.safeZonePreflight?.passed ? '通过' : '已标记建议'}`
      : '',
    ``,
    `## 4. 包含文件清单`,
    `- \`${slug}.mp4\` (${(statSync(packMp4).size / 1048576).toFixed(2)} MB)`,
    existsSync(coverPng) ? `- \`cover.png\` (${coverWhat})` : '',
    packSnap ? `- \`snapshot-3x3.png\` (3×3 分镜抽帧验收墙)` : '',
    existsSync(qaSrc) ? `- \`qa_report.json\` (成片自动化质检报告)` : '',
    ``,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const metaPath = join(packDir, 'meta.md')
  writeFileSync(metaPath, metaMd + '\n', 'utf8')

  return {
    ok: true,
    platform: targetPlatform,
    platformLabel: platformSpec.label,
    packDir,
    files: {
      mp4Path: packMp4,
      coverPath: existsSync(coverPng) ? coverPng : '',
      snapshotPath: packSnap,
      metaPath,
    },
    suggestedTitles: copy.titles,
    hashtags,
    cover: existsSync(coverPng) ? cover : null,
    complianceNotice: notice.endNoticeBody,
    metaMarkdown: metaMd,
  }
}
