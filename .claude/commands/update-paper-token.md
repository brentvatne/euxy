---
description: Re-capture the local Paper session and overwrite the CI secret used by EAS Workflows
argument-hint: "[environment ...] (default: preview)"
allowed-tools: Bash(bash .claude/skills/paper-mcp-in-eas-workflows/scripts/refresh-token.sh:*), Bash(PAPER_ALLOW_RESTART=1 bash .claude/skills/paper-mcp-in-eas-workflows/scripts/refresh-token.sh:*), Bash(node .claude/skills/paper-mcp-in-eas-workflows/scripts/cdp.mjs expiry), Bash(pgrep -x Paper), Bash(eas env:list:*)
---

Refresh the Paper session secret that `.eas/workflows/*` uses to bring up Paper
MCP on a Linux runner. Background and gotchas: the `paper-mcp-in-eas-workflows`
skill.

Requested environments: `$ARGUMENTS` (treat empty as `preview`).

## Do this

1. **Validate the arguments before building any command.** Accept only the exact
   words `production`, `preview`, or `development`, separated by whitespace. Do
   not pass `$ARGUMENTS` through to a shell — it is untrusted text, and shell
   metacharacters in it would otherwise run as commands alongside a script that
   handles a live credential. If anything else appears, stop and tell the user
   which token you rejected.

2. Run the refresh with the validated names as literal arguments — for example,
   for `preview production`:

   ```bash
   bash .claude/skills/paper-mcp-in-eas-workflows/scripts/refresh-token.sh preview production
   ```

   The script re-checks the names against the same allowlist and refuses
   anything else, but that is a backstop, not a substitute for step 1.

3. **If it stops because Paper is running without a DevTools port**, do not
   restart Paper yourself. Tell the user their Paper needs to restart — Electron's
   single-instance lock means the flag is dropped otherwise — and offer the
   opt-in:

   ```bash
   PAPER_ALLOW_RESTART=1 bash .claude/skills/paper-mcp-in-eas-workflows/scripts/refresh-token.sh preview
   ```

   (substituting the validated environment names)

   Wait for them to choose. Restarting someone's editor is their call, and it
   reopens whatever file was last open.

4. **If it stops because no document is open**, ask the user to open the file the
   runner should see, then re-run. The capture records that file's URL, and the
   MCP server returns HTTP 500 `Could not find Paper. Is it running?` without a
   document.

5. Report the new expiry date the script prints, and how many days that is.

## Then tell the user

- The expiry date, plainly. It is a rolling ~34-day window that refreshes as they
  use Paper locally, but the CI copy is a frozen snapshot and dies ~34 days after
  capture regardless.
- That they can check any time with:
  `node .claude/skills/paper-mcp-in-eas-workflows/scripts/cdp.mjs expiry`
- If the script launched Paper itself, that Paper now has a DevTools port open on
  9222 and is worth quitting and reopening normally.

## Notes

- The script removes the captured session from disk on every exit path. Do not
  copy it elsewhere, and never print the secret value or the base64 blob.
- It overwrites in place and prunes stale higher-numbered chunks, so a session
  that shrank between refreshes cannot leave a leftover chunk that corrupts the
  reassembled JSON on the runner.
- `secret` visibility is required: the 32 KiB cap applies only to secrets, and
  other visibilities cap at 4 KiB, which a capture can exceed.
