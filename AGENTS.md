# Project Agent Instructions

## Permission first

- Treat this project as read-only unless the user has explicitly authorized a specific action.
- A direct request to create, edit, review, test, install, or deploy something authorizes only the action and scope stated in that request. Do not infer approval for additional changes or follow-up actions.
- Before editing, creating, deleting, moving, or formatting project files, explain what you reviewed and what exact changes you propose. Ask for approval unless the user has already explicitly requested those exact changes.
- Do not run tests, install or update dependencies, change configuration, make network requests, commit, push, publish, deploy, or contact external services without explicit authorization for that action.
- Read-only inspection and review are allowed when relevant to the user's request. Avoid commands that may modify project state during inspection.

## Review before action

- First inspect the relevant files, project structure, and existing instructions. For product work, review the relevant requirements and source documents before proposing implementation.
- Report material findings, assumptions, and the intended scope before making a change.
- Keep changes limited to the approved scope. If new work becomes necessary, stop and ask before expanding scope.

## Clarify uncertainty

- If the request, target file, expected behavior, permissions, or acceptance criteria are ambiguous or unclear, pause and ask a concise question before taking dependent action.
- Do not silently invent product requirements or make irreversible choices. State assumptions and ask the user to resolve material uncertainty.
- If no clarification is needed, proceed only within the scope explicitly authorized by the user.

## Completion

- After an authorized change, summarize what changed and where. Report any checks actually performed and their results; do not claim checks that were not run.
- Do not perform extra cleanup or unrelated improvements unless the user approves them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
