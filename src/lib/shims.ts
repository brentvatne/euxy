/**
 * Soft fallbacks for native modules that newer JS references but older dev
 * builds don't contain (expo-updates, expo-observe, react-native-pulsar).
 * Importing any of them throws "Cannot find native module …" on a build that
 * predates it, which would take down the whole bundle over Fast Refresh. These
 * shims degrade to no-ops with a console.warn instead — the same pattern as
 * components/ui/keyboard.ts (react-native-keyboard-controller) and
 * state/persistence.ts (expo-sqlite).
 *
 * TODO: delete this file and import the packages directly once every
 * installed dev build ships both native modules.
 */
import type { ComponentType } from 'react';

import { clearPendingBootReload, markPendingBootReload } from '@/components/boot-signal';
import { HAPTIC_AUDIO_PREVIEW } from '@/lib/flags';

type UseUpdates = () => { isUpdatePending: boolean };
type ReloadOptions = {
  reloadScreenOptions?: {
    backgroundColor?: string;
    fade?: boolean;
    spinner?: { enabled?: boolean; size?: 'small' | 'medium' | 'large' };
  };
};
type UpdatesInfo = {
  /** False in dev clients and on builds without the native module. */
  isEnabled: boolean;
  /** Channel active when the app launched (null until a reload applies an override). */
  channel: string | null;
  runtimeVersion: string | null;
  /** Null when running the update embedded in the build. */
  updateId: string | null;
  createdAt: Date | null;
};

const updatesUnavailable = () => new Error('expo-updates unavailable on this build');

let useUpdatesImpl: UseUpdates = () => ({ isUpdatePending: false });
let reloadAsyncImpl: (options?: ReloadOptions) => Promise<void> = async () => {};
let updatesInfoImpl: UpdatesInfo = { isEnabled: false, channel: null, runtimeVersion: null, updateId: null, createdAt: null };
let setUpdateChannelOverrideImpl: (channel: string | null) => void = () => {
  throw updatesUnavailable();
};
let checkForUpdateImpl: () => Promise<{ isAvailable: boolean }> = () => Promise.reject(updatesUnavailable());
let fetchUpdateImpl: () => Promise<unknown> = () => Promise.reject(updatesUnavailable());
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updates = require('expo-updates');
  useUpdatesImpl = updates.useUpdates;
  reloadAsyncImpl = updates.reloadAsync;
  updatesInfoImpl = {
    isEnabled: updates.isEnabled ?? false,
    channel: updates.channel ?? null,
    runtimeVersion: updates.runtimeVersion ?? null,
    updateId: updates.updateId ?? null,
    createdAt: updates.createdAt ?? null,
  };
  setUpdateChannelOverrideImpl = (channel) =>
    updates.setUpdateRequestHeadersOverride(channel ? { 'expo-channel-name': channel } : null);
  checkForUpdateImpl = () => updates.checkForUpdateAsync();
  fetchUpdateImpl = () => updates.fetchUpdateAsync();
} catch {
  console.warn('[euxy] expo-updates native module missing — OTA updates disabled on this build.');
}

export const useUpdates: UseUpdates = (...args) => useUpdatesImpl(...args);
export const reloadUpdateAsync = async (options?: ReloadOptions) => {
  // The reload re-evals the whole bundle, replaying the boot sequence. Leave
  // a marker so that boot reports itself as kind:'reload', not a fresh launch
  // (see bootKind in components/boot-signal.ts).
  markPendingBootReload();
  try {
    await reloadAsyncImpl(options);
  } catch (e) {
    clearPendingBootReload();
    throw e;
  }
};
/** Static snapshot of the running update (fixed for the app's lifetime). */
export const updatesInfo: UpdatesInfo = updatesInfoImpl;
/** Channel surfing: override (or clear, with null) the expo-channel-name
 * request header for all future update checks on this install. Throws on
 * builds without the native module. */
