/**
 * Item catalogue for the Orchard Vale contest.
 *
 * EVERYTHING HERE IS A PLAYTEST PROPOSAL, NOT APPROVED DESIGN. D-043 to D-045
 * confirm that Light Heroes acquire and change equipment; the slots, the
 * sample gear and every number below are provisional. The catalogue is shared
 * so the HUD can name and describe exactly what the server simulates, but the
 * client never decides what an item does.
 *
 * Art: only a handful of painted icons exist. Several items reuse one with a
 * colour shift (`hue`) until they get art of their own.
 */

export const GEAR_SLOTS = ['weapon', 'boots', 'charm'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export const ITEM_IDS = [
  // weapons
  'dagger', 'twin_knives', 'hatchet', 'cudgel', 'billhook', 'sling', 'hand_crossbow', 'cleaver', 'javelin',
  // boots
  'springheel_boots', 'softsole_boots', 'catspaw_boots', 'courier_boots', 'tumbler_boots',
  // charms
  'spiral_charm', 'ironbark_charm', 'thorn_charm', 'dusk_charm', 'whetstone_charm',
  // actives
  'salve', 'apple', 'cheese', 'smoke', 'stone', 'tonic',
  // materials
  'herb', 'coin', 'scroll', 'lockpicks',
] as const;
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
  /** Metres a struck enemy is shoved back (walls still stop it). */
  knockback?: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  /** File name (without extension) under public/art/player-hud. */
  icon: string;
  /** Degrees of hue shift applied to a shared icon. */
  hue?: number;
  /** gear is worn in a slot; an active is used from a quick slot; a material is only carried. */
  kind: 'gear' | 'active' | 'material';
  slot?: GearSlot;
  weapon?: WeaponDef;
  // --- Boots ---
  /** Extra ticks of Evade travel. */
  evadeBonusTicks?: number;
  /** Replaces the sneaking speed factor (default 0.45 of running speed). */
  sneakFactor?: number;
  /** Multiplier on footstep and attack noise. */
  noiseFactor?: number;
  /** Multiplier on running speed. */
  speedFactor?: number;
  /** Multiplier on Evade's recovery time. */
  evadeRecoveryFactor?: number;
  // --- Charms ---
  /** Multiplier on healing received from salves. */
  salveFactor?: number;
  maxHpBonus?: number;
  /** Damage dealt back to anything that strikes the wearer from close by. */
  thorns?: number;
  /** Multiplier on how fast a watcher's attention builds. */
  visibilityFactor?: number;
  /** Multiplier on weapon damage. */
  damageFactor?: number;
  // --- Actives ---
  /** Health restored by one use. */
  heal?: number;
  /** A use that is not healing. */
  use?: 'smoke' | 'lure' | 'haste';
}

const arc = (range: number, halfArcCos: number, damage: number, cooldownTicks: number, knockback?: number): WeaponDef =>
  ({ pattern: 'arc', range, halfArcCos, halfWidth: 0, damage, cooldownTicks, ...(knockback ? { knockback } : {}) });
const line = (range: number, halfWidth: number, damage: number, cooldownTicks: number): WeaponDef =>
  ({ pattern: 'line', range, halfArcCos: 1, halfWidth, damage, cooldownTicks });

