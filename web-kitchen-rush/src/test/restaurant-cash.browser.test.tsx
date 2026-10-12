import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { CashRegister } from '@/management/CashRegister';
import { RestaurantEngine } from '@/management/engine';
import { RestaurantLabels } from '@/management/RestaurantLabels';
import { RECEIPT_SECONDS } from '@/management/cash-feedback';
import { money } from '@/management/format';
import '@/index.css';

it('uses a dollar icon and only animates actual income, with an exact accessible balance', async () => {
  const engine = new RestaurantEngine();
  const screen = await render(<CashRegister engine={engine} />);
  expect(screen.container.querySelector('.lucide-dollar-sign')).not.toBeNull();
  await expect.element(screen.getByTestId('cash')).toHaveTextContent('$1,250');
  expect(screen.container.querySelector('[data-testid="cash-income"]')).toBeNull();
  engine.sell(6);
  await expect.element(screen.getByTestId('cash-income')).toHaveTextContent('+$45');
  await expect.element(screen.getByRole('status')).toHaveTextContent('Furniture sold: $45 received');
  await expect.element(screen.getByTestId('cash')).toHaveAttribute('aria-label', 'Cash $1,295');
  await expect.element(screen.getByTestId('cash')).toHaveTextContent('$1,295');
  expect(getComputedStyle(screen.getByTestId('cash-income').element()).pointerEvents).toBe('none');
  engine.reset();
  await expect.element(screen.getByTestId('cash-income')).not.toBeInTheDocument();
  await expect.element(screen.getByTestId('cash')).toHaveTextContent('$1,250');
  engine.hire('chef'); await expect.element(screen.getByTestId('cash')).toHaveTextContent('$1,100');
  await expect.element(screen.getByTestId('cash-income')).not.toBeInTheDocument();
});

it('does not replay a receipt when mounted after the payment', async () => {
  const engine = new RestaurantEngine(); engine.sell(6);
  const screen = await render(<CashRegister engine={engine} />);
  await expect.element(screen.getByTestId('cash')).toHaveTextContent('$1,295');
  await expect.element(screen.getByTestId('cash-income')).not.toBeInTheDocument();
});

it('projects the exact payment and tip with the guest meter, then removes it safely', async () => {
  const engine = new RestaurantEngine(); engine.open();
  for (let i = 0; i < 1000 && !engine.incomeReceipts.length; i++) engine.update(.1);
  engine.pause(true); engine.state.clock += .4;
  const receipt = engine.incomeReceipts[0]; expect(receipt).toBeDefined();
  const labels = { current: new Map<string, HTMLDivElement>() };
  const content = () => <RestaurantLabels state={engine.state} labels={labels} receipts={engine.incomeReceipts} paused={engine.paused} speed={engine.speed} />;
  const screen = await render(content());
  const payment = screen.getByTestId('guest-payment').element();
  expect(payment.textContent).toContain(`+${money(receipt.amount)}`);
  expect(payment.textContent).toContain(`incl. ${money(receipt.tip)} tip`);
  expect(labels.current.get(`customer-${receipt.guestId}`)?.contains(payment)).toBe(true);
  expect(getComputedStyle(payment).pointerEvents).toBe('none');
  expect(payment.getAnimations()[0].playState).toBe('paused');
  expect(payment.getAnimations()[0].currentTime).toBeCloseTo(400);
  engine.speed = 3; engine.pause(false); await screen.rerender(content());
  expect(payment.getAnimations()[0].playbackRate).toBe(3);
  expect(payment.getAnimations()[0].playState).toBe('running');
  engine.pause(true); await screen.rerender(content());
  expect(payment.getAnimations()[0].playState).toBe('paused');
  engine.state.clock += RECEIPT_SECONDS;
  await screen.rerender(content()); await expect.element(screen.getByTestId('guest-payment')).not.toBeInTheDocument();
  expect(labels.current.has(`customer-${receipt.guestId}`)).toBe(true);
  engine.reset(); await screen.rerender(content()); expect(labels.current.size).toBe(0);
});

it.each([320, 390, 768])('keeps the register and dollar popup compact at %ipx', async width => {
  await page.viewport(width, 740);
  const engine = new RestaurantEngine();
  const screen = await render(<div className="flex w-full justify-center p-3"><CashRegister engine={engine} /></div>);
  engine.sell(6); await expect.element(screen.getByTestId('cash-income')).toBeVisible();
  for (const id of ['cash-register', 'cash-income']) {
    const element = screen.getByTestId(id).element(), rect = element.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
    expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
  }
});
