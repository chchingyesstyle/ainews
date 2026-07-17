# AI News project documentation design

## Objective

Bring the repository's entry-point documentation in line with the deployed Cloudflare application and give both human contributors and coding agents a reliable operating guide.

## Audience and file responsibilities

### `README.md`

The README is the public project overview for users, operators, and new contributors. It will:

- describe the live zh-HK AI news site and link to `https://ainews.cchk.uk`;
- summarize the Cloudflare Worker, Workers AI, D1, Cron, RSS/Atom, and GDELT architecture;
- explain the daily ingestion, validation, summarization, digest, and publication flow;
- document local setup, database migrations, tests, build, deployment, and manual refresh at a safe level;
- list public routes and link to `docs/operations.md` for detailed production procedures;
- state the editorial, copyright, AI-disclosure, and secret-handling rules;
- remove stale statements that the production D1 ID and deployment are still pending.

### `AGENTS.md`

The root AGENTS file is the working contract for coding agents and contributors. It will:

- describe the important directories and module boundaries;
- record the required Hong Kong Traditional Chinese, neutral, source-grounded editorial behavior;
- explain the pipeline invariants, including bounded ingestion, per-story failure isolation, output validation, and partial digest fallback;
- define the standard local verification commands;
- require focused changes, relevant regression tests, and preservation of unrelated worktree changes;
- prohibit committing PATs, Cloudflare tokens, admin secrets, `.dev.vars`, or credentials from shell startup files;
- require production mutations to be intentional and verified, and temporary admin secrets to be removed immediately after use;
- point to `README.md` and `docs/operations.md` instead of duplicating long operational instructions.

### `docs/operations.md`

The existing operations guide remains the canonical source for detailed D1, source, secret, Cron, health-check, GitHub Actions, and custom-domain procedures. This task will not restructure that document unless a directly conflicting statement must be corrected.

## Content and style

Both root documents will use concise Hong Kong Traditional Chinese with English technical identifiers where they improve precision. Commands must match `package.json` and `wrangler.jsonc`. Examples must use placeholders or environment-variable references and must never contain real credentials.

The README will favor onboarding and understanding. AGENTS.md will favor explicit, testable instructions. Repeated details will be replaced with links so that operational guidance has one canonical home.

## Verification

Implementation is complete when:

1. `README.md` accurately describes the deployed application, current model binding, D1-backed content, daily 06:00 UTC schedule, and available scripts.
2. `AGENTS.md` exists at the repository root and contains actionable repository, editorial, testing, security, and Cloudflare-operation guidance.
3. Every referenced local path and npm script exists.
4. A secret-pattern scan finds no credentials in the new documentation.
5. Markdown has no placeholders such as `TBD` or `TODO`, and `git diff --check` passes.

No application behavior, schema, deployment binding, or production data will be changed by this documentation task.
