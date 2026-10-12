import { useState } from 'react';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { ChefWardrobe, OutfitPicker } from '@/components/ChefWardrobe';
import { engine } from '@/game/engine';
import { DEFAULT_OUTFIT, type ChefOutfit } from '@/game/chef-outfit';

// Real WebGL colors and resource lifetime are covered by the wardrobe scene verifier.
vi.mock('@/scene/ChefPreview', () => ({ ChefPreview: ({ id, outfit }: { id: number; outfit: ChefOutfit }) => <p>Preview {id + 1}: {outfit.hat} / {outfit.apron}</p> }));
beforeEach(() => { engine.setPhase('menu'); engine.resetOutfit(0); engine.resetOutfit(1); });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('kitchen-rush-outfits-v1'); });

function PickerHarness() {
  const [outfit, setOutfit] = useState<ChefOutfit>({ ...DEFAULT_OUTFIT });
  return <OutfitPicker outfit={outfit} onChange={(part, color) => setOutfit(prev => ({ ...prev, [part]: color }))} />;
}
test('hat and apron have named independent palettes with checked states', async () => {
  const screen = await render(<PickerHarness />);
  const hat = screen.getByRole('radiogroup', { name: 'Hat color' }), apron = screen.getByRole('radiogroup', { name: 'Apron color' });
  expect(hat.getByRole('radio').all()).toHaveLength(6); expect(apron.getByRole('radio').all()).toHaveLength(6);
  await hat.getByRole('radio', { name: 'Teal', exact: true }).click();
  await apron.getByRole('radio', { name: 'Tomato', exact: true }).click();
  await expect.element(hat.getByRole('radio', { name: 'Teal', exact: true })).toBeChecked();
  await expect.element(apron.getByRole('radio', { name: 'Tomato', exact: true })).toBeChecked();
});
test('arrow keys move color selection without affecting the other garment', async () => {
  const screen = await render(<PickerHarness />);
  const hat = screen.getByRole('radiogroup', { name: 'Hat color' });
  await hat.getByRole('radio', { name: 'Cream', exact: true }).click(); await userEvent.keyboard('{ArrowRight>}');
  await expect.element(hat.getByRole('radio', { name: 'Tomato', exact: true })).toBeChecked();
  await userEvent.keyboard('{/ArrowRight}');
  await expect.element(screen.getByRole('radiogroup', { name: 'Apron color' }).getByRole('radio', { name: 'Cream', exact: true })).toBeChecked();
});
test('player switching, immediate preview, reset, close/reopen and focus restoration', async () => {
  const screen = await render(<ChefWardrobe />); const trigger = screen.getByRole('button', { name: 'Your chefs' }); await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radiogroup', { name: 'Hat color' }).getByRole('radio', { name: 'Gold', exact: true }).click();
  await expect.element(dialog.getByText('Preview 1: gold / cream')).toBeVisible();
  await dialog.getByRole('radio', { name: 'Chef 2 Mouse' }).click();
  await dialog.getByRole('radiogroup', { name: 'Apron color' }).getByRole('radio', { name: 'Dusk', exact: true }).click();
  await expect.element(dialog.getByText('Preview 2: cream / dusk')).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset Chef 2 colors' }).click();
  expect(engine.state.outfits).toEqual([{ hat: 'gold', apron: 'cream' }, DEFAULT_OUTFIT]);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click(); await expect.element(trigger).toHaveFocus();
  await trigger.click(); await dialog.getByRole('radio', { name: 'Chef 1 Crocodile' }).click();
  await expect.element(dialog.getByRole('radiogroup', { name: 'Hat color' }).getByRole('radio', { name: 'Gold', exact: true })).toBeChecked();
  await userEvent.keyboard('{Escape}'); await expect.element(trigger).toHaveFocus();
});
test('storage failures keep the selection and display a truthful session-only warning', async () => {
  const screen = await render(<ChefWardrobe />); await screen.getByRole('button', { name: 'Your chefs' }).click();
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radiogroup', { name: 'Hat color' }).getByRole('radio', { name: 'Apricot', exact: true }).click();
  expect(engine.state.outfits[0].hat).toBe('apricot'); await expect.element(dialog.getByRole('status')).toHaveTextContent('Browser storage is unavailable');
  save.mockRestore(); await dialog.getByRole('button', { name: 'Reset Chef 1 colors' }).click();
  await expect.element(dialog.getByRole('status')).toHaveTextContent('Colors save on this browser');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
});
