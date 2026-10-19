import type { ReactNode } from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useScalingFactor } from '../helpers/device-helper';

export interface ErrorViewProps {
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  message: string;
  messageStyle?: StyleProp<TextStyle>;
  /** Usually an `<Image />`. */
  image: ReactNode;
  /** Rendered under the message, e.g. a retry button. */
  retryButton?: ReactNode;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Standardised error state (no internet, generic failures, …). */
export function ErrorView({ title, titleStyle, message, messageStyle, image, retryButton, backgroundColor, style }: ErrorViewProps) {
  const scale = useScalingFactor();
  return (
    <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 * scale, backgroundColor: backgroundColor ?? '#FFFFFF' }, style]}>
      {image}
      <Text style={[{ textAlign: 'center', marginTop: 20 * scale }, titleStyle]}>{title}</Text>
      <Text style={[{ textAlign: 'center', marginTop: 8 * scale, paddingHorizontal: 8 * scale }, messageStyle]}>{message}</Text>
      {retryButton ? <View style={{ marginTop: 20 * scale }}>{retryButton}</View> : null}
    </View>
  );
}
