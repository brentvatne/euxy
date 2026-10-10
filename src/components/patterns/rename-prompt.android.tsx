/**
 * Rename prompt (Android). `Alert.prompt` is iOS-only, so this is its Material
 * 3 counterpart: an AlertDialog whose body is a TextField prefilled with the
 * current name, Cancel / Rename as text buttons, IME Done commits too. A blank
 * name is a no-op (the store keeps the old one). The dialog is its own window,
 * so the Host it hangs off is zero-sized.
 */
import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import { AlertDialog, Host, Text, TextButton, TextField, useNativeState } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { haptics } from '@/lib/shims';
import { useStore } from '@/state/store';
import type { Pattern } from '@/state/types';
import { color, selection } from '@/theme/tokens';

export function useRenamePrompt() {
  const [target, setTarget] = useState<Pattern | null>(null);
  const promptRename = (pattern: Pattern) => setTarget(pattern);
  const renamePrompt: ReactNode = target ? (
    <RenameDialog key={target.id} pattern={target} onClose={() => setTarget(null)} />
  ) : null;
  return { promptRename, renamePrompt };
}

function RenameDialog({ pattern, onClose }: { pattern: Pattern; onClose: () => void }) {
  const renamePattern = useStore((s) => s.renamePattern);
  const name = useNativeState(pattern.name);
  const commit = (value: string = name.value) => {
    if (value.trim()) {
      haptics.success();
      renamePattern(pattern.id, value);
    }
    onClose();
  };
  return (
    <Host style={styles.host}>
      <AlertDialog
        onDismissRequest={onClose}
        colors={{
          containerColor: color.surface2,
          titleContentColor: color.label,
          textContentColor: color.label2,
        }}
      >
        <AlertDialog.Title>
          <Text>Rename pattern</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <TextField
            value={name}
            autoFocus
            singleLine
            keyboardOptions={{ capitalization: 'words', autoCorrectEnabled: false, imeAction: 'done' }}
            keyboardActions={{ onDone: (value) => commit(value) }}
            textStyle={{ color: color.label, fontSize: 16 }}
            textSelectionColors={{ handleColor: color.label, backgroundColor: selection }}
            colors={{
              focusedTextColor: color.label,
              unfocusedTextColor: color.label,
              focusedContainerColor: color.surface3,
              unfocusedContainerColor: color.surface3,
              cursorColor: color.label,
              focusedIndicatorColor: color.label,
              unfocusedIndicatorColor: color.label4,
            }}
            modifiers={[fillMaxWidth()]}
          >
            <TextField.Placeholder>
              <Text color={color.label4}>
                {pattern.name}
              </Text>
            </TextField.Placeholder>
          </TextField>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={() => commit()} colors={{ contentColor: color.label }}>
            <Text>Rename</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
        <AlertDialog.DismissButton>
          <TextButton onClick={onClose} colors={{ contentColor: color.label3 }}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
      </AlertDialog>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', width: 0, height: 0 },
});
