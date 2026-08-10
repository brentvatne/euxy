# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Pull requests from Expo sandbox sessions

When a task used the Expo Sandbox MCP, create the PR with the sandbox's own
`github_create_pr` tool — NOT the GitHub MCP. Pass the structured fields
(title / whatChanged / why / howToVerify) and attach simulator captures as
`evidence` (before-and-after pairs from `simulator_screenshot` /
`simulator_record`), so the PR carries server-attested proof of verification.

Gotcha: the tool publishes only changes present in the sandbox working tree
relative to its HEAD. If the branch was already pushed from outside the
sandbox, `git reset <base>` inside the sandbox (keeping the working tree)
before calling it, or it fails with "No changes to publish".
