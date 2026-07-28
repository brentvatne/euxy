# Security checklist

## Event and source trust

- [ ] Gate actor, event type/state, repository, head repository, and base
      revision. Require a branch prefix for automation-created branches; for
      trusted commands on ordinary PRs, revalidate the immutable comment and
      require an allowlisted PR author.
- [ ] Do not treat a repository-wide identity such as `github-actions[bot]` as
      an ordinary trusted PR author; prefix-gate any intentional exception.
- [ ] Check out a trusted base SHA before running repository scripts.
- [ ] Pass untrusted text through environment variables or files, never shell interpolation.
- [ ] Deduplicate events with a stable source key and serialize work per issue/PR.
- [ ] Exhaust paginated comment/review history up to a hard cap, then fail
      closed rather than authorizing or selecting context from a truncated list.
- [ ] Cap autonomous retry and review-response loops.
- [ ] For external feedback, create the issue but stop before remediation until
      an allowlisted maintainer authors the exact bot-addressed approval command.
- [ ] Validate the immutable comment-author login and exact command in both the
      GitHub trigger and the runner; do not authorize based on text that merely
      claims to come from a maintainer.

## Credentials

- [ ] Use separate robot accounts for GitHub and Expo where practical.
- [ ] Prefer an established, verified GitHub machine user; newly created personal accounts may be automatically visibility-restricted.
- [ ] Confirm the machine user's public profile is visible before relying on it.
- [ ] Verify token identity using the provider's authenticated-user endpoint.
- [ ] Verify repository permission independently from token scopes.
- [ ] Run a disposable write plus independent readback before installing the token in production workflows.
- [ ] Treat HTTP 201 followed by public 404, hidden list entries, or count/list mismatches as a failed account bootstrap.
- [ ] Stop retries and use GitHub's appeal process if writes are suppressed; repeated hidden writes create noise without proving recovery.
- [ ] Store secrets in the exact EAS environment (`preview` or `production`) or GitHub secret store.
- [ ] Give the agent a minimal allowlist of environment variables.
- [ ] Keep GitHub publishing credentials in deterministic code outside the agent.
- [ ] Never print tokens, request headers, full environments, or secret-bearing subprocess errors.
- [ ] Redact provider tokens from captured logs.
- [ ] Add expiration and rotation notes for long-lived PATs.

## Supply chain and self-modification

- [ ] Pin Actions by immutable commit SHA.
- [ ] Pin CLIs, runtimes, and plugins by exact versions.
- [ ] Pin remote skill/plugin repositories by commit and verify the checked-out SHA.
- [ ] Assert required skill files exist before starting the agent.
- [ ] Protect `.github/workflows/`, agent scripts, `.eas/`, automation prompts, and review configuration from agent-authored diffs.
- [ ] Use lockfiles and frozen dependency installation.

## Privacy

- [ ] Redact tester email, screenshots, App Store Connect URLs, crash logs, device details, and private analysis before creating public resources.
- [ ] Put a useful, neutral problem summary and stable feedback ID in the GitHub
      issue without identifying the tester.
- [ ] Run public intake text through an isolated no-tools summarizer and a fresh
      no-tools safety rewrite; deterministically reject prompt-injection,
      profanity, threats, harassment, mentions, links, contact details,
      Markdown, and secret-like output.
- [ ] Fall back to a generic review issue when public-safe summarization fails;
      never publish the raw report as the fallback.
- [ ] Keep raw reports and the complete raw simulator artifact set in private
      workflow artifacts.
- [ ] Publish only explicitly selected, project-approved simulator evidence;
      before/after captures are appropriate when the simulated app contains no
      sensitive data. Validate
      fixed filenames, regular files, magic bytes, dimensions, size, host, and
      exact unauthenticated public readback.
- [ ] Never publish tester screenshots, crash details, logs, private URLs, or
      simulator session credentials as review evidence.
- [ ] Do not let model output choose labels, assignees, reviewers, or external recipients without validation.

## Publishing and verification

- [ ] Require successful focused tests and static checks.
- [ ] Require simulator verification when the change is UI/interaction-sensitive and the service is available.
- [ ] Create/find the tracking issue before the PR.
- [ ] Link the issue to the active workflow and the PR back to the issue.
- [ ] Handle GitHub 422 idempotently by finding an existing open PR for the same head.
- [ ] Treat a returned 201 as provisional.
- [ ] Independently fetch the created resource before announcing success.
- [ ] For public repos, verify without credentials; for private repos, verify with a distinct read-only identity.
- [ ] Fail if the returned author, URL, repository, head, or base differs.

## Cleanup and cost

- [ ] Stop EAS Simulator in an always-run/finally path.
- [ ] Cap simulator duration and agent iterations.
- [ ] Close smoke-test issues/PRs and delete temporary branches.
- [ ] Upload only intentionally selected artifacts.
- [ ] State paid EAS compute and simulator effects before live runs.
