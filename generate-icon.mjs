import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

// SVG that matches the HAJAJ logo style
const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Light marble-like background -->
  <rect width="1024" height="1024" fill="#f4f2ef"/>

  <!-- Subtle texture overlay -->
  <rect width="1024" height="1024" fill="url(#grain)" opacity="0.15"/>

  <defs>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>

  <!-- HAJAJ main text -->
  <text
    x="512"
    y="490"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="148"
    font-weight="bold"
    text-anchor="middle"
    fill="#1a1a1a"
    letter-spacing="28"
  >HAJAJ</text>

  <!-- Thin separator line -->
  <line x1="312" y1="540" x2="712" y2="540" stroke="#1a1a1a" stroke-width="1" opacity="0.4"/>

  <!-- Subtitle -->
  <text
    x="512"
    y="590"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="30"
    text-anchor="middle"
    fill="#555"
    letter-spacing="7"
  >WHERE HAIR BECOMES ART</text>
</svg>`

// Generate all 3 sizes
const sizes = [
  { size: 1024, file: 'public/icons/icon-1024.png' },
  { size: 512,  file: 'public/icons/icon-512.png'  },
  { size: 192,  file: 'public/icons/icon-192.png'  },
]

for (const { size, file } of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(file)
  console.log(`✓ ${file} (${size}×${size})`)
}

console.log('\nDone! Now run: npx @capacitor/assets generate --iconBackgroundColor \'#f4f2ef\' --splashBackgroundColor \'#f4f2ef\'')