const LIST: ItemDef[] = [
  // ---- Weapons -------------------------------------------------------------
  { id: 'dagger', name: 'Dagger', icon: 'dagger', kind: 'gear', slot: 'weapon', weapon: arc(2.1, 0.5, 16, 16),
    description: 'A quick slash that hits everything close in front of you.' },
  { id: 'twin_knives', name: 'Twin knives', icon: 'dagger', hue: 150, kind: 'gear', slot: 'weapon', weapon: arc(1.8, 0.5, 8, 7),
    description: 'Two short blades. Little reach, light cuts, and hardly a pause between them.' },
  { id: 'hatchet', name: 'Hatchet', icon: 'strike', hue: 60, kind: 'gear', slot: 'weapon', weapon: arc(2.0, -0.25, 13, 20),
    description: 'A wide swing that also catches what stands beside you.' },
  { id: 'cudgel', name: 'Cudgel', icon: 'strike', hue: 20, kind: 'gear', slot: 'weapon', weapon: arc(2.2, 0.5, 18, 26, 1.8),
    description: 'A slow, heavy blow that knocks an enemy back.' },
  { id: 'billhook', name: 'Billhook', icon: 'dagger', hue: 40, kind: 'gear', slot: 'weapon', weapon: arc(3.4, 0.9, 24, 30),
    description: 'A long orchard hook. A narrow, far-reaching strike that punishes a miss.' },
  { id: 'sling', name: 'Sling', icon: 'rope', kind: 'gear', slot: 'weapon', weapon: line(9, 0.35, 14, 30),
    description: 'A slow, straight shot that hits the first enemy in its path. Cover stops it.' },
  { id: 'hand_crossbow', name: 'Hand crossbow', icon: 'rope', hue: 200, kind: 'gear', slot: 'weapon', weapon: line(13, 0.25, 30, 66),
    description: 'A hard-hitting bolt at long range, and a long time to reload.' },
  { id: 'cleaver', name: 'Cleaver', icon: 'strike', kind: 'gear', slot: 'weapon', weapon: arc(2.4, 0.34, 26, 22),
    description: 'A heavy chop with a wide swing.' },
  { id: 'javelin', name: 'Javelin', icon: 'dagger', hue: 290, kind: 'gear', slot: 'weapon', weapon: line(8, 0.3, 20, 40),
    description: 'A thrown spear. Straight, strong, and stopped by cover.' },

  // ---- Boots ---------------------------------------------------------------
  { id: 'springheel_boots', name: 'Springheel boots', icon: 'boots', kind: 'gear', slot: 'boots', evadeBonusTicks: 6,
    description: 'Evade carries you farther. Walls and water still stop you.' },
  { id: 'softsole_boots', name: 'Softsole boots', icon: 'boots', hue: 90, kind: 'gear', slot: 'boots', sneakFactor: 0.7,
    description: 'Sneak at a brisk pace, still without a sound.' },
  { id: 'catspaw_boots', name: 'Catspaw boots', icon: 'boots', hue: 200, kind: 'gear', slot: 'boots', noiseFactor: 0.5,
    description: 'Running and fighting carry half as far to listening ears.' },
  { id: 'courier_boots', name: 'Courier boots', icon: 'boots', hue: 320, kind: 'gear', slot: 'boots', speedFactor: 1.1,
    description: 'Run a little faster.' },
  { id: 'tumbler_boots', name: 'Tumbler boots', icon: 'boots', hue: 150, kind: 'gear', slot: 'boots', evadeRecoveryFactor: 0.35,
    description: 'Evade is ready again almost at once.' },

  // ---- Charms --------------------------------------------------------------
  { id: 'spiral_charm', name: 'Spiral charm', icon: 'charm', kind: 'gear', slot: 'charm', salveFactor: 1.6,
    description: 'Salves heal more while you wear it.' },
  { id: 'ironbark_charm', name: 'Ironbark charm', icon: 'charm', hue: 30, kind: 'gear', slot: 'charm', maxHpBonus: 30,
    description: 'Raises the most health you can have.' },
  { id: 'thorn_charm', name: 'Thorn charm', icon: 'charm', hue: 100, kind: 'gear', slot: 'charm', thorns: 5,
    description: 'Whatever strikes you from close by is hurt in return.' },
  { id: 'dusk_charm', name: 'Dusk charm', icon: 'charm', hue: 240, kind: 'gear', slot: 'charm', visibilityFactor: 0.7,
    description: 'Watchers take longer to notice you.' },
  { id: 'whetstone_charm', name: 'Whetstone charm', icon: 'charm', hue: 180, kind: 'gear', slot: 'charm', damageFactor: 1.25,
    description: 'Your weapon bites deeper.' },

  // ---- Actives -------------------------------------------------------------
  { id: 'salve', name: 'Salve', icon: 'salve', kind: 'active', heal: 30,
    description: 'Field medicine. Use it from a quick slot to restore health.' },
  { id: 'apple', name: 'Orchard apple', icon: 'apple', kind: 'active', heal: 10,
    description: 'A mouthful of health.' },
  { id: 'cheese', name: 'Cheese', icon: 'cheese', kind: 'active', heal: 18,
    description: 'A wedge for the road. Restores some health.' },
  { id: 'smoke', name: 'Smoke pot', icon: 'smoke', kind: 'active', use: 'smoke',
    description: 'Monsters nearby lose you, and cannot see you for a few seconds.' },
  { id: 'stone', name: 'Throwing stone', icon: 'stone', kind: 'active', use: 'lure',
    description: 'Lands ahead of you with a clatter that draws monsters to it.' },
  { id: 'tonic', name: 'Quickening draught', icon: 'lamp', kind: 'active', use: 'haste',
    description: 'Run much faster for a few seconds.' },

  // ---- Materials -----------------------------------------------------------
  { id: 'herb', name: 'Lavender', icon: 'herb', kind: 'material', description: 'A carried material. Nothing uses it yet.' },
  { id: 'coin', name: 'Coin', icon: 'purse', kind: 'material', description: 'Personal gold. Nothing sells yet.' },
  { id: 'scroll', name: 'Sealed scroll', icon: 'scroll', kind: 'material', description: 'A message under ribbon. Carried, not yet read.' },
  { id: 'lockpicks', name: 'Lockpicks', icon: 'picks', kind: 'material', description: 'Two slender steel picks. Nothing is locked yet.' },
];

