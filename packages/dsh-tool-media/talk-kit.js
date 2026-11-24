/**
 * @dsh-video/tool-media — talk-kit Remotion library (口播剪辑 presenter + real captions), shipped as a real TSX file
 * (`remotion-lib/talk-kit.tsx`) and copied into every Remotion project next to shotcraft / figure-kit.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TALK_KIT_TSX_PATH = fileURLToPath(new URL('./remotion-lib/talk-kit.tsx', import.meta.url))

export function writeTalkKitRemotionLib(projectDir) {
  const libDir = join(resolve(projectDir), 'src', 'lib')
  mkdirSync(libDir, { recursive: true })
  const out = join(libDir, 'talk-kit.tsx')
  if (existsSync(TALK_KIT_TSX_PATH)) copyFileSync(TALK_KIT_TSX_PATH, out)
  return out
}
