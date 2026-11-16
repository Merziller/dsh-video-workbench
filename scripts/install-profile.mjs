import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadEnv, REPO_ROOT, resolveEnvPath } from '../packages/shared/index.js'

const WORKSPACE_PKG_MAP = {
  shared: 'packages/shared',
  'tool-local-tts': 'packages/dsh-tool-local-tts',
  'tool-avatar': 'packages/dsh-tool-avatar',
  'tool-video-suite': 'packages/dsh-tool-video-suite',
  'tool-media': 'packages/dsh-tool-media',
  'preset-video': 'packages/dsh-preset-video',
  'web-video-workbench': 'packages/dsh-web-video-workbench',
  'video-app': 'packages/dsh-video-app',
}

function linkScopePackages(scopeRoot) {
  const scopeDir = join(scopeRoot, '@dsh-video')
  mkdirSync(scopeDir, { recursive: true })
  for (const [name, relTarget] of Object.entries(WORKSPACE_PKG_MAP)) {
    const linkPath = join(scopeDir, name)
    const targetPath = join(REPO_ROOT, relTarget)
    if (!existsSync(targetPath)) continue
    try {
      const st = lstatSync(linkPath)
      if (st.isSymbolicLink()) continue
      rmSync(linkPath, { recursive: true, force: true })
    } catch {}
    try {
      symlinkSync(targetPath, linkPath, 'junction')
    } catch {}
  }
}

export function ensureWorkspaceLinks() {
  linkScopePackages(join(REPO_ROOT, 'node_modules'))
}

/**
 * Set up the `video` profile (and link `@dsh-video/web-video-workbench` bundle into `desktop` profile)
 * for DeepSeek Harness without hardcoding any machine-specific paths.
 */
export function setupDshVideoProfile() {
  ensureWorkspaceLinks()
  loadEnv()
  const dshHome = resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home')
  const videoProfileDir = join(dshHome, 'profiles', 'video')
  mkdirSync(videoProfileDir, { recursive: true })

  // Note: `@dsh-video/preset-video` loads tool-local-tts, tool-avatar, tool-video-suite & tool-media automatically
  const pluginPaths = [
    join(REPO_ROOT, 'packages', 'dsh-preset-video', 'index.js').replace(/\\/g, '/'),
    join(REPO_ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'index.js').replace(/\\/g, '/'),
  ]

  const patchYml = [
    'plugins:',
    "  - path: '@deepseek-ai/dsh-web-app'",
    ...pluginPaths.map((p) => `  - path: '${p}'`),
    '',
  ].join('\n')

  const profilePatchPath = join(videoProfileDir, 'cordis.patch.yml')
  writeFileSync(profilePatchPath, patchYml, 'utf8')

  const profilePkgPath = join(videoProfileDir, 'package.json')
  if (!existsSync(profilePkgPath)) {
    writeFileSync(
      profilePkgPath,
      JSON.stringify(
        {
          name: 'dsh-profile-video',
          private: true,
          type: 'module',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }

  // Register `@dsh-video/web-video-workbench` as a real DSH 0.2.x client+bundle plugin in `desktop` profile
  let desktopMounted = false
  let desktopPatchPath = ''
  let desktopPkgPath = ''
  try {
    const userDesktopProfile = join(homedir(), '.dsh', 'profiles', 'desktop')
    desktopPatchPath = join(userDesktopProfile, 'cordis.patch.yml')
    desktopPkgPath = join(userDesktopProfile, 'package.json')

    if (existsSync(userDesktopProfile) && existsSync(desktopPkgPath)) {
      // 1. Link all `@dsh-video/*` workspace packages into `desktop/node_modules/@dsh-video/*`
      linkScopePackages(join(userDesktopProfile, 'node_modules'))

      // 2. Register `@dsh-video/web-video-workbench` in `desktop/package.json` (`dsh.profile.bundles` + `dependencies`)
      const pkgRaw = readFileSync(desktopPkgPath, 'utf8')
      const pkg = JSON.parse(pkgRaw)
      pkg.dsh = pkg.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : {}
      pkg.dsh.profile = pkg.dsh.profile && typeof pkg.dsh.profile === 'object' ? pkg.dsh.profile : {}
      const bundles = Array.isArray(pkg.dsh.profile.bundles) ? [...pkg.dsh.profile.bundles] : []
      if (!bundles.includes('@dsh-video/web-video-workbench')) {
        bundles.push('@dsh-video/web-video-workbench')
      }
      pkg.dsh.profile.bundles = bundles
      pkg.dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
      pkg.dependencies['@dsh-video/web-video-workbench'] =
        `link:${join(REPO_ROOT, 'packages', 'dsh-web-video-workbench').replace(/\\/g, '/')}`

      copyFileSync(desktopPkgPath, `${desktopPkgPath}.bak-video-workbench`)
      writeFileSync(desktopPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

      // 3. Clean out any legacy raw `- path:` lines inside `cordis.patch.yml` so plugins aren't registered twice,
      //    while strictly preserving any unrelated user config entries (such as `ui-settings-general`, `agent-default-model`).
      if (existsSync(desktopPatchPath)) {
        const lines = readFileSync(desktopPatchPath, 'utf8').split(/\r?\n/)
        const cleaned = []
        let skipEmptyInsert = false
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (/^#\s*(?:>>>|<<<)\s*dsh-video-workbench\b/.test(line.trim())) continue
          if (
            /^\s*-\s+path:/.test(line) &&
            /dsh-tool-local-tts|dsh-tool-avatar|dsh-tool-video-suite|dsh-tool-media|dsh-preset-video|dsh-web-video-workbench/.test(line)
          ) {
            continue
          }
          if (line.trim() === '- insert:') {
            const nextLine = lines[i + 1] || ''
            if (
              /^\s*-\s+path:/.test(nextLine) &&
              /dsh-tool-local-tts|dsh-tool-avatar|dsh-tool-video-suite|dsh-tool-media|dsh-preset-video|dsh-web-video-workbench/.test(nextLine)
            ) {
              skipEmptyInsert = true
              continue
            }
          }
          if (skipEmptyInsert && /^\s*-\s+path:/.test(line)) continue
          skipEmptyInsert = false
          cleaned.push(line)
        }
        const nextYml = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
        copyFileSync(desktopPatchPath, `${desktopPatchPath}.bak-video-workbench`)
        writeFileSync(desktopPatchPath, nextYml, 'utf8')
      }
      desktopMounted = true
    }
  } catch {
    // Ignore if user desktop profile is absent/read-only
  }

  return {
    dshHome: resolve(dshHome),
    videoProfileDir,
    profilePatchPath,
    desktopMounted,
    desktopPatchPath,
    desktopPkgPath,
    pluginPaths,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(join(REPO_ROOT, 'scripts', 'install-profile.mjs'))) {
  const res = setupDshVideoProfile()
  console.log('[setup:profile] Configured DSH `video` profile:', JSON.stringify(res, null, 2))
}
