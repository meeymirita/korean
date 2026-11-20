// Сборка 우리말.app (arm64) в desktop/dist/ только для своего Mac: подпись «ad-hoc», без платной учётки Apple, без публикации (docs/mac-app.md).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'

const here = dirname(fileURLToPath(import.meta.url))
const tmp = join(here, 'build-tmp')
const icns = join(here, 'icon.icns')

/** Значок ✳ из frontend/public/icon-512.png в .icns (sips и iconutil есть в macOS). */
function makeIcon() {
  const src = join(here, '..', 'frontend', 'public', 'icon-512.png')
  const set = join(tmp, 'icon.iconset')
  rmSync(set, { recursive: true, force: true })
  mkdirSync(set, { recursive: true })
  for (const [name, px] of [['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64], ['icon_128x128', 128], ['icon_128x128@2x', 256], ['icon_256x256', 256], ['icon_256x256@2x', 512], ['icon_512x512', 512], ['icon_512x512@2x', 1024]])
    execFileSync('sips', ['-z', String(px), String(px), src, '--out', join(set, name + '.png')], { stdio: 'ignore' })
  execFileSync('iconutil', ['-c', 'icns', set, '-o', icns])
}
mkdirSync(tmp, { recursive: true })
if (!existsSync(icns)) makeIcon()
rmSync(tmp, { recursive: true, force: true })

const out = await packager({
  dir: here,
  out: join(here, 'dist'),
  name: '우리말',
  platform: 'darwin',
  arch: 'arm64',
  overwrite: true,
  icon: join(here, 'icon'), // без расширения: упаковщик сам добавит .icns
  appBundleId: 'ru.meeymirita.urimal.personal',
  appCategoryType: 'public.app-category.education',
  ignore: [/^\/dist($|\/)/, /^\/build-tmp($|\/)/, /^\/install\.sh$/, /^\/build\.mjs$/, /^\/icon\.iconset/],
  extendInfo: { NSMicrophoneUsageDescription: 'Голосовой собеседник слушает тебя, когда ты говоришь по-корейски.' },
  prune: true,
})
const app = join(out[0], '우리말.app')
// ad-hoc подпись: приложение, собранное и запущенное на этом же Mac, открывается без предупреждений Gatekeeper
execFileSync('codesign', ['--force', '--deep', '-s', '-', app], { stdio: 'inherit' })
writeFileSync(join(here, 'dist', '.last-build'), app + '\n')
console.log('Готово:', app)
