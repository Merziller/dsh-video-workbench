#!/usr/bin/env node
/**
 * 品牌与双重版权署名 — the product short name 「禾杨视频工坊」 and the dual copyright (studio + original author) come from
 * one place (packages/shared/brand.js) and every copy that cannot import it says the same thing; identifiers never
 * changed. No network, no LLM, scratch data only:
 *   - the constants (6-character short name, studio, author contacts, copyright line, origin statement)
 *   - backward compatibility: package name, repository, bin files, MCP server name + the 49 MCP tool names, API route
 *     prefix, DSH_* environment variables, the server's AUTHOR_INFO keys, project titles stay the user's own
 *   - UI: DSH sidebar / main view label (lib/client.js), the three skins (window title + top-bar product name, generated
 *     files and their sources), the standalone shell, the panel kit (PK.BRAND, help footer + 关于, settings, brand kit)
 *   - LICENSE (MIT + dual copyright), NOTICE (dual attribution + origin, third-party notices kept), README, AGENTS.md,
 *     SKILL.md, plugin manifests, the market entry template; the optional end-notice credit names the product
 *
 *   node scripts/tests/brand.test.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'brand-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
if (!process.env.DSH_ASR_AUTO_INSTALL) process.env.DSH_ASR_AUTO_INSTALL = '0'

const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const read = (rel) => readFileSync(join(ROOT, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n')
const PKG = JSON.parse(read('package.json'))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? `  — ${String(detail).slice(0, 300)}` : ''}`)
}
const section = async (title, fn) => {
  console.log(`\n# ${title}`)
  try {
    await fn()
  } catch (err) {
    check(`${title} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}
const count = (hay, needle) => hay.split(needle).length - 1

const { BRAND, brandForClient, brandContactLine, brandFooterLine } = await imp('packages/shared/brand.js')
const NAME = '禾杨视频工坊'
const STUDIO = '绍兴市柯桥区禾杨智绘软件开发工作室'
const COPYRIGHT = 'Copyright (c) 2026 绍兴市柯桥区禾杨智绘软件开发工作室 & Merziller (子墨)'
const AUTHOR = ['Merziller', '1411574209', 'k26789228@gmail.com']
const OLD_NAMES = ['AI 视频工坊', 'DSH 视频工坊', 'DSH AI 视频工坊', '电影视频工坊']

await section('constants (packages/shared/brand.js)', async () => {
  check('short product name is 禾杨视频工坊, exactly 6 characters', BRAND.productName === NAME && Array.from(BRAND.productName).length === 6)
  check('studio: 禾杨智绘 · 绍兴市柯桥区禾杨智绘软件开发工作室 · 禾杨智绘出品', BRAND.studioName === '禾杨智绘' && BRAND.studioFullName === STUDIO && BRAND.producedBy === '禾杨智绘出品')
  check('original author and contacts kept (Merziller / 子墨 / QQ / 微信 / Gmail)', BRAND.author === 'Merziller' && BRAND.authorZh === '子墨' && BRAND.qq === '1411574209' && BRAND.wechat === 'Merziller' && BRAND.email === 'k26789228@gmail.com')
  check('dual copyright line', BRAND.copyright === COPYRIGHT)
  check('origin statement (studio + author, MIT dual credit, commercial bundles by the studio)', BRAND.origin === '本项目由 Merziller 与旗下绍兴市柯桥区禾杨智绘软件开发工作室原创研发，开源版遵循 MIT 协议保留双署名，商业免配整合包与企业定制由工作室官方提供。')
  check('licence MIT, repository unchanged', BRAND.license === 'MIT' && BRAND.repoUrl === 'https://github.com/Merziller/dsh-video-workbench' && BRAND.packageName === 'dsh-video-workbench')
  check('constants are frozen', Object.isFrozen(BRAND))
  const client = brandForClient()
  check('client copy carries the contact and footer lines', client.contactLine === brandContactLine() && client.footerLine === `${NAME} · 禾杨智绘出品` && brandFooterLine() === client.footerLine && JSON.parse(JSON.stringify(client)).productName === NAME)
  const shared = await imp('packages/shared/index.js')
  check('packages/shared re-exports BRAND; the end-notice credit names the product', shared.BRAND === BRAND && shared.END_NOTICE_CREDIT_NAME === NAME)
  const both = shared.buildComplianceNoticeText({ endNotice: true, endNoticeCredit: true })
  check('credited end line: 「本视频由禾杨视频工坊创作：…」 (off by default)', both.endNoticeBody.startsWith(`本视频由${NAME}创作：`) && shared.buildComplianceNoticeText({}).endNoticeVisible === false)
})

await section('backward compatibility (identifiers unchanged)', async () => {
  const pkg = JSON.parse(read('package.json'))
  check('package name dsh-video-workbench', pkg.name === 'dsh-video-workbench')
  check('repository URL unchanged', /github\.com\/Merziller\/dsh-video-workbench/.test(JSON.stringify(pkg.repository)) && pkg.homepage === 'https://github.com/Merziller/dsh-video-workbench#readme')
  check('bin files unchanged', pkg.bin && pkg.bin['dsh-video-workbench'] === './bin/dsh-video-cli.mjs' && pkg.bin['dsh-video-mcp'] === './bin/dsh-video-mcp.mjs' && existsSync(join(ROOT, 'bin', 'dsh-video-cli.mjs')) && existsSync(join(ROOT, 'bin', 'dsh-video-mcp.mjs')))
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'))
  check('plugin manifest name unchanged, description shows the short name', plugin.name === 'dsh-video-workbench' && plugin.description.startsWith(NAME) && plugin.author?.name === 'Merziller')
  const mcpSrc = read('bin/dsh-video-mcp.mjs')
  check('MCP server name unchanged; title shows the short name and the author', mcpSrc.includes("name: 'dsh-video-workbench',") && mcpSrc.includes('title: `${BRAND.productName} · ${BRAND.productNameEn} Universal MCP Server (${BRAND.producedBy} · by ${BRAND.author})`'))
  const { createUniversalToolRegistry } = await imp('bin/dsh-video-mcp.mjs')
  const reg = await createUniversalToolRegistry()
  const map = reg.toolsMap || reg.tools || reg
  const names = [...(map.keys ? map.keys() : Object.keys(map))].sort()
  const EXPECTED = ['ai_create_video', 'ai_master_voice', 'ai_refine_scene', 'analyze_reference_video', 'apply_color_lut', 'check_hardware_profile', 'configure_cloud_media', 'configure_llm_model', 'configure_tts_engine', 'curate_and_edit_assets', 'export_project_package', 'export_publish_pack', 'generate_avatar', 'generate_cloud_media', 'generate_sfx_bgm', 'generate_speech', 'get_llm_config', 'host_llm_task', 'import_assets', 'import_stock_media', 'import_vendor_motion', 'import_voice_pack', 'index_footage', 'install_tts_engine', 'list_assets', 'list_voices', 'make_highlight_reel', 'make_short_clips', 'manage_anime_presenter', 'manage_brand_kit', 'manage_characters', 'manage_cloud_jobs', 'manage_project_history', 'manage_scene_edits', 'manage_template_plaza', 'match_scene_voices', 'open_video_studio', 'plan_video_from_assets', 'produce_video', 'render_video_scopes', 'rough_cut_talking_head', 'run_agent_pipeline', 'search_stock_media', 'speech_engine', 'transcribe_media', 'video_lint', 'video_qa', 'video_render', 'video_snapshot']
  check('the 49 MCP tool names are exactly the v0.8.0 names', JSON.stringify(names) === JSON.stringify(EXPECTED), names.filter((n) => !EXPECTED.includes(n)).concat(EXPECTED.filter((n) => !names.includes(n))).join(', '))
  const web = await imp('packages/dsh-web-video-workbench/lib/index.js')
  const res = await web.handleWorkbenchApiRequest(new Request('http://127.0.0.1/api/video-workbench/no-such-route'))
  check('API routes still live under /api/video-workbench/', res.status === 404 && /Route not found: \/api\/video-workbench\/no-such-route/.test(await res.text()))
  const a = web.AUTHOR_INFO
  check('AUTHOR_INFO keeps its original keys and values (old clients) and adds the studio', a.name === 'Merziller' && a.qq === '1411574209' && a.wechat === 'Merziller' && a.email === 'k26789228@gmail.com' && a.github === 'https://github.com/Merziller/dsh-video-workbench' && a.license === 'MIT' && a.studioFullName === STUDIO && a.copyright === COPYRIGHT && a.notice.startsWith(COPYRIGHT))
  const shared = await imp('packages/shared/index.js')
  check('DSH_* environment variables still drive the plugin (DSH_VIDEO_HOME / DSH_VIDEO_WORKSPACE)', resolve(process.env.DSH_VIDEO_HOME) === dirs.home && typeof shared.resolveEnvPath === 'function' && read('packages/shared/index.js').includes('DSH_VIDEO_HOME'))
  // project titles stay the user's own: no product name is ever put into them
  const { scaffoldVideoProject } = await imp('packages/dsh-preset-video/index.js')
  const proj = join(dirs.ws, 'title-proj')
  scaffoldVideoProject(proj, { title: '秋日咖啡馆新品宣传', engine: 'html' })
  const saved = JSON.parse(readFileSync(join(proj, 'script.json'), 'utf8'))
  check('a new project keeps exactly the title the user gave (no brand injected)', saved.title === '秋日咖啡馆新品宣传' && !JSON.stringify(saved).includes(NAME))
  check('the title guards of earlier versions are still exported (deriveDisplayTitle / isMetaInstructionText)', typeof shared.deriveDisplayTitle === 'function' && typeof shared.isMetaInstructionText === 'function')
})

await section('UI: DSH sidebar, skins, standalone shell, panel kit', async () => {
  const client = read('packages/dsh-web-video-workbench/lib/client.js')
  check('host client: BRAND_NAME equals brand.js', client.includes(`const BRAND_NAME = '${NAME}'`))
  check('DSH sidebar entry + main view + fallback registration use BRAND_NAME (ids unchanged)', count(client, 'label: BRAND_NAME') === 3 && client.includes("{ name: 'sidebar.panellist', id: 'video-workbench', label: BRAND_NAME, order: 65 }") && client.includes("{ name: 'main', key: 'video-workbench', label: BRAND_NAME }"))
  check('host client: no old product names left', OLD_NAMES.every((n) => !client.includes(n)), OLD_NAMES.filter((n) => client.includes(n)).join(', '))
  const skins = {
    'prism-lab': { gen: 'packages/dsh-web-video-workbench/lib/warroom/prism-lab.html', src: ['design-prototypes/prism-lab/port/src/0-head.html', 'design-prototypes/prism-lab/port/src/2-body.html'], bar: `<div class="brand-cn">${NAME}</div>` },
    'nova-deck': { gen: 'packages/dsh-web-video-workbench/lib/warroom/nova-deck.html', src: ['design-prototypes/nova-deck/src/head.html', 'design-prototypes/nova-deck/src/body.html'], bar: `<div class="tb-bt"><b>${NAME}</b><span>VIDEO WORKBENCH</span></div>` },
    'ink-loom': { gen: 'packages/dsh-web-video-workbench/lib/warroom/ink-loom.html', src: ['design-prototypes/ink-loom/_port/42-brand.txt'], bar: `<b>${NAME}</b><i>INK LOOM · 墨韵织机</i>` },
  }
  for (const [id, s] of Object.entries(skins)) {
    const html = read(s.gen)
    check(`${id}: <title> is the short name`, (html.match(/<title>([^<]*)<\/title>/) || [])[1] === NAME)
    check(`${id}: top bar shows the short name`, html.includes(s.bar))
    check(`${id}: no old product names`, OLD_NAMES.every((n) => !html.includes(n)), OLD_NAMES.filter((n) => html.includes(n)).join(', '))
    const src = s.src.map(read).join('\n')
    check(`${id}: the skin source carries the same name (a rebuild keeps it)`, src.includes(`<title>${NAME}</title>`) && src.includes(NAME))
  }
  check('ink-loom: the current-app chip shows the short name', read(skins['ink-loom'].gen).includes(`<span class="hc-t">${NAME}</span>`))
  const { standaloneShellHtml } = await imp('scripts/dsh-runner.mjs')
  const shell = standaloneShellHtml('video')
  check('standalone studio page: window title + loading text', (shell.match(/<title>([^<]*)<\/title>/) || [])[1] === NAME && shell.includes(`正在加载${NAME}`) && !OLD_NAMES.some((n) => shell.includes(n)))
  // the panel kit: PK.BRAND generated from brand.js, used by the help footer / 关于 / settings / brand kit
  const kit = read('packages/dsh-web-video-workbench/lib/warroom/kit.js')
  const m = kit.match(/window\.PK\.BRAND = Object\.freeze\((\{[^\n]*\})\)/)
  check('kit.js embeds PK.BRAND exactly as brand.js (kit/build.mjs)', m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(brandForClient()))
  const sandbox = { window: {}, console }
  sandbox.window.PK = { __v: 1 }
  vm.runInNewContext(`try {\n  if (window.PK && !window.PK.BRAND) window.PK.BRAND = Object.freeze(${m ? m[1] : '{}'})\n} catch (err) {}`, sandbox)
  check('PK.BRAND evaluates in the page (frozen, short name)', sandbox.window.PK.BRAND?.productName === NAME && Object.isFrozen(sandbox.window.PK.BRAND))
  const help = read('packages/dsh-web-video-workbench/lib/warroom/kit/src/50-panels-base.js')
  check('help panel footer: 「禾杨视频工坊 · 禾杨智绘出品」; 关于 section with the dual copyright', help.includes('ui.hint(B.footerLine)') && help.includes("['版权', B.copyright]") && help.includes("['出品', `${B.studioName} · ${B.studioFullName}`]"))
  const settings = read('packages/dsh-web-video-workbench/lib/warroom/kit/src/70-settings.js')
  check('settings 关于: studio + original author + copyright', settings.includes('出品：') && settings.includes('原创作者：') && settings.includes('a.copyright || B.copyright'))
  const brandKit = read('packages/dsh-web-video-workbench/lib/warroom/kit/src/81-project-tools.js')
  check('brand kit 署名: studio row and copyright row', brandKit.includes("['出品', `${a.studio || ''} · ${a.studioFullName}`]") && brandKit.includes("['版权', a.copyright]"))
  const kitSrc = ['60-studio-assets.js', '80-ops.js'].map((f) => read(`packages/dsh-web-video-workbench/lib/warroom/kit/src/${f}`)).join('\n')
  check('kit texts: no old product names, the credit hint uses PK.BRAND', OLD_NAMES.every((n) => !kitSrc.includes(n)) && kitSrc.includes('本视频由${(PK.BRAND && PK.BRAND.productName)'))
})

await section('LICENSE · NOTICE · README · agent docs · market entry', async () => {
  const lic = read('LICENSE')
  check('LICENSE: MIT with the dual copyright line', lic.startsWith('MIT License\n') && lic.includes(`\n${COPYRIGHT}\n`) && lic.includes('Copyright (c) 2026 绍兴市柯桥区禾杨智绘软件开发工作室 & Merziller'))
  check('LICENSE: MIT grant and warranty text intact, contacts kept', lic.includes('Permission is hereby granted, free of charge, to any person obtaining a copy') && lic.includes('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND') && AUTHOR.every((t) => lic.includes(t)) && lic.includes(STUDIO))
  const notice = read('NOTICE')
  check('NOTICE: dual copyright, studio, contacts and the origin statement', notice.includes(COPYRIGHT) && notice.includes(`禾杨智绘 · ${STUDIO}`) && notice.includes(BRAND.origin) && AUTHOR.every((t) => notice.includes(t)))
  check('NOTICE: third-party notices kept (AutoClip MIT, OFL fonts)', notice.includes('Third-party notices') && notice.includes('AutoClip') && /OFL|Open Font License/.test(notice))
  const readme = read('README.md')
  check('README: title shows the short name, package name unchanged', readme.split('\n')[0] === `# 🎬 ${NAME} · DSH Video Workbench (\`dsh-video-workbench\` · v${PKG.version})`)
  check('README: copyright section has the dual copyright, the studio, the origin statement and the commercial note', readme.includes(`\`${COPYRIGHT}\``) && readme.includes(`**出品工作室 / Studio**：**禾杨智绘**（${STUDIO}）`) && readme.includes(BRAND.origin) && readme.includes('商业免配整合包与企业定制'))
  check('README: author badges and contacts kept, anchors unchanged', AUTHOR.every((t) => readme.includes(t)) && readme.includes('## 📬 联系作者与原创版权声明 (Author & Copyright)') && count(readme, '(#-联系作者与原创版权声明-author--copyright)') >= 5)
  check('README: English contact block carries the copyright and the studio', readme.includes(`- **Copyright**: \`${COPYRIGHT}\``) && readme.includes(`- **Studio**: **禾杨智绘** (${STUDIO})`))
  const agents = read('AGENTS.md')
  const skill = read('SKILL.md')
  check('AGENTS.md / SKILL.md: short name + dual copyright in the header; identifiers rule', agents.includes(COPYRIGHT) && skill.includes(COPYRIGHT) && agents.split('\n')[0].includes(NAME) && /\n# .*禾杨视频工坊/.test(skill) && agents.includes('Never rename identifiers'))
  check('SKILL.md frontmatter name unchanged', /^---\nname: dsh-video-workbench\n/.test(skill))
  const entry = read('docs/awesome-dsh-plugin-entry.yml')
  check(`market entry template: v${PKG.version} tarball, 49 tools, short name and dual copyright`, entry.includes(`releases/download/v${PKG.version}/dsh-video-workbench-${PKG.version}.tgz`) && entry.includes('49 MCP') && entry.includes(NAME) && entry.includes(COPYRIGHT) && entry.includes('name: Merziller/dsh-video-workbench'))
  for (const f of ['LICENSE', 'NOTICE', 'package.json', 'README.md', 'index.js', 'bin/dsh-video-mcp.mjs', 'packages/dsh-web-video-workbench/lib/client.js', '.claude-plugin/plugin.json']) {
    const t = read(f)
    check(`attribution kept in ${f} (Merziller · QQ · Gmail)`, AUTHOR.every((x) => t.includes(x)))
  }
})

const failed = results.filter((r) => !r.ok).length
try {
  rmSync(SCR, { recursive: true, force: true })
} catch {}
console.log(`\nbrand: ${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
