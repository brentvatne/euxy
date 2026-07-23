// Route is thin: Metro resolves screen.web.tsx (minimal MIDI tester) on web and
// screen.tsx (the single-lane PoC) on native. Route files can't use platform
// extensions, so the split lives in the component.
import Screen from '@/components/screen';

export default function Index() {
  return <Screen />;
}
