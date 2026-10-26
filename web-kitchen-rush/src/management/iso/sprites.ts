import type { FurnitureKind, Guest, Role } from '../types';

/**
 * Art slots for generated images. Each image is drawn at w×h art pixels (one floor tile is 64×32),
 * with its anchor (ax, ay) placed on the object's floor point. Slots without `src` use the
 * built-in placeholder drawing, so the game stays playable while art is being produced.
 * Character slots face down-right ("front") or up-right ("back"); the renderer mirrors them.
 */
export interface SpriteSlot { src?: string; w: number; h: number; ax: number; ay: number; }

export type Look = Guest['look'];
export type SpriteKey =
  | `furniture.${FurnitureKind}`
  | 'furniture.stool'
  | `guest.${Look}.${'front' | 'back'}`
  | `staff.${Role}.${'front' | 'back'}`
  | 'meal.salad' | 'meal.burger' | 'meal.dirty';

const furniture = (w: number, h: number, ay: number): SpriteSlot => ({ w, h, ax: w / 2, ay });
const person: SpriteSlot = { w: 48, h: 64, ax: 24, ay: 60 };
const meal: SpriteSlot = { w: 24, h: 16, ax: 12, ay: 10 };

export const SPRITES: Record<SpriteKey, SpriteSlot> = {
  'furniture.table': furniture(128, 96, 80), 'furniture.prep': furniture(64, 72, 56), 'furniture.grill': furniture(64, 72, 56),
  'furniture.plant': furniture(64, 72, 56), 'furniture.divider': furniture(64, 112, 96), 'furniture.lamp': furniture(64, 112, 96),
  'furniture.stool': furniture(32, 28, 20),
  'guest.coral.front': person, 'guest.coral.back': person, 'guest.pearl.front': person, 'guest.pearl.back': person,
  'guest.lagoon.front': person, 'guest.lagoon.back': person, 'guest.dusk.front': person, 'guest.dusk.back': person,
  'staff.chef.front': person, 'staff.chef.back': person, 'staff.server.front': person, 'staff.server.back': person,
  'meal.salad': meal, 'meal.burger': meal, 'meal.dirty': meal,
};

const images = new Map<string, HTMLImageElement>();

/** A decoded image for a slot, or null while it loads, fails, or has no art yet. */
export function spriteImage(key: SpriteKey): HTMLImageElement | null {
  const src = SPRITES[key].src;
  if (!src || typeof Image === 'undefined') return null;
  let image = images.get(src);
  if (!image) { image = new Image(); image.decoding = 'async'; image.src = src; images.set(src, image); }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Draws slot art around the current origin. Returns false so callers can fall back to placeholders. */
export function drawSprite(ctx: CanvasRenderingContext2D, key: SpriteKey, flip = false): boolean {
  const image = spriteImage(key); if (!image) return false;
  const slot = SPRITES[key];
  ctx.save(); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -slot.ax, -slot.ay, slot.w, slot.h);
  ctx.restore(); return true;
}
