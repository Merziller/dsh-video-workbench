/**
 * 品牌与版权署名 · Brand & copyright — the single source of truth for every product name and credit the plugin shows.
 *
 * Only display texts live here. Identifiers never change (backward compatibility): the npm package name
 * `dsh-video-workbench`, the repository URL, `bin/dsh-video-cli.mjs` / `bin/dsh-video-mcp.mjs`, MCP tool names,
 * `/api/video-workbench/*` routes, `DSH_*` environment variables and the titles of the user's projects.
 *
 * Node code imports BRAND from here; the panel kit gets it injected at build time (`PK.BRAND`, kit/build.mjs).
 * Copies that cannot import it — the browser host `lib/client.js`, the three skin HTML files (and their sources in
 * design-prototypes/), LICENSE, NOTICE, README — are checked against it by scripts/tests/brand.test.mjs.
 */
export const BRAND = Object.freeze({
  /** 中文产品短名（6 个字）：侧边栏、顶栏、窗口标题统一用它 */
  productName: '禾杨视频工坊',
  /** English product name (unchanged) */
  productNameEn: 'DSH Video Workbench',
  /** npm package / plugin id — never changes */
  packageName: 'dsh-video-workbench',
  /** 出品工作室 */
  studioName: '禾杨智绘',
  studioFullName: '绍兴市柯桥区禾杨智绘软件开发工作室',
  producedBy: '禾杨智绘出品',
  /** 原创作者 */
  author: 'Merziller',
  authorZh: '子墨',
  authorDisplay: 'Merziller (子墨)',
  qq: '1411574209',
  wechat: 'Merziller',
  email: 'k26789228@gmail.com',
  repoUrl: 'https://github.com/Merziller/dsh-video-workbench',
  license: 'MIT',
  copyrightYear: 2026,
  /** 双重版权署名（LICENSE / NOTICE / README 与界面「关于」一致） */
  copyright: 'Copyright (c) 2026 绍兴市柯桥区禾杨智绘软件开发工作室 & Merziller (子墨)',
  copyrightShort: '© 2026 禾杨智绘 & Merziller',
  /** 版权说明（NOTICE / README 版权节） */
  origin: '本项目由 Merziller 与旗下绍兴市柯桥区禾杨智绘软件开发工作室原创研发，开源版遵循 MIT 协议保留双署名，商业免配整合包与企业定制由工作室官方提供。',
  originEn:
    'Originally created by Merziller (子墨) and the studio founded by Merziller, 绍兴市柯桥区禾杨智绘软件开发工作室 (禾杨智绘). The open-source edition is released under the MIT License with both credits retained; ready-to-run commercial bundles and enterprise customization are provided officially by the studio.',
})

/** 「QQ：… · 微信：… · Gmail：…」 */
export function brandContactLine(brand = BRAND) {
  return `QQ：${brand.qq} · 微信：${brand.wechat} · Gmail：${brand.email}`
}

/** One line for footers: 「禾杨视频工坊 · 禾杨智绘出品」 */
export function brandFooterLine(brand = BRAND) {
  return `${brand.productName} · ${brand.producedBy}`
}

/** The plain-JSON copy the panel kit embeds as `PK.BRAND` (kit/build.mjs). */
export function brandForClient(brand = BRAND) {
  return { ...brand, contactLine: brandContactLine(brand), footerLine: brandFooterLine(brand) }
}
