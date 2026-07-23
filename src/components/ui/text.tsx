/**
 * Themed Text — the single text primitive. Picks size/line-height/weight from
 * the type scale and defaults to the primary label color. Pass `variant` for
 * hierarchy, `tone` to shift color, `mono` for byte/hex readouts.
 */
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { color, font, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'danger' | 'connected';

export interface AppTextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  mono?: boolean;
  uppercase?: boolean;
}

const toneColor: Record<Tone, string> = {
  primary: color.label,
  secondary: color.label3,
  tertiary: color.label4,
  disabled: color.labelDisabled,
  danger: color.danger,
  connected: color.connected,
};

export function AppText({
  variant = 'body',
  tone = 'primary',
  mono = false,
  uppercase = false,
  style,
  ...rest
}: AppTextProps) {
  const t = type[variant];
  return (
    <RNText
      style={[
        {
          fontSize: t.size,
          lineHeight: t.line,
          fontWeight: t.weight,
          fontFamily: mono ? font.mono : font.text,
          color: toneColor[tone],
        },
        uppercase && styles.upper,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  upper: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
