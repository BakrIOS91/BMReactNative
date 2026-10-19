import { Pressable, StyleProp, Text, TextStyle } from 'react-native';
import { FontKey, FontRegistry } from '../design/font-helper';
import { useFontStyle } from '../design/use-font-style';

export interface UnderlinedButtonProps {
  title: string;
  onPress: () => void;
  /** Overrides the default design-system style. */
  style?: StyleProp<TextStyle>;
  /** Default text colour when `style` is omitted. */
  color?: string;
}

/** Underlined text button with iOS-style opacity feedback and no ripple. */
export function UnderlinedButton({ title, onPress, style, color }: UnderlinedButtonProps) {
  const fontStyle = useFontStyle();
  let base: StyleProp<TextStyle> = style;
  if (!base) {
    // Fall back to a plain style when no font is registered rather than throwing from a leaf button.
    try {
      FontRegistry.getFont(FontKey.primary);
      base = fontStyle({ size: 14, ...(color ? { color } : {}) });
    } catch {
      base = { fontSize: 14, ...(color ? { color } : {}) };
    }
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.3 : 1 })}>
      <Text style={[base, { textDecorationLine: 'underline' }]}>{title}</Text>
    </Pressable>
  );
}