export const setUpdateChannelOverride = (channel: string | null) => setUpdateChannelOverrideImpl(channel);
export const checkForUpdateAsync = () => checkForUpdateImpl();
export const fetchUpdateAsync = () => fetchUpdateImpl().then(() => {});

type UseObserve = () => { markInteractive: () => void };
type LogEventOptions = {
  attributes?: Record<string, string | number | boolean>;
  body?: string;
  severity?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
};

let observeConfigure: (options: unknown) => void = () => {};
let observeRootWrap = <P extends object>(c: ComponentType<P>): ComponentType<P> => c;
let useObserveImpl: UseObserve = () => ({ markInteractive: () => {} });
let logEventImpl: (name: string, options?: LogEventOptions) => void = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const observe = require('expo-observe');
  observeConfigure = (options) => observe.Observe.configure(options);
  observeRootWrap = (c) => observe.ObserveRoot.wrap(c);
  useObserveImpl = observe.useObserve;
  logEventImpl = (name, options) => observe.Observe.logEvent(name, options);
} catch {
  console.warn('[euxy] expo-observe native module missing — metrics disabled on this build.');
}

export const configureObserve = (options: unknown) => observeConfigure(options);
export const wrapWithObserveRoot = observeRootWrap;
export const useObserve: UseObserve = (...args) => useObserveImpl(...args);
/** Product-moment event (EAS Observe). Fire-and-forget; no-op on builds
 * without the native module. Keep names dot-separated and attributes
 * low-cardinality. */
export const logObserveEvent = (name: string, options?: LogEventOptions) =>
  logEventImpl(name, options);

/**
 * Screen sleep. Guarded like every other native module here: expo-keep-awake
 * ships in a BUILD, and Fast Refresh against a dev client that predates it
 * would otherwise red-screen (see docs/feedback/lessons-learned.md — this has
 * cost live sessions four times now).
 */
let activateKeepAwakeImpl: (tag: string) => void = () => {};
let deactivateKeepAwakeImpl: (tag: string) => void = () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake');
  // Both reject if the tag is already in/out of the requested state, which is
  // not an error worth surfacing — the callers are edge-triggered but the OS
  // is the source of truth.
  activateKeepAwakeImpl = (tag) => void ka.activateKeepAwakeAsync(tag).catch(() => {});
  deactivateKeepAwakeImpl = (tag) => void ka.deactivateKeepAwake(tag).catch(() => {});
} catch {
  console.warn('[euxy] expo-keep-awake native module missing — the screen will sleep on this build.');
}

/** Hold the screen awake under `tag` (idempotent, never throws). */
export const activateKeepAwake = (tag: string) => activateKeepAwakeImpl(tag);
/** Release `tag`'s hold on the screen (idempotent, never throws). */
export const deactivateKeepAwake = (tag: string) => deactivateKeepAwakeImpl(tag);

// --- Haptics -------------------------------------------------------------
// TWO engines, one API. `react-native-pulsar` is preferred and `expo-haptics`
// is the fallback, because Pulsar is the newer native dep and every dev build
// that predates it still has expo-haptics — so the discrete feel below is
// IDENTICAL on both paths and nothing degrades on an older build.
//
// Identical is not a hope: Pulsar's `Presets.System.*` are thin wrappers over
// the very same UIKit generators expo-haptics calls (`UIImpactFeedbackGenerator`,
// `UINotificationFeedbackGenerator`, `UISelectionFeedbackGenerator` — see
// iOS/Pulsar/Sources/Pulsar/Presets/SystemPresetsImpl.swift upstream), so the
// system haptics toggle keeps working the way ROADMAP §"Haptic language"
// assumes. What Pulsar ADDS is `useHapticRamp` below.
//
// Never run both at once: two engines bidding for one actuator is how you get
// an inconsistent click. The try-order here is what guarantees only one wins.

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
type HapticsApi = {
  /** Key-press weight feedback (defaults to light). */
  impact: (style?: ImpactStyle) => void;
  /** Browsing tick — pickers, pads, steppers, list taps. */
  selection: () => void;
  success: () => void;
  warning: () => void;
};

