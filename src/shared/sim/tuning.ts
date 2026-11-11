/**
 * Tunable gameplay numbers for navigation, perception and monster behaviour.
 *
 * EVERYTHING HERE IS A PLAYTEST PROPOSAL, NOT APPROVED DESIGN. The confirmed
 * rules are structural (D-012 shared alerts / private live vision, D-013 one
 * stealth rule set with per-class modifiers, D-014 world + audio cues plus a
 * local attention indicator). The numbers below are first guesses, kept in one
 * inspectable object so a playtest can change them without touching logic.
 *
 * Times are in simulation ticks (30 per second), distances in metres.
 * Angles are stored as cosine / sine pairs because the simulation may only
 * use + - * / and sqrt (see simulation.ts).
 */

/** A fixed rotation step, pre-computed so the simulation needs no trig. */
export interface Rotation {
  /** Degrees per tick, for humans reading this file. */
  degrees: number;
  cos: number;
  sin: number;
}

export interface StealthProfile {
  /** Multiplier on how fast a watcher's attention builds. Lower = harder to notice. */
  visibility: number;
  /** Multiplier on the radius of every noise this actor makes. */
  noise: number;
}

export interface MonsterProfile {
  radius: number;
  walkSpeed: number;
  chaseSpeed: number;
  /** How far it can see inside its view arc. */
  viewRange: number;
  /** Cosine of half the view arc: 0.5 = 120 degree arc. */
  viewHalfArcCos: number;
  /** Sees in every direction this close (it still needs line of sight). */
  proximityRadius: number;
  /** Multiplier on noise radii: 1 = normal ears, 0 = deaf. */
  hearing: number;
  /** A confirmation by this monster is shared with the Dark team as an alert. */
  raisesAlerts: boolean;
  /** Walks to confirmed-sighting alerts raised by other monsters. */
  respondsToAlerts: boolean;
}

export const TUNING = {
  nav: {
    /** Grid cell size for pathfinding. */
    cell: 0.5,
    /** Extra clearance baked into the walkable grid. */
    gridMargin: 0.05,
    /** Extra clearance required when straightening a path. */
    smoothMargin: 0.03,
  },

  hero: {
    speed: 6,
    radius: 0.5,
    /** Speed multiplier while sneaking. Sneaking makes no footstep noise. */
    sneakSpeedFactor: 0.45,
    /** A hero sees all around itself this far, given line of sight. */
    viewRadius: 20,
    /** Radius at which running footsteps can be heard. */
    runNoiseRadius: 7,
    footstepIntervalTicks: 10,
    whistleNoiseRadius: 16,
    whistleCooldownTicks: 120,
  },

  /** D-013: same rules for everyone, only these multipliers differ.
   *  `goblin` and `knight` are illustrations for tests, not approved balance. */
  stealthProfiles: {
    default: { visibility: 1, noise: 1 },
    goblin: { visibility: 0.7, noise: 0.7 },
    knight: { visibility: 1.1, noise: 1.5 },
  } as Record<string, StealthProfile>,

  monsters: {
    scout: {
      radius: 0.7,
      walkSpeed: 3.2,
      chaseSpeed: 5.4,
      viewRange: 14,
      viewHalfArcCos: 0.5,
      proximityRadius: 2,
      hearing: 1,
      raisesAlerts: true,
      respondsToAlerts: false,
    },
    brute: {
      radius: 1.0,
      walkSpeed: 2.6,
      chaseSpeed: 4.4,
      viewRange: 9,
      viewHalfArcCos: 0.5,
      proximityRadius: 2.5,
      hearing: 0.5,
      raisesAlerts: false,
      respondsToAlerts: true,
    },
  } as Record<'scout' | 'brute', MonsterProfile>,

  perception: {
    /** Ticks of full, close-range exposure needed to confirm a sighting. */
    detectTicksClose: 36,
    /** Attention build rate at the edge of view range, relative to point blank. */
    farRateFactor: 0.4,
    /** Ticks for full attention to drain away once sight is broken. */
    decayTicks: 120,
    /** Attention at which a monster stops and investigates what it glimpsed. */
    suspiciousAt: 0.4,
    /** Minimum ticks between two team alerts about the same hero from one monster. */
    alertCooldownTicks: 150,
    /** Evidence older than this is forgotten (and no longer sent to anyone). */
    evidenceLifetimeTicks: 900,
    /** Heard positions are off by up to this much, plus a share of the distance. */
    noiseErrorBase: 0.5,
    noiseErrorPerMetre: 0.15,
    /** A new noise within this many ticks updates the previous report instead of adding one. */
    noiseMergeTicks: 60,
    /** How far a monster's growl or howl carries to heroes. */
    vocalRadius: 26,
  },

  behaviour: {
    patrolPauseMinTicks: 30,
    patrolPauseRangeTicks: 45,
    /** One full guard look-around (left, right, back to centre). */
    guardScanTicks: 120,
    /** Stop and stare at a glimpse or noise before walking to it. */
    noticeTicks: 24,
    investigateLookTicks: 90,
    investigateTimeoutTicks: 450,
    /** While chasing a visible target, re-plan the path this often. */
    repathTicks: 8,
    /** Stop this close to a caught target (no combat exists yet). */
    catchDistance: 1.6,
    /** Give up walking to the last-seen position after this long. */
    lostTimeoutTicks: 300,
    searchPoints: 3,
    searchRadius: 7,
    searchLookTicks: 60,
    searchMaxTicks: 600,
    /** Body turn speed while moving or noticing. */
    turn: { degrees: 8, cos: 0.9902680687415704, sin: 0.13917310096006544 } as Rotation,
    /** Head-sweep speed while looking around. */
    scan: { degrees: 2, cos: 0.9993908270190958, sin: 0.03489949670250097 } as Rotation,
  },

  sites: {
    radius: 1.8,
    gatherTicks: 90,
    respawnTicks: 900,
    /** Opening a cache is audible this far. */
    openNoiseRadius: 9,
  },
};

export type Tuning = typeof TUNING;
