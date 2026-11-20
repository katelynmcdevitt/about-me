# Local development only

The user wants this project to remain local. Do not publish, deploy, or synchronize source to ChatGPT Sites or another hosting provider unless the user explicitly requests it.

The existing `.openai/hosting.json` identifies an earlier hosted copy. Retain it for identification only; it does not authorize deployment.

# Review and tests before commits

Before creating a commit, use separate subagents when available:

- Ask a review agent to examine the proposed commit for bugs, regressions, data loss, and security or accessibility issues. The reviewer should report actionable findings and affected files without making edits.
- Ask a test agent to assess coverage and add or update meaningful tests for changed behavior when appropriate. Tests should exercise observable behavior and protect against regressions; do not add tests merely to satisfy a count or for trivial visual or documentation changes.
- Resolve relevant findings and incorporate useful tests before committing. Run `npm run test:coverage` (which runs the test suite) and `npm run typecheck`, plus any other checks appropriate to the changes. Include the coverage summary and any relevant gaps in the commit response; include relevant files from the unloaded-source list, and explain that the percentages cover loaded files only and may be inaccurate for dynamically transpiled TypeScript. If a check or agent is unavailable, report that limitation rather than claiming it ran.
- Review the final staged changes after fixes and tests. Keep user data and local databases out of commits.

These instructions apply to Codex-driven commits. They do not automatically run for commits made outside Codex; local Git hooks or other tooling would be needed for automated checks on those commits.
