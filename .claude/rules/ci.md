<!-- nf-rulegen:scaffold name=ci by=nf-vibe-coding tpl=1 sha=04b2eb30907b274cefda4c58dc938654312fc9af218e73d74c974c8d96ff2648 -->
# CI/CD facts

Project facts about CI/CD, filled by hand: read the repo's CI config and record what it does — no skill scans it. A re-run appends missing sections and never overwrites an edited one.

## Platform
<!-- nf:section platform -->

- Platform: GitHub Actions
- Config: `.github/workflows/ci.yml` (`npm test`, strict `claude plugin validate` on the plugin and its manifest, and `claude plugin test .` on a pinned Claude Code, on every push and pull request; a remotely disabled mod rollout turns the plugin tests into a warning)

## Deploy triggers
<!-- nf:section deploy-triggers -->

Which push lands where.

- None: no push deploys anything. Directory submission is a manual step in the Claude plugin portal.

## Skip CI
<!-- nf:section skip-ci -->

Which skip string actually works on this platform.

- `[skip ci]`
