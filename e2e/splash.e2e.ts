import { expect } from 'e2e';
import { describe, test } from '@e2e-dev/mobile';

// The boot splash is black in both appearances: the OS draws the native splash
// from the system appearance, so a scheme-following overlay flashed the wrong
// colours whenever the two disagreed. Both tests compare the overlay's lit
// frame against ONE baseline, so they pass only while the two match.
//
// `-E2EHoldBootSplash YES` stops the overlay on its lit glyph (it otherwise
// fades in under a second), and a fresh install boots into the seed pattern,
// so the glyph is the same every run.
describe('boot splash', { platforms: ['ios'] }, () => {
  for (const appearance of ['dark', 'light'] as const) {
    test(`is identical in ${appearance} mode`, async ({ app, device, screen }) => {
      await device.setAppearance(appearance);
      await app.clearState();
      await device.openApp('dev.brent.euxy', {
        relaunch: true,
        launchArguments: ['-E2EHoldBootSplash', 'YES'],
      });
      await expect(screen.getByTestId('boot-splash-grid')).toHaveScreenshot('boot-splash-grid.png', {
        timeout: 15_000,
      });
    });
  }
});
