import { beforeEach, expect, test } from 'e2e';

// A fresh install's data, past the boot overlay (see sequencer.e2e.ts).
beforeEach(async ({ app, screen }) => {
  await app.clearState();
  await expect(screen.getByRole('tab', 'Sequencer')).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByTestId('boot-splash')).toBeHidden({ timeout: 10_000 });
});

// Rows read "<name> <n> lanes · <bpm> BPM · edited <when>", and each row is
// reported twice (the cell and its button), so match the start and take one.
const row = (name: string) => new RegExp(`^${name} \\d+ lanes · \\d+ BPM`);

test('lists the factory presets', async ({ screen }) => {
  await screen.getByRole('tab', 'Patterns').tap();

  await expect(screen.getByRole('button', 'New pattern').first()).toBeVisible();
  await expect(screen.getByRole('button', row('Untitled')).first()).toBeSelected();
  await expect(screen.getByRole('button', row('Lo-Fi Bounce')).first()).toHaveAccessibleName(
    /^Lo-Fi Bounce 4 lanes · 76 BPM/,
  );
  await expect(screen.getByRole('button', row('Four on the Floor')).first()).toBeVisible();
});

test('selecting a preset loads it into the sequencer', async ({ screen }) => {
  await screen.getByRole('tab', 'Patterns').tap();
  await screen.getByRole('button', row('Lo-Fi Bounce')).first().tap();
  await expect(screen.getByRole('button', row('Lo-Fi Bounce')).first()).toBeSelected();

  await screen.getByRole('tab', 'Sequencer').tap();
  await expect(screen.getByRole('button', 'Pattern Lo-Fi Bounce — menu')).toBeVisible();
  await expect(screen.getByTestId(/^lane-row-title-\d+$/)).toHaveCount(4);

  await screen.getByRole('button', 'Edit tempo').first().tap();
  await expect(screen.getByTestId('tempo-value')).toHaveText('76');
});
