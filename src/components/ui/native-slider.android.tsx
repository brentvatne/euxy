/**
 * NativeSlider (Android) — same props as the community Slider drop-in, but
 * built on the Jetpack Compose Slider directly. The drop-in only forwards the
 * track and thumb tints, so with a `step` Material 3 still paints its default
 * lavender tick marks over the monochrome tracks; this hides them by tinting
 * each tick to the track it sits on.
 *
 * The Host gets a fixed height (Material's 48dp touch target) rather than
 * `matchContents`: with matchContents inside an Android form sheet, the
 * ScrollView around the sliders never scrolled and the sheet did not expand.
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
    <Host style={[{ height: 48 }, hostStyle]}>
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
