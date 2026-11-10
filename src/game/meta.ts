/** Schwierigkeitsgrade, Sterne-Shop und daraus abgeleitete Spiel-Modifikatoren. */

export type Difficulty = 0 | 1 | 2;
export const DIFFICULTIES: { name: string; short: string; hp: number; coins: number }[] = [
  { name: 'Leicht', short: 'L', hp: 0.75, coins: 1.15 },
  { name: 'Normal', short: 'N', hp: 1, coins: 1 },
  { name: 'Schwer', short: 'S', hp: 1.3, coins: 0.9 },
];

export type PerkId = 'coins' | 'range' | 'damage' | 'lives' | 'cooldown' | 'sell';

export interface PerkDef {
  id: PerkId;
  name: string;
  icon: string;
  /** Beschreibung pro Stufe */
  effect: (lvl: number) => string;
  /** Sternkosten je Stufe */
  costs: number[];
}

export const PERKS: PerkDef[] = [
  { id: 'coins', name: 'Startkapital', icon: '◉', effect: (l) => `+${l * 25} Muscheln zu Beginn`, costs: [2, 3, 4] },
  { id: 'damage', name: 'Harte Schläge', icon: '⚔', effect: (l) => `+${l * 5} % Schaden aller Türme`, costs: [3, 4, 5] },
  { id: 'range', name: 'Scharfe Augen', icon: '◎', effect: (l) => `+${l * 5} % Reichweite aller Türme`, costs: [2, 3, 4] },
  { id: 'cooldown', name: 'Vulkanherz', icon: '☄', effect: (l) => `−${l * 10} % Abklingzeit der Fähigkeiten`, costs: [3, 4] },
  { id: 'lives', name: 'Dicke Mauern', icon: '♥', effect: (l) => `+${l * 3} Leben`, costs: [2, 3] },
  { id: 'sell', name: 'Händler', icon: '⚖', effect: () => 'Verkauf bringt 80 % statt 70 % zurück', costs: [3] },
];

export type Perks = Partial<Record<PerkId, number>>;

export interface Mods {
  hp: number;
  coinsMult: number;
  coinsBonus: number;
  lives: number;
  damage: number;
  range: number;
  cooldown: number;
  sellRatio: number;
}

export const DEFAULT_MODS: Mods = { hp: 1, coinsMult: 1, coinsBonus: 0, lives: 0, damage: 1, range: 1, cooldown: 1, sellRatio: 0.7 };

export function buildMods(difficulty: Difficulty, perks: Perks): Mods {
  const d = DIFFICULTIES[difficulty];
  const p = (id: PerkId) => perks[id] ?? 0;
  return {
    hp: d.hp,
    coinsMult: d.coins,
    coinsBonus: p('coins') * 25,
    lives: p('lives') * 3,
    damage: 1 + p('damage') * 0.05,
    range: 1 + p('range') * 0.05,
    cooldown: 1 - p('cooldown') * 0.1,
    sellRatio: p('sell') ? 0.8 : 0.7,
  };
}

export function perkSpent(perks: Perks): number {
  let n = 0;
  for (const def of PERKS) for (let i = 0; i < (perks[def.id] ?? 0); i++) n += def.costs[i];
  return n;
}
