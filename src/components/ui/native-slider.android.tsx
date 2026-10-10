/**
 * NativeSlider (Android) — same props as the community Slider drop-in, but
 * built on the Jetpack Compose Slider directly. The drop-in only forwards the
 * track and thumb tints, so with a `step` Material 3 still paints its default
 * lavender tick marks over the monochrome tracks; this hides them by tinting
 * each tick to the track it sits on.
 */
import type { SliderProps as NativeSliderProps } from '@expo/ui/community/slider';
import { Host, Slider as ComposeSlider } from '@expo/ui/jetpack-compose';

export type { NativeSliderProps };

export function NativeSlider({
  value,
  minimumValue,
  maximumValue,
  lowerLimit,
  upperLimit,
  step,
  disabled,
  inverted,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
  onValueChange,
  style,
}: NativeSliderProps) {
  const min = minimumValue ?? 0;
  const max = maximumValue ?? 1;
  const steps = step && step > 0 ? Math.max(0, Math.round((max - min) / step) - 1) : 0;
  const hostStyle = inverted ? [style, { transform: [{ scaleX: -1 }] }] : style;
  return (
    <Host matchContents={{ vertical: true }} style={hostStyle}>
      <ComposeSlider
        value={value}
        min={min}
        max={max}
        lowerLimit={lowerLimit}
        upperLimit={upperLimit}
        steps={steps}
        enabled={disabled === undefined ? undefined : !disabled}
        colors={{
          thumbColor: thumbTintColor,
          activeTrackColor: minimumTrackTintColor,
          inactiveTrackColor: maximumTrackTintColor,
          activeTickColor: minimumTrackTintColor,
          inactiveTickColor: maximumTrackTintColor,
        }}
        onValueChange={onValueChange}
      />
    </Host>
  );
}
