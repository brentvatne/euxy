/**
 * NativeSlider — the app's monochrome slider. iOS (and anything else) is
 * @expo/ui's community Slider drop-in as-is; `native-slider.android.tsx`
 * reaches past that wrapper so Material 3's tick marks can be tinted too.
 */
export { Slider as NativeSlider } from '@expo/ui/community/slider';
export type { SliderProps as NativeSliderProps } from '@expo/ui/community/slider';
