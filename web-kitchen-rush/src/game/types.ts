import type { ChefOutfits } from './chef-outfit';

/** Serializable cooking domain and mutable simulation state. */
export type Mode = 'solo' | 'coop';
export type Recipe = 'salad' | 'burger';
export type Ingredient = 'lettuce' | 'tomato' | 'patty' | 'bun';
export type FoodState = 'raw' | 'chopped' | 'cooked' | 'burnt';
export type Item = { kind: Ingredient; state: FoodState } | { kind: 'plate'; parts: string[] } | { kind: 'dirty' } | { kind: 'extinguisher' };
export type StationKind = Ingredient | 'board' | 'counter' | 'grill' | 'sink' | 'plates' | 'serve' | 'dirty' | 'trash' | 'extinguisher';
export interface Station { id: string; kind: StationKind; x: number; z: number; item: Item | null; progress: number; heat: number; fire: number; }
/** Transient successful-action cue, separate from saved progress and HUD snapshots. */
export interface ChefActionEffect { id: number; kind: 'place' | 'wash' | 'chop'; chefId: number; stationId: string; x: number; z: number; startedAt: number; ingredient?: Ingredient; cutIndex?: number; item?: Item; }
export interface Chef { id: number; x: number; z: number; facing: number; held: Item | null; near: string | null; moving: boolean; working: boolean; dash: number; cooldown: number; }
export interface Order { id: number; recipe: Recipe; remaining: number; duration: number; }
/** Simulation-second tuning for scheduled arrivals and each new guest's patience. */
export interface ServicePace { readonly arrivalSeconds: number; readonly patienceSeconds: number; }
export interface Shift { name: string; subtitle: string; description: string; thresholds: [number, number, number]; service: Readonly<Record<Mode, ServicePace>>; }
export interface Results { score: number; orderPoints: number; tips: number; penalties: number; served: number; missed: number; stars: number; level: number; mode: Mode; newBest: boolean; unlocked: boolean; }
export interface Progress { solo: number[]; coop: number[]; }
export interface GameState { phase: 'menu' | 'briefing' | 'playing' | 'results'; mode: Mode; level: number; practice: boolean; paused: boolean; time: number; elapsed: number; score: number; combo: number; orderPoints: number; tips: number; penalties: number; served: number; missed: number; orders: Order[]; stations: Station[]; chefs: Chef[]; plates: number; dirty: number; returns: number[]; nextOrder: number; nextId: number; message: string; messageKind: 'info' | 'service'; messageTime: number; tutorial: number; results: Results | null; progress: Progress; progressSaveFailed: boolean; outfits: ChefOutfits; outfitSaveFailed: boolean; revision: number; sound: boolean; music: boolean; }
export interface PlayerInput { x: number; y: number; pick: boolean; work: boolean; dash: boolean; }
export type SoundEvent = 'pick' | 'chop' | 'wash' | 'serve' | 'miss' | 'fire' | 'dash';
