# tenet-skills agent notes

## Architecture diagram

`docs/architecture.json` is the Archify spec for the system overview
(orchestrator, toolchain pass, dimension subagents, the audit path, the
agent-session and audited-repo boundaries, the Tenet Dashboard and static
analyzers), with file:line sources pinned to a commit. If a change adds,
removes, or rewires a top-level component, external service, trust boundary,
or the deploy shape, update the spec after committing it: re-pin
`meta.repository.revision` to that commit, fix the affected nodes, edges, and
sources, re-render with the `archify` skill (`finalize ... --repo-root .`), and
commit the spec. Internal refactors and shifted line numbers don't need it.
Rendered HTML goes in `.archify/` (gitignored).
