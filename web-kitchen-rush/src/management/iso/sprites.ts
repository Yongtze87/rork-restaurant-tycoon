import type { FurnitureKind, Guest, Role } from '../types';
import type { BuildingKind } from '../town';

/**
 * Art slots for generated images. Each image is drawn at w×h art pixels (one floor tile is 64×32),
 * with its anchor (ax, ay) placed on the object's floor point. Slots without `src` use the
 * built-in placeholder drawing, so the game stays playable while art is being produced.
 * Character slots face down-right ("front") or up-right ("back"); the renderer mirrors them.
 * `surface` is how far above the anchor a tabletop sits, so plates land on it.
 */
export interface SpriteSlot { src?: string; w: number; h: number; ax: number; ay: number; surface?: number; }

export type Look = Guest['look'];
export type SpriteKey =
  | `furniture.${FurnitureKind}`
  | 'furniture.stool'
  | 'furniture.table.2' | 'furniture.table.3'
  | `guest.${Look}.${'front' | 'back'}`
  | `staff.${Role}.${'front' | 'back'}`
  | 'meal.salad' | 'meal.burger' | 'meal.dirty'
  | `building.${BuildingKind}.${1 | 2 | 3}`;

const furniture = (w: number, h: number, ay: number): SpriteSlot => ({ w, h, ax: w / 2, ay });
const person: SpriteSlot = { w: 48, h: 64, ax: 24, ay: 60 };
const meal: SpriteSlot = { w: 24, h: 16, ax: 12, ay: 10 };
// Town buildings: one plot is 64 art px wide; tall looks reach about 80 px above the ground.
const building: SpriteSlot = { w: 80, h: 96, ax: 40, ay: 84 };
const buildingSlots = Object.fromEntries((['restaurant', 'kelpFarm', 'fishery', 'homes', 'garden', 'workshop'] as const).flatMap(kind => [1, 2, 3].map(look => [`building.${kind}.${look}`, building]))) as Record<`building.${BuildingKind}.${1 | 2 | 3}`, SpriteSlot>;

export const SPRITES: Record<SpriteKey, SpriteSlot> = {
  'furniture.table': { src: '/art/furniture/table-1.webp', w: 79.5, h: 67.5, ax: 39.8, ay: 64.1, surface: 41 },
  // Upgrade tiers, ready for the progression system.
  'furniture.table.2': { src: '/art/furniture/table-2.webp', w: 79.9, h: 66.8, ax: 39.9, ay: 63.4, surface: 37 },
  'furniture.table.3': { src: '/art/furniture/table-3.webp', w: 92.7, h: 78.5, ax: 46.4, ay: 70.1, surface: 39 },
  'furniture.prep': furniture(64, 72, 56), 'furniture.grill': furniture(64, 72, 56),
  'furniture.plant': furniture(64, 72, 56), 'furniture.divider': furniture(64, 112, 96), 'furniture.lamp': furniture(64, 112, 96),
  'furniture.stool': furniture(32, 28, 20),
  'guest.coral.front': person, 'guest.coral.back': person, 'guest.pearl.front': person, 'guest.pearl.back': person,
  'guest.lagoon.front': person, 'guest.lagoon.back': person, 'guest.dusk.front': person, 'guest.dusk.back': person,
  'staff.chef.front': person, 'staff.chef.back': person, 'staff.server.front': person, 'staff.server.back': person,
  'meal.salad': meal, 'meal.burger': meal, 'meal.dirty': meal,
  ...buildingSlots,
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
