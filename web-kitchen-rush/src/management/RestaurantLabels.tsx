import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { ChefHat } from 'lucide-react';
import * as THREE from 'three';
import { GuestSatisfactionBar } from './GuestSatisfactionBar';
import { GuestPayment } from './GuestPayment';
import { RECEIPT_SECONDS, type CashReceipt } from './cash-feedback';
import { guestMood, guestSatisfaction, satisfactionHeight } from './satisfaction';
import { guestPatienceSeconds, type RestaurantState } from './types';
import { separateLabels, type LabelPoint } from './label-layout';

/** A shared projection registry keeps labels in the main DOM tree, not separate React roots. */
export type LabelRegistry = RefObject<Map<string, HTMLDivElement>>;

/** DOM-owned labels clean up safely when guests leave, service closes, or the restaurant resets. */
export function RestaurantLabels({ state, labels, receipts = [], paused = false, speed = 1 }: { state: RestaurantState; labels: LabelRegistry; receipts?: readonly CashReceipt[]; paused?: boolean; speed?: number }) {
  const patience = guestPatienceSeconds(state);
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="restaurant-labels">
    {state.guests.map(guest => {
      const value = guestSatisfaction(guest, patience), id = `customer-${guest.id}`;
      const receipt = receipts.find(item => item.guestId === guest.id && item.source === 'service' && state.clock >= item.clock && state.clock - item.clock < RECEIPT_SECONDS);
      return <div key={id} ref={element => { if (element) labels.current.set(id, element); else labels.current.delete(id); }} data-anchor-height={satisfactionHeight(guest.species)}
        className="pointer-events-none invisible absolute left-0 top-0 z-[2] flex w-max flex-col items-center">
        <span aria-hidden="true" data-label-line className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-px origin-top bg-ink/35" />
        {receipt && <GuestPayment key={receipt.id} receipt={receipt} age={state.clock - receipt.clock} paused={paused} speed={speed} />}
        <GuestSatisfactionBar special={guest.special} id={guest.id} value={value} mood={guestMood(value, guest.stage, guest.happy)} stage={guest.stage} />
      </div>;
    })}
    {state.staff.filter(member => member.task === 'cooking').map(member => {
      const id = `employee-${member.id}`;
      return <div key={id} ref={element => { if (element) labels.current.set(id, element); else labels.current.delete(id); }} data-anchor-height="2.8"
        className="pointer-events-none invisible absolute left-0 top-0 z-[3] w-max">
        <div className="flex items-center gap-1 rounded-full border-2 border-paper bg-teal px-2 py-1 text-xs font-bold text-paper"><ChefHat size={12} aria-hidden="true" />{Math.max(1, Math.ceil(member.timer))}s</div>
      </div>;
    })}
  </div>;
}

/** Projects the actual smoothed rigs every frame; only transforms change, never service state. */
export function RestaurantLabelPositions({ labels }: { labels: LabelRegistry }) {
  const point = useMemo(() => new THREE.Vector3(), []);
  const objects = useRef<Map<string, THREE.Object3D>>(new Map());
  useFrame(({ scene, camera, size }) => {
    const positions: LabelPoint[] = [];
    for (const id of objects.current.keys()) if (!labels.current.has(id)) objects.current.delete(id);
    for (const [id, element] of labels.current) {
      let object = objects.current.get(id);
      if (!object?.parent) { object = scene.getObjectByName(id); if (object) objects.current.set(id, object); }
      if (!object) { element.style.visibility = 'hidden'; continue; }
      object.updateWorldMatrix(true, false);
      point.set(0, Number(element.dataset.anchorHeight), 0).applyMatrix4(object.matrixWorld).project(camera);
      if (point.z < -1 || point.z > 1) { element.style.visibility = 'hidden'; continue; }
      const height = element.offsetHeight, baseHeight = element.querySelector<HTMLElement>('[role="meter"]')?.offsetHeight ?? height;
      positions.push({ id, x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2 - (height - baseHeight) / 2, width: element.offsetWidth, height });
    }
    for (const label of separateLabels(positions)) {
      const element = labels.current.get(label.id); if (!element) continue;
      element.style.transform = `translate3d(${label.x - label.width / 2}px, ${label.y - label.height / 2}px, 0)`;
      element.style.visibility = 'visible';
      const line = element.querySelector<HTMLElement>('[data-label-line]');
      if (line) line.style.height = `${label.lift}px`;
    }
  });
  return null;
}
