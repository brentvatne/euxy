import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { easSimulators } from '@e2e-dev/eas';
import { web } from '@e2e-dev/web';

// Deterministic suite: locators and assertions only, no agent steps, so no
// model or API key is needed.
//
// `eas` leases hosted iOS simulators from EAS Simulators and has EAS install
// the build E2E_BUILD_ID names (an `e2e` profile build); `eas-android` does
// the same on a hosted Android emulator with the APK E2E_ANDROID_BUILD_ID
// names. Both authenticate with EXPO_TOKEN, else the eas-cli login. `local`
// drives a simulator that already has an `e2e` build installed: the one
// E2E_LOCAL_DEVICE names, else a booted one. `web` serves a production export
// of the website in web/ on a free port and drives it in Chromium.
const app = { bundleId: 'dev.brent.euxy' };
const localDevice = process.env.E2E_LOCAL_DEVICE || undefined;

export default {
  tests: ['e2e/**/*.e2e.ts'],
  targets: [
    {
      name: 'eas',
      engine: mobile({
        platform: 'ios',
        device: easSimulators({ buildId: process.env.E2E_BUILD_ID, device: 'iPhone 17' }),
        // Drawing touches into an EAS recording takes minutes to stop.
        videoTouches: false,
      }),
      app,
    },
    {
      name: 'eas-android',
      engine: mobile({
        platform: 'android',
        device: easSimulators({ buildId: process.env.E2E_ANDROID_BUILD_ID, device: 'pixel_9' }),
        videoTouches: false,
      }),
      app,
    },
    { name: 'local', engine: mobile({ platform: 'ios', device: localDevice }), app },
    {
      name: 'web',
      engine: web(),
      app: {
        url: 'http://127.0.0.1:0',
        command: {
          executable: 'bun',
          args: ['run', 'serve:e2e'],
          cwd: 'web',
          env: { PORT: '{port}' },
          // The export runs first.
          startupTimeout: 300_000,
          log: '.e2e/logs/web.log',
        },
      },
    },
  ],
  workers: 1,
  // One more attempt on CI, where a hosted device occasionally drops a
  // snapshot (ENGINE_FAILURE) mid-run; locally a failure stays a failure.
  retries: process.env.CI ? 1 : 0,
} satisfies E2EConfig;
