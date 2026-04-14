import { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration.
 *
 * For SaaS white-labeling: change appId, appName, and the icons
 * in public/icons/ per client, then run:
 *   npm run build && npx cap sync && npx cap open android
 */
const config: CapacitorConfig = {
  appId: 'com.barbershop.app',
  appName: 'Barbershop',
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
