export const TILE = 64;
export const COLS = 18;
export const ROWS = 10;
export const W = COLS * TILE;
export const H = ROWS * TILE;

/** Sekunden bis zur automatischen nächsten Welle, nachdem eine Welle komplett gespawnt ist. */
export const WAVE_DELAY = 18;
/** Münzen pro verbleibender Countdown-Sekunde, wenn die Welle früher gerufen wird. */
export const EARLY_BONUS_PER_SEC = 2;
export const SPEEDS = [1, 2, 3] as const;
