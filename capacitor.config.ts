import { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration.
 *
 * For SaaS white-labeling: change appId, appName, and the icons
 * in public/icons/ per client, then run:
 *   npm run build && npx cap sync && npx cap open android
 */
const config: CapacitorConfig = {
  // NOTE: Android applicationId is actually 'com.barbershop.app'
  // (see android/app/build.gradle). This appId affects only `npx cap add`,
  // which already ran — it still matches the iOS bundle identifier.
  appId: 'com.hajaj.app',
  appName: 'HAJAJ',
  webDir: 'dist',

  server: {
    // Use https scheme on Android so cookies / auth work correctly
    androidScheme: 'https',
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Capacitor handles safe-area via the plugin automatically on iOS
    // StatusBar handled natively
  },

  // iOS-specific
  ios: {
    contentInset: 'automatic',
  },

  // Android-specific
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true during development
  },
}

export default config
