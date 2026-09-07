# Development

Notes for contributors and anyone building **poyraz-cli** from source.

## Prerequisites

- Node.js **20+**
- npm (or a compatible client)

## Setup

```bash
git clone <repository-url>
cd poyraz-cli
npm install
npm run build
npm start
```

For a TypeScript watch-style loop without building `dist` first:

```bash
npm run dev
```

(`dev` runs `npx tsx index.ts`.)

## Dependency on `poyraz`

By default the CLI depends on the published npm package `poyraz` (`^0.1.0` in `package.json`). Install and build as above.

To develop against a **local** checkout of the library:

```bash
# in your poyraz library clone
npm run build
npm link

# in this repo
npm link poyraz
npm install
npm run build
```

Paths depend on where you cloned each repo; there is no required sibling-folder layout.

This package sets `legacy-peer-deps=true` in `.npmrc` for install compatibility.

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run build` | Bundle with `tsup` → `dist/index.js` (Node shebang) |
| `npm start` | Run `node dist/index.js` |
| `npm run dev` | Run `index.ts` via `tsx` |
| `prepublishOnly` | Runs `build` before publish |

The published binary maps `poyraz` → `./dist/index.js` (`package.json` `bin`).

## Layout

| Path | Role |
|------|------|
| `index.ts` | Bootstrap: env, trust, template/model, MCP, REPL |
| `repl.ts` | Main REPL loop |
| `repl-*.ts` | Commands, auth, MCP, pickers, input, theme, status |
| `workspace-trust.ts` | First-run trust prompt |
| `tsup.config.ts` | Build config |
| `.github/workflows/ci.yml` | CI |

User-facing behavior is documented under [`docs/`](../README.md#documentation). Keep docs aligned when you change CLI surface area (flags, slash commands, paths).

## CI

On push/PR to `main` or `master`, GitHub Actions:

1. Checkout  
2. Node 20 + npm cache  
3. `npm install`  
4. `npm run build`  

There is **no automated test suite** in this repository. Before opening a PR, run `npm run build` locally and smoke-test the REPL for the behavior you changed.

## Contributing

1. Fork or branch from the default branch.  
2. Make a focused change.  
3. Update user docs under `docs/` (and the README summary table if you add commands).  
4. Ensure `npm run build` succeeds.  
5. Open a pull request describing the user-visible impact.

## License

MIT — see [LICENSE](../LICENSE).
