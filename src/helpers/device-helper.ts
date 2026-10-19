import { useWindowDimensions } from 'react-native';

const DEFAULT_REFERENCE_WIDTH = 440;
const TABLET_SHORTEST_SIDE = 600;
const TABLET_SCALE = 1.5;
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.1;

/**
 * Holds the design baseline width (default 440, like an iPhone 16 Pro Max).
 * Register a different one once at startup if your design uses another.
 */
export class DeviceRegistry {
  private static width = DEFAULT_REFERENCE_WIDTH;

  static registerReferenceWidth(width: number): void {
    DeviceRegistry.width = width;
  }

  static get referenceWidth(): number {
    return DeviceRegistry.width;
  }

  static reset(): void {
    DeviceRegistry.width = DEFAULT_REFERENCE_WIDTH;
  }
}

export interface ScreenSize {
  width: number;
  height: number;
}

export class DeviceHelper {
  /**
   * Scaling factor relative to the registered reference width: clamped to
   * [0.9, 1.1] on phones and fixed at 1.5 when the shortest side is 600 or more
   * (tablets).
   */
  static getScalingFactor({ width, height }: ScreenSize): number {
    if (Math.min(width, height) >= TABLET_SHORTEST_SIDE) return TABLET_SCALE;
    const scale = width / DeviceRegistry.referenceWidth;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }
}

/** Scaling factor for the current window; re-renders on rotation / resize. */
export function useScalingFactor(): number {
  return DeviceHelper.getScalingFactor(useWindowDimensions());
}

/** Returns `scaleValue(n)` = `n * scalingFactor` for sizes, spacing and radii. */
export function useScaleValue(): (value: number) => number {
  const scale = useScalingFactor();
  return (value) => value * scale;
}
