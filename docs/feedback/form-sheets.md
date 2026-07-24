# Form-sheet feedback — euxy Lane Editor (expo-router / react-native-screens)

Notes from debugging the euxy Lane Editor form sheet on 2026-07-23. Written for
people who work on sheets in react-native-screens / expo-router. Everything
below was reproduced on an iOS 26.5 simulator (iPhone 17), new architecture.

**Versions:** expo ~57.0.8 · expo-router ~57.0.8 · react-native 0.86.0 ·
react-native-screens 4.26.2 (installed).

**Setup:** root Stack screen with
`presentation: 'formSheet'`, `sheetGrabberVisible: true`, `headerShown: false`
(no native header anywhere in this repro). The screen renders its own layout:

```tsx
<View style={{ flex: 1 }}>            // root
  <View style={{ height: 13 }} />     // grabber spacer
  <SheetHeader … />                   // Cancel · title · Done row (Pressables)
  <ViewToggle … />                    // segmented row
  <ScrollView style={{ flex: 1 }}>…</ScrollView>
</View>
```

## Bug 1 — formSheet "frame correction" forces a descendant ScrollView to the full sheet frame, covering earlier siblings and swallowing their taps

**Symptom:** the ScrollView's content painted *through/over* the header and
toggle rows, and taps on the header buttons (Cancel/Done) did nothing — they
landed on the ScrollView instead.

**Native frames observed** (via view-hierarchy dump), children of
`RNSSafeAreaViewComponentView` (402×812 sheet):

```
RCTViewComponentView          y=28  h=22   ← Cancel   (laid out correctly)
RCTParagraphComponentView     y=28  h=22   ← title    (correct)
RCTViewComponentView          y=65  h=34   ← toggle   (correct)
RCTScrollViewComponentView    y=0   h=812  ← ScrollView: FULL SHEET, origin 0 (!)
```

Yoga laid everything out correctly; the ScrollView alone was moved. That's
`RNSScreen.mm applyFrameCorrectionForDescendantScrollView` →
`correctScrollViewFrame:` which ends in `[scrollView setFrame:self.frame]` —
i.e. **frame = the whole screen's frame, origin (0,0)**, discarding the scroll
view's Yoga position. The correction exists so a formSheet's scroll view knows
its viewport (PRs #1852 / #1870), but it assumes the scroll view IS the whole
sheet content. With any sibling above it (header, toolbar, segmented control),
the scroll view gets pulled up under them: content overlap + dead buttons
(the scroll view is a later sibling, so it also wins hit-testing).

**Why it only hits sometimes:** the finder only matches a scroll view that is a
*direct child* of `RNSScreenContentWrapper` — or, on iOS 26+, a direct child of
`RNSSafeAreaViewComponentView` (`childRCTScrollViewComponentAndContentContainer`)
— plus a first-subview-chain fallback (`RNSScrollViewFinder`). Normally your
own root `<View>` shields the ScrollView, but **React Native view flattening
can hoist the ScrollView into direct-child position**, which is exactly what
happened here. So the bug appears/disappears based on whether your wrapper
views happen to get flattened — very confusing to debug.

**Workaround that fixed it:** make the wrapper unflattenable so the finder
can't see the ScrollView:

```tsx
<View style={{ flex: 1 }} collapsable={false}>
  <ScrollView style={{ flex: 1 }}>…</ScrollView>
</View>
```

After this, all frames are correct, header buttons receive taps, scrolling
still works (single detent).

**Suggestions:**
- `correctScrollViewFrame` should preserve the scroll view's laid-out origin
  (and subtract it from the height), not assign the screen's full frame.
- Or only apply the correction when the scroll view is the *only* content
  child, which is the case the fix was designed for.
- Or ship the prop the code's own TODO already suggests
  ("Consider adding a prop to control whether we want to look for a scroll
  view here") so screens with chrome above the scroll view can opt out.
- Short term: document the `collapsable={false}` wrapper workaround in the
  formSheet docs — view flattening makes the current behavior nondeterministic
  from the app developer's perspective.

## Bug 2 — mis-layout when dragging between detents

With `sheetAllowedDetents: [0.6, 1.0]`, layout at 0.6 was fine, but after the
user dragged the sheet to the full detent the content and the header rendered
overlapped at the top of the sheet (screenshot captured; consistent with the
frame correction re-running against stale/resized frames on detent change).
With a single detent (`[1.0]`) the resize path never runs and the problem
disappears. Worth re-testing after Bug 1 is fixed — likely the same root
cause surfacing on resize.

## Papercut — grabber has no reserved space

With `sheetGrabberVisible: true` and `headerShown: false`, the native grabber
floats over the app's content; content starts at y=0 under it. Apps have to
hand-reserve ~13pt. It would be nice if the sheet exposed a "grabber inset"
(e.g. via safe area insets inside the sheet, or a documented constant).

## Papercut — synthetic gestures can't drive detents

Simulator automation (mouse-event based drags, e.g. `simctl`-level tooling)
could not move the sheet between detents by dragging the grabber, and taps in
the top drag region are sometimes consumed by the sheet. Real-finger taps work
once Bug 1 is fixed. Only relevant for UI automation, but it makes sheet bugs
like the above hard to reproduce in CI.
