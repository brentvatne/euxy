/**
 * EAS fingerprint configuration.
 *
 * Measured 2026-07-28 across the last 20 builds: 9 distinct fingerprints in
 * about two days, and every single transition was caused by .gitignore (8 of
 * 8), .easignore (1) or eas.json (1). Not one came from native code, a
 * dependency, or a config plugin. Our agentic workflows edit .gitignore often,
 * so it churns the fingerprint constantly while changing nothing about the
 * binary.
 *
 * This matters little today — runtimeVersion policy is `appVersion`, so the
 * fingerprint is informational. It matters a lot the day we switch to a
 * `fingerprint` policy, where those 9 fingerprints would have meant 9
 * mutually incompatible runtimes in two days.
 *
 * @type {import('expo/fingerprint').Config}
 */
const config = {
  sourceSkips: [
    // .gitignore is hashed only as a file source (sourcer/Bare.js
    // `bareGitIgnore`) — skipping it does not change WHICH files get hashed.
    // Safe while ios/ and android/ stay uncommitted (currently 0 tracked
    // files each), so no native file is gated by it. See the note at the top
    // of .gitignore, and revisit this if either directory is ever checked in.
    'GitIgnore',
  ],
};

// Candidates deliberately left off — each has caused zero measured churn, so
// none is worth its risk yet:
//
//   ExpoConfigVersions   Skips version / versionCode / buildNumber. Defensible
//                        (a version bump is not a native change) and we use
//                        remote appVersionSource, so only `version` applies.
//                        Enable if version bumps start churning fingerprints.
//   PackageJsonScriptsAll Skips the whole scripts section. Tempting — adding
//                        an npm script cannot change the binary — but it would
//                        also hide a `postinstall` that patches native code.
//   ExpoConfigExtraSection / ExpoConfigEASProject
//                        Low churn, and config plugins can read `extra`.
//
// Do NOT skip: ExpoConfigAssets (icons and splash are baked into the binary
// and we iterate on them), ExpoConfigSchemes (euxy:// is load-bearing for the
// dev client and share links), ExpoConfigAndroidPackage /
// ExpoConfigIosBundleIdentifier, or ExpoConfigAll.
//
// No-ops here: ExpoConfigRuntimeVersionIfString (ours is a policy object) and
// PackageJsonAndroidAndIosScriptsIfNotContainRun (our ios/android scripts do
// contain "run").

module.exports = config;