export const ITEMS = Object.fromEntries(LIST.map((def) => [def.id, def])) as Record<ItemId, ItemDef>;

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && Object.hasOwn(ITEMS, value);
}

export function isGearSlot(value: unknown): value is GearSlot {
  return value === 'weapon' || value === 'boots' || value === 'charm';
}

export type Equipment = Record<GearSlot, ItemId | null>;

const worn = (equipment: Equipment, slot: GearSlot): ItemDef | undefined => (equipment[slot] ? ITEMS[equipment[slot]] : undefined);

/**
 * What a hero's worn gear makes it capable of. Derived on demand from the
 * equipment, so equipping, swapping and unequipping take effect at once.
 */
export interface GearStats {
  weapon: WeaponDef | null;
  damageFactor: number;
  evadeBonusTicks: number;
  evadeRecoveryFactor: number;
  /** null = the default sneaking speed. */
  sneakFactor: number | null;
  speedFactor: number;
  noiseFactor: number;
  visibilityFactor: number;
  salveFactor: number;
  maxHpBonus: number;
  thorns: number;
}

export function gearStats(equipment: Equipment): GearStats {
  const boots = worn(equipment, 'boots');
  const charm = worn(equipment, 'charm');
  return {
    weapon: worn(equipment, 'weapon')?.weapon ?? null,
    damageFactor: charm?.damageFactor ?? 1,
    evadeBonusTicks: boots?.evadeBonusTicks ?? 0,
    evadeRecoveryFactor: boots?.evadeRecoveryFactor ?? 1,
    sneakFactor: boots?.sneakFactor ?? null,
    speedFactor: boots?.speedFactor ?? 1,
    noiseFactor: boots?.noiseFactor ?? 1,
    visibilityFactor: charm?.visibilityFactor ?? 1,
    salveFactor: charm?.salveFactor ?? 1,
    maxHpBonus: charm?.maxHpBonus ?? 0,
    thorns: charm?.thorns ?? 0,
  };
}

export function weaponOf(equipment: Equipment): WeaponDef | null {
  return gearStats(equipment).weapon;
}

export function evadeBonusTicks(equipment: Equipment): number {
  return gearStats(equipment).evadeBonusTicks;
}

export function salveHeal(equipment: Equipment): number {
  return Math.round((ITEMS.salve.heal ?? 0) * gearStats(equipment).salveFactor);
}

/** One line saying what an item does, in numbers, for the HUD. */
export function effectText(def: ItemDef): string {
  const w = def.weapon;
  if (w) {
    const shape = w.pattern === 'line' ? `Straight shot · range ${w.range} m` : `${w.halfArcCos < 0 ? 'Wide sweep' : w.halfArcCos > 0.8 ? 'Thrust' : 'Sweep'} · reach ${w.range} m`;
    const rate = Math.round((30 / w.cooldownTicks) * 10) / 10;
    return `${shape} · ${w.damage} damage · ${rate}/s${w.knockback ? ` · knocks back ${w.knockback} m` : ''}`;
  }
  const percent = (factor: number) => `${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)}%`;
  if (def.evadeBonusTicks) return 'Evade distance +67%';
  if (def.sneakFactor) return `Sneak at ${Math.round(def.sneakFactor * 100)}% of running speed`;
  if (def.noiseFactor) return `Noise ${percent(def.noiseFactor)}`;
  if (def.speedFactor) return `Running speed ${percent(def.speedFactor)}`;
  if (def.evadeRecoveryFactor) return `Evade recovery ${percent(def.evadeRecoveryFactor)}`;
  if (def.salveFactor) return `Salve healing ${percent(def.salveFactor)}`;
  if (def.maxHpBonus) return `Maximum health +${def.maxHpBonus}`;
  if (def.thorns) return `Returns ${def.thorns} damage`;
  if (def.visibilityFactor) return `Noticed ${percent(def.visibilityFactor)} as fast`;
  if (def.damageFactor) return `Weapon damage ${percent(def.damageFactor)}`;
  if (def.heal) return `Restores ${def.heal} health`;
  if (def.use === 'smoke') return 'Breaks pursuit · unseen for 3 s';
  if (def.use === 'lure') return 'Noise 9 m ahead';
  if (def.use === 'haste') return 'Speed +35% for 6 s';
  return 'Material';
}
