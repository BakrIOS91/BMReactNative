import { useWindowDimensions } from 'react-native';
import { FontHelper, FontStyleOptions } from './font-helper';
import type { TextStyle } from 'react-native';

/** Hook form of `FontHelper.style` using the current window size. */
export function useFontStyle(): (options?: FontStyleOptions) => TextStyle {
  const screen = useWindowDimensions();
  return (options) => FontHelper.style(screen, options);
}
