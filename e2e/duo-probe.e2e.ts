import { expect, test } from 'e2e';

// What the app shows on a foldable's outer display before anything is asserted: the first frame is the evidence.
test('probe: the app on the outer display', async ({ app, screen }) => {
  await app.clearState();
  await app.screenshot('first-frame');
  await expect(screen.getByRole('tab', 'Sequencer')).toBeVisible({ timeout: 30_000 });
  await app.screenshot('sequencer');
});
