import { beforeEach, expect, test } from 'e2e';

// Every test starts from a fresh install's data: the "Untitled" seed pattern,
// five lanes, 120 BPM. The boot overlay covers the UI and takes taps until its
// power-on animation ends, so wait for it to leave.
//
// iOS reports each React Native button twice, the Pressable and the view
// inside it, under one name, so button queries take the first match.
beforeEach(async ({ app, screen }) => {
  await app.clearState();
  await expect(screen.getByRole('tab', 'Sequencer')).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByTestId('boot-splash')).toBeHidden({ timeout: 10_000 });
});

test('opens on the sequencer with the seed pattern', async ({ screen }) => {
  await expect(screen.getByRole('button', 'Pattern Untitled — menu')).toBeVisible();
  await expect(screen.getByTestId(/^lane-row-title-\d+$/)).toHaveCount(5);
  await expect(screen.getByTestId('lane-row-title-0')).toHaveAccessibleName('Kick F2 · Track 1');
  await expect(screen.getByRole('button', 'Play').first()).toBeVisible();
  await expect(screen.getByRole('tab', 'Sequencer')).toBeSelected();
});

test('cancel in the tempo sheet reverts the BPM', async ({ screen }) => {
  await screen.getByRole('button', 'Edit tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('120');

  await screen.getByRole('button', 'Increase tempo').first().tap();
  await screen.getByRole('button', 'Increase tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('122');

  await screen.getByRole('button', 'Cancel').first().tap();
  await screen.getByRole('button', 'Edit tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('120');
});

test('done in the tempo sheet keeps the BPM', async ({ screen }) => {
  await screen.getByRole('button', 'Edit tempo').first().tap();
  await screen.getByRole('button', 'Decrease tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('119');

  await screen.getByRole('button', 'Done').first().tap();
  await screen.getByRole('button', 'Edit tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('119');
});

test('mute toggles on a lane and back off', async ({ screen }) => {
  const mute = screen.getByRole('button', 'Mute').first();

  await mute.tap();
  await expect(mute).toBeSelected();

  await mute.tap();
  await expect(mute).not.toBeSelected();
});
