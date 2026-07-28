/**
 * Claim a decoded share payload for import once per mounted receipt sheet.
 *
 * Expo Router can reuse the mounted route when a second link changes `d`, so a
 * component-lifetime boolean would silently drop every payload after the first.
 */
export function claimSharedPatternPayload(
  importedPayloads: Set<string>,
  payload: unknown,
): payload is string {
  if (
    typeof payload !== 'string' ||
    !payload ||
    importedPayloads.has(payload)
  ) {
    return false;
  }

  importedPayloads.add(payload);
  return true;
}
