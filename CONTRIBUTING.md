# Contributing

## Setup

```bash
nvm use            # Node version from .nvmrc
npm ci
npm run dev
```

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm run build
```

## Conventions

- Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`).
- Keep PRs small. CI must pass before merge.
- Application code lives in `src/`; route files in `src/app/`. Shared UI goes in `src/components/`, helpers in `src/lib/`, shared types in `src/types/`, constants in `src/config/`.
- Next.js here is v16 with breaking changes. Read `node_modules/next/dist/docs/` before using an API (see `AGENTS.md`).
- Label every figure or claim as real SPHEREx data or illustrative. No claimed discoveries.
- Documentation lives in `docs/` (see `docs/README.md`).
