/** Rooftop palette shared by wardrobe swatches and the procedural clothing materials. */
export const OUTFIT_COLORS = [
  { id: 'cream', name: 'Cream', hex: '#FFF2D7', swatch: 'bg-paper text-ink' },
  { id: 'tomato', name: 'Tomato', hex: '#DC533C', swatch: 'bg-tomato text-paper' },
  { id: 'teal', name: 'Teal', hex: '#3B9C98', swatch: 'bg-[#3B9C98] text-ink' },
  { id: 'gold', name: 'Gold', hex: '#F2B743', swatch: 'bg-gold text-ink' },
  { id: 'apricot', name: 'Apricot', hex: '#F0AB70', swatch: 'bg-[#F0AB70] text-ink' },
  { id: 'dusk', name: 'Dusk', hex: '#526579', swatch: 'bg-[#526579] text-paper' },
] as const;
export type OutfitColor = typeof OUTFIT_COLORS[number]['id'];
export type OutfitPart = 'hat' | 'apron';
export interface ChefOutfit { hat: OutfitColor; apron: OutfitColor; }
export type ChefOutfits = [ChefOutfit, ChefOutfit];
export const DEFAULT_OUTFIT: Readonly<ChefOutfit> = { hat: 'cream', apron: 'cream' };

/** Accept only palette identifiers, never arbitrary persisted CSS or material values. */
export function isOutfitColor(value: unknown): value is OutfitColor {
  return OUTFIT_COLORS.some(color => color.id === value);
}
export function outfitColor(id: OutfitColor): typeof OUTFIT_COLORS[number] {
  return OUTFIT_COLORS.find(color => color.id === id) ?? OUTFIT_COLORS[0];
}
/** Each player and each garment recovers independently from missing/corrupt storage. */
export function cleanOutfits(value: unknown): ChefOutfits {
  const clean = (entry: unknown): ChefOutfit => {
    const outfit = entry && typeof entry === 'object' ? entry as Partial<ChefOutfit> : {};
    return { hat: isOutfitColor(outfit.hat) ? outfit.hat : 'cream', apron: isOutfitColor(outfit.apron) ? outfit.apron : 'cream' };
  };
  return [clean(Array.isArray(value) ? value[0] : null), clean(Array.isArray(value) ? value[1] : null)];
}
