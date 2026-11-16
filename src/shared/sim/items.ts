/**
 * Item catalogue for the Orchard Vale contest.
 *
 * EVERYTHING HERE IS A PLAYTEST PROPOSAL, NOT APPROVED DESIGN. D-043 to D-045
 * confirm that Light Heroes acquire and change equipment; the slots, the
 * sample gear and every number below are provisional. The catalogue is shared
 * so the HUD can name and describe exactly what the server simulates, but the
 * client never decides what an item does.
 */

export const GEAR_SLOTS = ['weapon', 'boots', 'charm'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export const ITEM_IDS = ['dagger', 'sling', 'cleaver', 'springheel_boots', 'spiral_charm', 'salve', 'herb'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const QUICK_SLOTS = 3;

/**
 * How a weapon hits.
 *   arc  : everything in a wedge in front of the hero, out to `range`.
 *   line : the first enemy along a narrow line, out to `range`; cover stops it.
 */
export interface WeaponDef {
  pattern: 'arc' | 'line';
  range: number;
  /** arc: cosine of half the wedge angle. */
  halfArcCos: number;
  /** line: half the width of the shot. */
  halfWidth: number;
  damage: number;
  cooldownTicks: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  /** File name (without extension) under public/art/player-hud. */
  icon: string;
  /** gear is worn in a slot; an active is used from a quick slot; a material is only carried. */
  kind: 'gear' | 'active' | 'material';
  slot?: GearSlot;
  weapon?: WeaponDef;
  /** Boots: extra ticks of Evade travel. */
  evadeBonusTicks?: number;
  /** Charm: multiplier on healing received from salves. */
  salveFactor?: number;
  /** Active: health restored by one use. */
  heal?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  dagger: {
    id: 'dagger', name: 'Dagger', icon: 'dagger', kind: 'gear', slot: 'weapon',
    description: 'A quick slash that hits everything close in front of you.',
    weapon: { pattern: 'arc', range: 2.1, halfArcCos: 0.5, halfWidth: 0, damage: 16, cooldownTicks: 16 },
  },
  sling: {
    id: 'sling', name: 'Sling', icon: 'stone', kind: 'gear', slot: 'weapon',
    description: 'A slow, straight shot that hits the first enemy in its path. Cover stops it.',
    weapon: { pattern: 'line', range: 9, halfArcCos: 1, halfWidth: 0.35, damage: 14, cooldownTicks: 30 },
  },
  cleaver: {
    id: 'cleaver', name: 'Cleaver', icon: 'strike', kind: 'gear', slot: 'weapon',
    description: 'A heavy chop with a wide swing.',
    weapon: { pattern: 'arc', range: 2.4, halfArcCos: 0.34, halfWidth: 0, damage: 26, cooldownTicks: 22 },
  },
  springheel_boots: {
    id: 'springheel_boots', name: 'Springheel boots', icon: 'boots', kind: 'gear', slot: 'boots',
    description: 'Evade carries you farther. Walls and water still stop you.',
    evadeBonusTicks: 6,
  },
  spiral_charm: {
    id: 'spiral_charm', name: 'Spiral charm', icon: 'charm', kind: 'gear', slot: 'charm',
    description: 'Salves heal more while you wear it.',
    salveFactor: 1.6,
  },
  salve: {
    id: 'salve', name: 'Salve', icon: 'salve', kind: 'active',
    description: 'Field medicine. Use it from a quick slot to restore health.',
    heal: 30,
  },
  herb: {
    id: 'herb', name: 'Lavender', icon: 'herb', kind: 'material',
    description: 'A carried material. Nothing uses it yet.',
  },
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && Object.hasOwn(ITEMS, value);
}

export function isGearSlot(value: unknown): value is GearSlot {
  return value === 'weapon' || value === 'boots' || value === 'charm';
}

export type Equipment = Record<GearSlot, ItemId | null>;

/** What a hero's current equipment makes its actions do. Derived on demand,
 *  so equipping, swapping and unequipping take effect on the same tick. */
export function weaponOf(equipment: Equipment): WeaponDef | null {
  return (equipment.weapon && ITEMS[equipment.weapon].weapon) || null;
}

export function evadeBonusTicks(equipment: Equipment): number {
  return (equipment.boots && ITEMS[equipment.boots].evadeBonusTicks) || 0;
}

export function salveHeal(equipment: Equipment): number {
  const factor = (equipment.charm && ITEMS[equipment.charm].salveFactor) || 1;
  return Math.round((ITEMS.salve.heal ?? 0) * factor);
}
