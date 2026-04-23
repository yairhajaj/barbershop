import sharp from 'sharp'
import { mkdirSync, copyFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve('C:/Users/yairh/Downloads/WhatsApp Image 2026-04-23 at 20.28.31.jpeg')

mkdirSync('public/icons', { recursive: true })
mkdirSync('icons', { recursive: true })

// Web / PWA — PNG
const pngSizes = [
  { size: 1024, file: 'public/icons/icon-1024.png' },
  { size: 1024, file: 'public/icons/icon-only.png' },
  { size: 512,  file: 'public/icons/icon-512.png'  },
  { size: 192,  file: 'public/icons/icon-192.png'  },
]

for (const { size, file } of pngSizes) {
  await sharp(SRC).resize(size, size).png().toFile(file)
  console.log(`✓ ${file}`)
}

// Web / PWA — WebP
const webpSizes = [512, 256, 192, 128, 96, 72, 48]
for (const size of webpSizes) {
  const file = `icons/icon-${size}.webp`
  await sharp(SRC).resize(size, size).webp({ quality: 90 }).toFile(file)
  console.log(`✓ ${file}`)
}

// Android mipmap icons
const androidSizes = [
  { size: 36,  dir: 'android/app/src/main/res/mipmap-ldpi'    },
  { size: 48,  dir: 'android/app/src/main/res/mipmap-mdpi'    },
  { size: 72,  dir: 'android/app/src/main/res/mipmap-hdpi'    },
  { size: 96,  dir: 'android/app/src/main/res/mipmap-xhdpi'   },
  { size: 144, dir: 'android/app/src/main/res/mipmap-xxhdpi'  },
  { size: 192, dir: 'android/app/src/main/res/mipmap-xxxhdpi' },
]

for (const { size, dir } of androidSizes) {
  const buf = await sharp(SRC).resize(size, size).png().toBuffer()
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const path = `${dir}/${name}`
    await sharp(buf).toFile(path)
    console.log(`✓ ${path}`)
  }
}

// iOS — 1024×1024
const iosPath = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
await sharp(SRC).resize(1024, 1024).png().toFile(iosPath)
console.log(`✓ ${iosPath}`)

console.log('\nDone!')