/**
 * A haptic you can STEER while it plays — the primitive `expo-haptics` has no
 * expression for. `set` retargets an ongoing vibration; the engine starts on
 * the first `set` and runs until `stop`.
 *
 * Every method is a worklet, and that is the entire point: the ramps this
 * drives are Reanimated shared values on the UI thread, so putting the haptic
 * back on a JS schedule would reintroduce exactly the drift it exists to fix.
 * Call them from `useAnimatedReaction` / gesture callbacks, not from JS.
 *
 * `amplitude` is strength and `frequency` is SHARPNESS (not pitch) — both 0…1.
 */
export type HapticRamp = {
  set: (amplitude: number, frequency: number) => void;
  /** One transient accent on top of the ongoing ramp. */
  playDiscrete: (amplitude: number, frequency: number) => void;
  stop: () => void;
};

/**
 * An AUTHORED haptic pattern — a list of timed events handed to the haptic
 * engine once, which then schedules them natively rather than us ticking a
 * timer per hit. `play` / `stop` are worklets, so a pattern can be armed ahead
 * of time and fired from the UI thread off the playhead.
 *
 * Shape of the pattern argument is `HapticPattern` in core/haptic-pattern.ts.
 */
export type HapticPatternPlayer = {
  play: () => void;
  stop: () => void;
  isParsed: () => boolean;
};

const noHaptics: HapticsApi = { impact: () => {}, selection: () => {}, success: () => {}, warning: () => {} };
// The fallback ramp must be worklet-callable too — a caller in a worklet cannot
// branch to a plain JS no-op. Module-level so the identity is stable.
const noRamp: HapticRamp = {
  set: () => {
    'worklet';
  },
  playDiscrete: () => {
    'worklet';
  },
  stop: () => {
    'worklet';
  },
};
const noPatternPlayer: HapticPatternPlayer = {
  play: () => {
    'worklet';
  },
  stop: () => {
    'worklet';
  },
  isParsed: () => false,
};

let hapticsImpl = noHaptics;
let useRampImpl: () => HapticRamp = () => noRamp;
let usePatternPlayerImpl: (pattern?: unknown) => HapticPatternPlayer = () => noPatternPlayer;
let rampAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pulsar = require('react-native-pulsar');
  const sys = pulsar.Presets.System;
  const impacts: Record<ImpactStyle, () => void> = {
    light: sys.impactLight,
    medium: sys.impactMedium,
    heavy: sys.impactHeavy,
    soft: sys.impactSoft,
    rigid: sys.impactRigid,
  };
  hapticsImpl = {
    impact: (style = 'light') => impacts[style](),
    selection: () => sys.selection(),
    success: () => sys.notificationSuccess(),
    warning: () => sys.notificationWarning(),
  };
  // See flags.ts — NOT Pulsar's own "on in debug" default.
  pulsar.Settings.enableSound(HAPTIC_AUDIO_PREVIEW);
  useRampImpl = pulsar.useRealtimeComposer;
  usePatternPlayerImpl = pulsar.usePatternComposer;
  rampAvailable = true;
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const h = require('expo-haptics');
    const impactStyles: Record<ImpactStyle, unknown> = {
      light: h.ImpactFeedbackStyle.Light,
      medium: h.ImpactFeedbackStyle.Medium,
      heavy: h.ImpactFeedbackStyle.Heavy,
      soft: h.ImpactFeedbackStyle.Soft,
      rigid: h.ImpactFeedbackStyle.Rigid,
    };
    // Fire-and-forget: feedback must never throw into a press handler.
    hapticsImpl = {
      impact: (style = 'light') => void h.impactAsync(impactStyles[style]).catch(() => {}),
      selection: () => void h.selectionAsync().catch(() => {}),
      success: () => void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}),
      warning: () => void h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => {}),
    };
    console.warn('[euxy] react-native-pulsar missing — discrete haptics via expo-haptics, no ramps on this build.');
  } catch {
    console.warn('[euxy] no haptics native module — haptics disabled on this build.');
  }
}

