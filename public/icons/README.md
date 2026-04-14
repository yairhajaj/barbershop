# App Icons

Place your app icon files here before building:

| File | Size | Usage |
|------|------|-------|
| `icon-192.png` | 192×192 px | PWA manifest + Android |
| `icon-512.png` | 512×512 px | PWA manifest + splash |
| `icon-1024.png` | 1024×1024 px | App Store (iOS) + Google Play |

## Quick generation

Once you have a single high-res PNG (1024×1024), run:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#C9A96E' --splashBackgroundColor '#ffffff'
```

This auto-generates all sizes needed for both iOS and Android.

## Notes
- No transparency / alpha channel in the 1024px version for App Store
- Use `maskable` purpose icons (add padding ~10%) for Android adaptive icons
