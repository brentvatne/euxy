import { beforeEach, describe, expect, test } from 'e2e';

// Multi-step journeys through euxy, with a frame at each state worth comparing
// across revisions. Buttons are reported twice on iOS, so queries take .first().
describe('journeys', { platforms: ['ios', 'android'] }, () => {
  beforeEach(async ({ app, screen }) => {
    await app.clearState();
    await expect(screen.getByRole('tab', 'Sequencer')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByTestId('boot-splash')).toBeHidden({ timeout: 10_000 });
  });

  const row = (name: string) => new RegExp(`^${name}, \\d+ lanes?, \\d+ BPM`);

  test('load a preset, retune it and shape a lane', async ({ app, screen }) => {
    await screen.getByRole('tab', 'Patterns').tap();
    await expect(screen.getByRole('button', 'New pattern').first()).toBeVisible();
    await app.screenshot('patterns');
    await screen.getByRole('button', row('Lo-Fi Bounce')).first().tap();
    await expect(screen.getByRole('button', row('Lo-Fi Bounce')).first()).toBeSelected();
    await screen.getByRole('tab', 'Sequencer').tap();
    await expect(screen.getByRole('button', 'Pattern Lo-Fi Bounce — menu')).toBeVisible();
    await expect(screen.getByTestId(/^lane-row-title-\d+$/)).toHaveCount(4);
    await app.screenshot('lofi-loaded');

    await screen.getByRole('button', 'Edit tempo').first().tap();
    await expect(screen.getByTestId('tempo-value')).toHaveText('76');
    for (let i = 0; i < 4; i += 1) await screen.getByRole('button', 'Increase tempo').first().tap();
    await expect(screen.getByTestId('tempo-value')).toHaveText('80');
    await app.screenshot('tempo-sheet-80');
    await screen.getByRole('button', 'Done').first().tap();

    await screen.getByTestId('lane-row-title-0').tap();
    await expect(screen.getByText('Edit Lane').first()).toBeVisible();
    await app.screenshot('lane-editor');
    const and = screen.getByRole('button', 'AND').first();
    await expect(and).toBeVisible();
    await and.tap();
    await expect(and).toBeSelected();
    await screen.getByRole('button', 'Done').first().tap();

    const mute = screen.getByRole('button', 'Mute').first();
    await mute.tap();
    await expect(mute).toBeSelected();
    await screen.getByRole('button', 'Solo').first().tap();
    await app.screenshot('lofi-mixed');
    await screen.getByRole('button', 'Play').first().tap();
    await expect(screen.getByRole('button', 'Pause').first()).toBeVisible();
    await app.screenshot('playing');
    await screen.getByRole('button', 'Pause').first().tap();
    await expect(screen.getByRole('button', 'Play').first()).toBeVisible();
  });

  test('create a pattern, add a named lane and play it', async ({ app, screen }) => {
    await screen.getByRole('tab', 'Patterns').tap();
    await screen.getByRole('button', 'New pattern').first().tap();
    await expect(screen.getByText('New Pattern').first()).toBeVisible();
    // The sheet proposes a random name; replace it (iOS fill appends, so clear first) so the journey can find the pattern.
    const name = screen.getByRole('textbox').first();
    await name.clear();
    await name.fill('Rusty Relay');
    await app.screenshot('new-pattern-sheet');
    await screen.getByRole('button', 'Increase tempo').first().tap();
    await screen.getByRole('button', 'Increase tempo').first().tap();
    // The create button sits below the fields; its label is the text inside it.
    const create = screen.getByText('Create pattern').first();
    await screen.scrollUntilVisible(create);
    await expect(create).toBeVisible();
    await new Promise(resolve => setTimeout(resolve, 600));
    await create.tap();

    // Creating selects the new pattern in the list; Android stays on the list while iOS may switch tabs,
    // so go to the sequencer explicitly and let the new pattern's menu prove it is loaded.
    await expect(screen.getByRole('button', row('Rusty Relay')).first()).toBeSelected({ timeout: 10_000 });
    await screen.getByRole('tab', 'Sequencer').tap();
    await expect(screen.getByRole('button', 'Pattern Rusty Relay — menu')).toBeVisible({ timeout: 10_000 });
    await app.screenshot('created');

    await screen.getByRole('button', 'Add lane').first().tap();
    await expect(screen.getByText('Edit Lane').first()).toBeVisible();
    const name = screen.getByRole('textbox', 'Lane name');
    await screen.scrollUntilVisible(name);
    await name.fill('Boom');
    await screen.getByRole('button', 'XOR').first().tap();
    await app.screenshot('new-lane');
    await screen.getByRole('button', 'Done').first().tap();
    const added = screen.getByRole('button', /^Boom/).first();
    await screen.scrollUntilVisible(added);
    await expect(added).toBeVisible();
    await app.screenshot('lane-added');

    await screen.getByRole('button', 'Play').first().tap();
    await expect(screen.getByRole('button', 'Pause').first()).toBeVisible();
    await screen.getByRole('button', 'Pause').first().tap();
    await screen.getByRole('tab', 'Patterns').tap();
    await expect(screen.getByRole('button', 'New pattern').first()).toBeVisible();
    await app.screenshot('patterns-with-new');
  });

  test('rename the pattern from its menu and find it in the list', async ({ app, screen }) => {
    await screen.getByRole('button', 'Pattern Untitled — menu').tap();
    await app.screenshot('pattern-menu');
    // The menu's actions are labelled by the text inside them.
    await expect(screen.getByText(/^Rename/).first()).toBeVisible({ timeout: 10_000 });
    await screen.getByText(/^Rename/).first().tap();
    // iOS asks in a native alert titled "Rename pattern" whose confirm button is "Rename".
    await expect(screen.getByText(/^Rename pattern$/i).first()).toBeVisible();
    const field = screen.getByRole('textbox').first();
    await field.fill('Groove');
    await app.screenshot('rename-sheet');
    // The confirm is a native alert button; Android's Compose dialog exposes no tappable node for it, so tap its centre.
    const confirm = screen.getByText(/^(Rename|Done)$/).first();
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    await screen.tapAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(screen.getByRole('button', 'Pattern Groove — menu')).toBeVisible();
    await app.screenshot('renamed');

    await screen.getByRole('tab', 'Patterns').tap();
    await expect(screen.getByRole('button', row('Groove')).first()).toBeSelected();
    await app.screenshot('patterns-renamed');
    await screen.getByRole('tab', 'Settings').tap();
    await expect(screen.getByRole('tab', 'Settings')).toBeSelected();
    await app.screenshot('settings');
    await screen.getByRole('tab', 'Sequencer').tap();
    await expect(screen.getByRole('button', 'Pattern Groove — menu')).toBeVisible();
  });
});