export const haptics: HapticsApi = {
  impact: (style) => hapticsImpl.impact(style),
  selection: () => hapticsImpl.selection(),
  success: () => hapticsImpl.success(),
  warning: () => hapticsImpl.warning(),
};

/**
 * True when continuous haptics are available. Callers that own a ramp keep
 * their old discrete schedule behind this so a build without Pulsar still
 * feels the way it does today (ROADMAP: "today's rate-based escalation stays
 * as the fallback for builds without the module").
 */
export const hapticRampAvailable = rampAvailable;

/**
 * Ongoing-haptic handle for this component. Safe to call unconditionally: on a
 * build without Pulsar it returns worklet no-ops. Whether it does anything is
 * `hapticRampAvailable`.
 *
 * Destructure the methods rather than holding the object — the returned
 * methods are referentially stable but the object is not, and a reaction that
 * closes over the object would be rebuilt on every render.
 */
export const useHapticRamp = (): HapticRamp => useRampImpl();

/**
 * Authored-pattern handle for this component. Same contract as useHapticRamp:
 * safe to call unconditionally, gated by `hapticRampAvailable`.
 *
 * Pass the pattern as the ARGUMENT and let it re-parse on identity change —
 * do not reach for an imperative parse. Pulsar's own `parse` replaces the
 * stored pattern id without releasing the previous one, so re-parsing that way
 * leaks a native player per call; the argument path releases the old id in its
 * effect cleanup before parsing the new one. Memoize what you pass.
 */
export const useHapticPatternPlayer = (pattern?: unknown): HapticPatternPlayer =>
  usePatternPlayerImpl(pattern);

let GlassViewImpl: ComponentType<Record<string, unknown>> | null = null;
let liquidGlass = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glass = require('expo-glass-effect');
  liquidGlass = glass.isLiquidGlassAvailable?.() ?? false;
  GlassViewImpl = glass.GlassView;
} catch {
  console.warn('[euxy] expo-glass-effect native module missing — solid capsule fallback.');
}

/** Native Liquid Glass (iOS 26+). `null` / `false` on older iOS, Android and
 * builds without the native module — callers render their solid fallback. */
export const GlassView = liquidGlass ? GlassViewImpl : null;
export const liquidGlassAvailable = liquidGlass && GlassViewImpl != null;

// --- Sharing (expo-sharing + expo-file-system) --------------------------
// Writes a base64 PNG to cache and opens the share sheet. Both packages are
// native; on builds that predate them callers fall back to sharing the bare
// link through RN's built-in Share API (see canSharePng).

let sharePngImpl: ((base64: string, filename: string) => Promise<void>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fileSystem = require('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharing = require('expo-sharing');
  sharePngImpl = async (base64: string, filename: string) => {
    const file = new fileSystem.File(fileSystem.Paths.cache, filename);
    if (file.exists) file.delete();
    file.write(base64, { encoding: 'base64' });
    await sharing.shareAsync(file.uri, { UTI: 'public.png', mimeType: 'image/png' });
  };
} catch {
  console.warn('[euxy] expo-sharing/file-system missing — card export disabled on this build.');
}

export const canSharePng = sharePngImpl != null;
export const sharePng = (base64: string, filename: string): Promise<void> =>
  sharePngImpl ? sharePngImpl(base64, filename) : Promise.resolve();

// --- Clipboard (expo-clipboard) ------------------------------------------

let clipboardImpl: ((text: string) => Promise<void>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clipboard = require('expo-clipboard');
  clipboardImpl = (text: string) => clipboard.setStringAsync(text).then(() => {});
} catch {
  console.warn('[euxy] expo-clipboard missing — copy link falls back to the share sheet.');
}

export const canCopyToClipboard = clipboardImpl != null;
export const copyToClipboard = (text: string): Promise<void> =>
  clipboardImpl ? clipboardImpl(text) : Promise.resolve();
