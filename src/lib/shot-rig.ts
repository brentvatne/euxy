/**
 * Screenshot rig — stages app states for App Store captures on a simulator,
 * driven from the HOST with zero synthetic taps. Deep links hit the
 * "Open in euxy?" dialog and RN's Settings/NSUserDefaults module proved
 * unreliable under the new architecture, so the transport is the app's own
 * expo-sqlite kv-store (the persistence database), which the host can write
 * directly while the app is terminated:
 *
 *   DB=$(xcrun simctl get_app_container <udid> dev.brent.euxy data)/Documents/SQLite/ExpoSQLiteStorage
 *   sqlite3 "$DB" "insert or replace into storage (key, value) values
 *     ('shotRig', '{\"pattern\":\"Four on the Floor\",\"play\":1}');"
 *   xcrun simctl launch <udid> dev.brent.euxy
 *
 * The key is consumed at launch so normal launches stay normal. Config:
 * pattern (name) · screen (router path) · editor (open lane 1 in the
 * editor) · play · temp. Staging uses the same store actions the UI calls.
 * `shotRigDebug` is written every launch (host-readable health check).
 */
import { useEffect } from 'react';
import { router } from 'expo-router';

import { useStore } from '@/state/store';

type Kv = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
};

export function useShotRig() {
  useEffect(() => {
    let kv: Kv | null = null;
    try {
      // Same guarded require pattern as state/persistence.ts (native dep).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      kv = require('expo-sqlite/kv-store').default as Kv;
    } catch {
      return;
    }
    let raw: string | null = null;
    try {
      raw = kv.getItemSync('shotRig');
      kv.setItemSync('shotRigDebug', `saw:${raw === null ? 'null' : raw.length}`);
    } catch {
      return;
    }
    if (!raw) return;
    kv.removeItemSync('shotRig');
    let cfg: {
      pattern?: string;
      screen?: string;
      editor?: number;
      play?: number;
      temp?: number;
    };
    try {
      cfg = JSON.parse(raw);
    } catch {
      return;
    }
    // Stage after the boot handoff + sequencer mount (engine.init runs
    // there; play before init would tick into nothing).
    setTimeout(() => {
      const s = useStore.getState();
      const target = cfg.pattern ? s.patterns.find((p) => p.name === cfg.pattern) : null;
      if (target && target.id !== s.activePatternId) s.loadPattern(target.id);
      if (cfg.screen) setTimeout(() => router.push(cfg.screen as never), 400);
      if (cfg.editor) {
        setTimeout(() => {
          const st = useStore.getState();
          const lane = st.patterns.find((p) => p.id === st.activePatternId)?.lanes[0];
          if (lane) {
            st.selectLane(lane.id);
            router.push('/lane-editor');
          }
        }, 600);
      }
      if (cfg.play) setTimeout(() => useStore.getState().play(), 800);
      if (cfg.temp) setTimeout(() => useStore.getState().armSnapshot(), 1000);
    }, 1200);
    // One-shot at launch by design.
  }, []);
}
