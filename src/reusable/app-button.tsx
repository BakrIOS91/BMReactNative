import type { ReactNode } from 'react';
import { Pressable, StyleProp, Text, TextStyle, View } from 'react-native';
import { useScalingFactor } from '../helpers/device-helper';

export type Position = 'leading' | 'center' | 'trailing';

export interface AppButtonProps {
  title: string;
  onPress?: () => void;
  isDisabled?: boolean;
  titleStyle?: StyleProp<TextStyle>;
  /** Filled: background (default white). Outlined: tint behind the border. */
  backgroundColor?: string;
  /** Outlined only: opacity applied to `backgroundColor` (default 0). */
  backgroundOpacity?: number;
  /** Outlined only (default black). */
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  height?: number;
  horizontalPadding?: number;
  /** Fixed width before scaling; fills the parent when omitted. */
  width?: number;
  shadowColor?: string;
  shadowBlurRadius?: number;
  /** Any node, e.g. an icon element. Its `size` is up to the caller. */
  icon?: ReactNode;
  iconPosition?: Position;
  labelPosition?: Position;
  testID?: string;
}

const justify = { leading: 'flex-start', center: 'center', trailing: 'flex-end' } as const;
const GREY = '#9E9E9E';

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return `#${m[1]}${a}`;
}

function Content({ props, scale, titleStyle }: { props: AppButtonProps; scale: number; titleStyle: StyleProp<TextStyle> }) {
  const { title, icon, iconPosition = 'leading', labelPosition = 'center' } = props;
  const gutter = { paddingHorizontal: 4 * scale };
  const text = <Text style={titleStyle}>{title}</Text>;

  if (icon && iconPosition === 'center') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={[gutter, { alignItems: justify[labelPosition] }]}>{text}</View>
        <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>{icon}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: justify[labelPosition] }}>
      {icon && iconPosition === 'leading' ? <View style={gutter}>{icon}</View> : null}
      <View style={gutter}>{text}</View>
      {icon && iconPosition === 'trailing' ? <View style={gutter}>{icon}</View> : null}
    </View>
  );
}

function BaseButton(props: AppButtonProps & { variant: 'filled' | 'outlined' }) {
  const scale = useScalingFactor();
  const {
    variant,
    onPress,
    isDisabled = false,
    titleStyle,
    height = 50,
    horizontalPadding = 20,
    width,
    shadowColor,
    shadowBlurRadius = 0,
    testID,
  } = props;
  const filled = variant === 'filled';
  const radius = (props.borderRadius ?? 12) * scale;

  const background = filled
    ? isDisabled ? '#E0E0E0' : props.backgroundColor ?? '#FFFFFF'
    : isDisabled ? withAlpha(GREY, 0.1) : props.backgroundColor ? withAlpha(props.backgroundColor, props.backgroundOpacity ?? 0) : undefined;

  const effectiveTitleStyle = isDisabled ? [titleStyle, { color: GREY }] : titleStyle;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: width !== undefined ? width * scale : '100%',
          height: height * scale,
          paddingHorizontal: horizontalPadding * scale,
          borderRadius: radius,
          backgroundColor: background,
          opacity: isDisabled ? (filled ? 0.6 : 0.5) : pressed ? 0.7 : 1,
          ...(filled ? {} : { borderWidth: (props.borderWidth ?? 1.5) * scale, borderColor: isDisabled ? '#BDBDBD' : props.borderColor ?? '#000000' }),
          ...(!isDisabled && shadowBlurRadius > 0
            ? {
                shadowColor: shadowColor ?? '#000000',
                shadowOpacity: shadowColor ? 0.3 : 0.26,
                shadowRadius: shadowBlurRadius * scale,
                shadowOffset: { width: 0, height: 2 * scale },
                elevation: shadowBlurRadius,
              }
            : {}),
        },
      ]}
    >
      <Content props={props} scale={scale} titleStyle={effectiveTitleStyle} />
    </Pressable>
  );
}

/** Apple-style buttons: `AppButton.filled` and `AppButton.outlined`. */
export const AppButton = {
  filled: (props: AppButtonProps) => <BaseButton {...props} variant="filled" />,
  outlined: (props: AppButtonProps) => <BaseButton {...props} variant="outlined" />,
};
