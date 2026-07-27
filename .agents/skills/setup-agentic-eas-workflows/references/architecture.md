# Architecture and trigger selection

## Trust boundary

```text
Untrusted event or report
        |
        v
Trusted trigger gate ---- rejects actor/repo/branch/state mismatch
        |
        v
Deterministic wrapper ---- fetches/redacts context; owns secrets and writes
        |
        +----> Coding agent (minimal environment, no publishing authority)
        |
        +----> Tests and EAS Simulator verification
        |
        v
Protected-path check ---- rejects automation/prompt/credential changes
        |
        v
Issue -> workflow link -> branch -> PR (`Closes #N` for fixes) -> independent readback
```

The agent is a proposal engine, not the security boundary. The wrapper decides what context the agent sees, which edits may be published, and whether verification is sufficient.

## Trigger decision table

| Event | Preferred control plane | Reason |
| --- | --- | --- |
| App Store Connect crash or screenshot feedback | EAS Workflow | Native event context and EAS environment secrets |
| Push, PR, schedule, or manual run supported by EAS | EAS Workflow | Fewer cross-system credentials |
| GitHub review `changes_requested` | Thin GitHub Action -> EAS dispatch | GitHub provides the event; agent and write credentials remain on EAS |
| GitHub issue/comment with built-in token sufficient | GitHub Actions or thin dispatch | Built-in token can isolate writes to the repository |
| Untrusted fork PR | Trusted base workflow only | Never execute or expose secrets to fork code |

## Thin GitHub dispatcher

A dispatcher should:

- use `permissions: {}` unless it needs a GitHub API read;
- gate on immutable event fields and a small allowlist;
- pass identifiers such as PR and review IDs, not free-form shell fragments;
- dispatch a trusted EAS `gitRef`, normally the base SHA;
- hold only an Expo dispatch token;
- never run the coding agent or receive the agent's GitHub write token.

## Credential placement

| Credential | Store | Expose to |
| --- | --- | --- |
| Claude/Codex subscription credential | EAS or GitHub secret for the chosen worker | Agent subprocess only |
| Robot `EXPO_TOKEN` | EAS environment secret; GitHub secret only for GitHub-hosted workers | Simulator wrapper, then agent only after the trust gate |
| GitHub write PAT | EAS environment secret | Deterministic GitHub wrapper, never the agent |
| GitHub Actions `GITHUB_TOKEN` | Ephemeral built-in | Deterministic wrapper; scope with workflow `permissions` |
| GitHub read observer | Separate secret/session when the repo is private | Independent post-write verifier only |

For a machine user that is an outside or repository collaborator, GitHub currently requires a classic PAT for repository writes. Scope it to the minimum practical classic scope, add an expiry, and keep the machine account's repository access narrow. A GitHub App is preferable when the automation expands beyond a small number of repositories.
