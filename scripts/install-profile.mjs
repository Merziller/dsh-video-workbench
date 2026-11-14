import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadEnv, REPO_ROOT, resolveEnvPath } from '../packages/shared/index.js'

export function ensureWorkspaceLinks() {
  const scopeDir = join(REPO_ROOT, 'node_modules', '@dsh-video')
  mkdirSync(scopeDir, { recursive: true })
  const pkgMap = {
    shared: 'packages/shared',
    'tool-local-tts': 'packages/dsh-tool-local-tts',
    'tool-video-suite': 'packages/dsh-tool-video-suite',
    'tool-media': 'packages/dsh-tool-media',
    'preset-video': 'packages/dsh-preset-video',
    'web-video-workbench': 'packages/dsh-web-video-workbench',
    'video-app': 'packages/dsh-video-app',
  }
  for (const [name, relTarget] of Object.entries(pkgMap)) {
    const linkPath = join(scopeDir, name)
    const targetPath = join(REPO_ROOT, relTarget)
    if (!existsSync(linkPath) && existsSync(targetPath)) {
      try {
        symlinkSync(targetPath, linkPath, 'junction')
      } catch {}
    }
  }
}

/**
 * Set up the `video` profile (and optionally link into `desktop` profile)
 * for DeepSeek Harness without hardcoding any machine-specific paths.
 */
export function setupDshVideoProfile() {
  ensureWorkspaceLinks()
  loadEnv()
  const dshHome = resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home')
  const videoProfileDir = join(dshHome, 'profiles', 'video')
  mkdirSync(videoProfileDir, { recursive: true })

  const pluginPaths = [
    join(REPO_ROOT, 'packages', 'dsh-tool-local-tts', 'index.js').replace(/\\/g, '/'),
    join(REPO_ROOT, 'packages', 'dsh-tool-video-suite', 'index.js').replace(/\\/g, '/'),
    join(REPO_ROOT, 'packages', 'dsh-tool-media', 'index.js').replace(/\\/g, '/'),
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

  // Also attempt non-destructive registration into user's desktop profile if accessible
  let desktopMounted = false
  let desktopPatchPath = ''
  try {
    const userDesktopProfile = join(homedir(), '.dsh', 'profiles', 'desktop')
    desktopPatchPath = join(userDesktopProfile, 'cordis.patch.yml')
    if (existsSync(desktopPatchPath)) {
      const currentLines = readFileSync(desktopPatchPath, 'utf8')
        .split(/\r?\n/)
        .filter(
          (line) =>
            !line.includes('dsh-tool-local-tts') &&
            !line.includes('dsh-tool-video-suite') &&
            !line.includes('dsh-tool-media') &&
            !line.includes('dsh-preset-video') &&
            !line.includes('dsh-web-video-workbench'),
        )
      const additions = pluginPaths.map((p) => `  - path: "${p}"`)
      const updated = [...currentLines.filter((l, i, arr) => i < arr.length - 1 || l.trim() !== ''), ...additions, ''].join('\n')
      writeFileSync(desktopPatchPath, updated, 'utf8')
      desktopMounted = true
    }
  } catch {
    // Ignore if user desktop profile is locked
  }

  return {
    dshHome: resolve(dshHome),
    videoProfileDir,
    profilePatchPath,
    desktopMounted,
    desktopPatchPath,
    pluginPaths,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(join(REPO_ROOT, 'scripts', 'install-profile.mjs'))) {
  const res = setupDshVideoProfile()
  console.log('[setup:profile] Configured DSH `video` profile:', JSON.stringify(res, null, 2))
}
