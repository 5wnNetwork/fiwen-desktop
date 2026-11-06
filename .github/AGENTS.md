# AGENTS.md — GitHub Actions

Run jobs on Windows runners (`windows-*` labels) under native `pwsh`. Native Windows pull-request jobs live in `ci-windows.yml` and Python pull-request jobs in `ci-python.yml`, so each PR workflow can be re-run independently; their checks feed the required `windows checks passed` and `python checks passed` verdicts, as Linux jobs in `ci.yml` feed `all checks passed`; Wine runs Windows Node on hosted Linux only in `ci-master.yml`. Python runtime CI checks Linux/Windows x64 on pull requests and Linux ARM64 plus both macOS architectures on master pushes; releases retain all five targets ([platform policy](workflows/ci-master.yml)). `ci.yml`, `ci-windows.yml`, and `ci-python.yml` are pull-request-only. Master-only platform checks, Linux/Windows self-hosted standbys, and manual runner benchmarks live in `ci-master.yml`, which listens to master pushes and `workflow_dispatch`, not `pull_request`; separating workflow triggers keeps master-only jobs out of PR check panels. The master standbys validate the self-hosted failover targets; preserve the existing per-platform switches (values `selfhosted` for the in-house standbys and `blacksmith` for Blacksmith's hosted runners) and the Dependabot hosted fallback under the `selfhosted` values ([failover runbook](../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md), [blacksmith failover leg note](../.agents/notes/implemented/process/2026-09-09-blacksmith-failover-leg.md)).

The manual [Windows packaging workflow](workflows/windows-package.yml) uses the dedicated self-hosted Windows x64 label `dsh-win-package-trial` under native `pwsh`; preserve this routing separately from the automatic CI lanes.

The upstream merge-policy workflows (`pr-check-on-head-branch.yml`, `pr-check-after-approve.yml`,
`pr-check-on-base-branch.yml`) are removed here. They called
`deepseek-harness/deepseek-harness-check@master` — an action in the upstream organisation that does not
exist for this fork — from `pull_request_target` and `push` runs that hold write tokens and an approval
App key. Branch protection in this repository must not require `Policy / *` checks. Restore them only
together with the action, pinned to a full commit SHA, and add the check names back to the rules.

The manual Desktop publication workflow selects the original successful `package` job attempt independently of `upload-artifact` archival status, then routes each retained build through `DESKTOP_PUBLISH_RUNNERS` to its original machine's unique label. Keep Windows run steps on native PowerShell and Mac run steps on the default POSIX shell; shared entrypoints are Node scripts. Test and production jobs use separate `desktop-test` and `desktop-production` approval Environments after a credential-free preparation job.
