import { beforeEach, describe, expect, test } from 'e2e';

// The lane editor sheet, opened from the first lane's title on a fresh
// install's seed pattern (five lanes, the first a Kick on Track 1). Sliders are
// left alone: dragging one lands on a value that depends on the screen size.
describe('lane editor', { platforms: ['ios', 'android'] }, () => {
  beforeEach(async ({ app, screen }) => {
    await app.clearState();
    await expect(screen.getByRole('tab', 'Sequencer')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId('boot-splash')).toBeHidden({ timeout: 10_000 });
    await screen.getByTestId('lane-row-title-0').tap();
    await expect(screen.getByText('Edit Lane').first()).toBeVisible();
  });

  test('a new name shows on the sequencer', async ({ screen }) => {
    const name = screen.getByRole('textbox', 'Lane name');
    await screen.scrollUntilVisible(name);
    await name.fill('Boom');
    await screen.getByRole('button', 'Done').first().tap();

    await expect(screen.getByText('Edit Lane')).toHaveCount(0);
    await expect(screen.getByTestId('lane-row-title-0')).toHaveAccessibleName(/^Boom/);
  });

  test('done keeps a new combine mode', async ({ screen }) => {
    await screen.getByRole('button', 'XOR').first().tap();
    await expect(screen.getByRole('button', 'XOR').first()).toBeSelected();
    await screen.getByRole('button', 'Done').first().tap();

    await screen.getByTestId('lane-row-title-0').tap();
    await expect(screen.getByRole('button', 'XOR').first()).toBeSelected();
  });

  test('cancel reverts the lane', async ({ screen }) => {
    await screen.getByRole('button', 'XOR').first().tap();
    const name = screen.getByRole('textbox', 'Lane name');
    await screen.scrollUntilVisible(name);
    await name.fill('Boom');
    await screen.getByRole('button', 'Cancel').first().tap();

    await expect(screen.getByTestId('lane-row-title-0')).toHaveAccessibleName(/^Kick/);
    await screen.getByTestId('lane-row-title-0').tap();
    await expect(screen.getByRole('button', 'OR').first()).toBeSelected();
    await expect(screen.getByRole('button', 'XOR').first()).not.toBeSelected();
  });

  test('delete removes the lane', async ({ screen }) => {
    const del = screen.getByRole('button', 'Delete lane').first();
    await screen.scrollUntilVisible(del);
    await del.tap();

    await expect(screen.getByTestId(/^lane-row-title-\d+$/)).toHaveCount(4);
    await expect(screen.getByTestId('lane-row-title-0')).not.toHaveAccessibleName(/^Kick/);
  });
});
