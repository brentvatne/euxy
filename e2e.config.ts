import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { easSimulators } from '@e2e-dev/eas';

// Deterministic suite: locators and assertions only, no agent steps, so no
// model or API key is needed.
//
// `eas` leases hosted iOS simulators from EAS Simulators and has EAS install
// the build E2E_BUILD_ID names (an `e2e` profile build). It authenticates with
// EXPO_TOKEN, else the eas-cli login. `local` drives a simulator that already
// has an `e2e` build installed: the one E2E_LOCAL_DEVICE names, else a booted
// one.
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
    { name: 'local', engine: mobile({ platform: 'ios', device: localDevice }), app },
  ],
  workers: 1,
} satisfies E2EConfig;
