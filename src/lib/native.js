/**
 * Capacitor native plugin wrappers.
 *
 * ALL calls to native APIs must go through this file.
 * Each function checks isNative() first so the same code runs safely in a
 * desktop browser (where Capacitor plugins are no-ops or throw).
 *
 * isNative() = true only when running inside a Capacitor iOS/Android shell.
 */

import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()

// ─── Haptics ───────────────────────────────────────────────────────────────
let _haptics = null
async function getHaptics() {
  if (!isNative()) return null
  if (!_haptics) {
    const { Haptics } = await import('@capacitor/haptics')
    _haptics = Haptics
  }
  return _haptics
}

/**
 * @param {'light'|'medium'|'heavy'} style
 */
export async function buzz(style = 'medium') {
  const h = await getHaptics()
  if (!h) return
  const { ImpactStyle } = await import('@capacitor/haptics')
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
  await h.impact({ style: map[style] ?? ImpactStyle.Medium })
}

/**
 * Vibrate for a warning/error (notification haptic).
 * @param {'success'|'warning'|'error'} type
 */
export async function buzzNotification(type = 'success') {
  const h = await getHaptics()
  if (!h) return
  const { NotificationType } = await import('@capacitor/haptics')
  const map = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }
  await h.notification({ type: map[type] ?? NotificationType.Success })
}

// ─── StatusBar ─────────────────────────────────────────────────────────────
let _statusBar = null
async function getStatusBar() {
  if (!isNative()) return null
  if (!_statusBar) {
    const { StatusBar } = await import('@capacitor/status-bar')
    _statusBar = StatusBar
  }
  return _statusBar
}

/**
 * @param {'light'|'dark'} content  — 'light' = white icons (for dark bg)
 * @param {string} backgroundColor  — hex color e.g. '#000000'
 */
export async function setStatusBar(content = 'light', backgroundColor = '#000000') {
  const sb = await getStatusBar()
  if (!sb) return
  const { Style } = await import('@capacitor/status-bar')
  await sb.setStyle({ style: content === 'dark' ? Style.Dark : Style.Light })
  if (Capacitor.getPlatform() === 'android') {
    await sb.setBackgroundColor({ color: backgroundColor })
  }
}

// ─── Keyboard ──────────────────────────────────────────────────────────────
let _keyboard = null
async function getKeyboard() {
  if (!isNative()) return null
  if (!_keyboard) {
    const { Keyboard } = await import('@capacitor/keyboard')
    _keyboard = Keyboard
  }
  return _keyboard
}

export async function hideKeyboard() {
  const kb = await getKeyboard()
  if (!kb) return
  await kb.hide()
}

/**
 * Register a keyboard-show listener that scrolls an input into view.
 * Returns a cleanup function.
 * @returns {Promise<() => void>}
 */
export async function listenKeyboardShow(onShow) {
  const kb = await getKeyboard()
  if (!kb) return () => {}
  const listener = await kb.addListener('keyboardWillShow', onShow)
  return () => listener.remove()
}

// ─── App (back button) ─────────────────────────────────────────────────────
let _app = null
async function getApp() {
  if (!isNative()) return null
  if (!_app) {
    const { App } = await import('@capacitor/app')
    _app = App
  }
  return _app
}

/**
 * Register a handler for the Android hardware back button.
 * Returns a cleanup function.
 *
 * @param {() => void} handler
 * @returns {Promise<() => void>}
 */
export async function onAndroidBack(handler) {
  const app = await getApp()
  if (!app) return () => {}
  const listener = await app.addListener('backButton', handler)
  return () => listener.remove()
}

// ─── SplashScreen ──────────────────────────────────────────────────────────
export async function hideSplash() {
  if (!isNative()) return
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide({ fadeOutDuration: 300 })
}
