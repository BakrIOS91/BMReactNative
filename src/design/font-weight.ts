/**
 * A font weight abstraction used by [FontHelper]. Implement it with a
 * project-wide enum or object exposing a numeric weight (100-900):
 * 100 thin, 200 extra light, 300 light, 400 regular, 500 medium,
 * 600 semi bold, 700 bold, 800 extra bold, 900 black.
 */
export interface FontWeightProtocol {
  readonly weightValue: number;
}

/** Regular (400), used when no weight is passed. */
export const defaultFontWeight: FontWeightProtocol = { weightValue: 400 };

export type RNFontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

/** Converts a numeric weight to the nearest React Native `fontWeight` (clamped to 100-900). */
export function toFontWeight(weight: FontWeightProtocol): RNFontWeight {
  const index = Math.min(8, Math.max(0, Math.trunc(weight.weightValue / 100) - 1));
  return `${(index + 1) * 100}` as RNFontWeight;
}
