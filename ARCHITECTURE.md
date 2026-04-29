# Viewer Architecture Guard

`src/app.ts` is the Viewer composition root. Keep it small enough to understand:

- DOM element lookup and top-level event binding
- Controller/module wiring through dependency injection
- Shared Three.js runtime state that cannot yet be moved safely
- Animation loop and cross-module coordination

Do not add feature-specific business logic directly to `src/app.ts`. New work should default to a focused module, then expose a small API that `app.ts` wires up.

## Where New Code Goes

- Panel state and shell behavior: `viewer-*-controller.ts`
- API orchestration or long-running workflows: `viewer-*-controller.ts`
- HTML rendering for a feature: `viewer-*.ts` or `viewer-*-workspace.ts`
- Scene/UI helpers with no app state ownership: `viewer-*-helpers.ts`
- Shared types and constants: `viewer-types.ts`
- Root-only event delegation: `app.ts`, but keep handlers thin

## Before Editing `app.ts`

Ask whether the change is wiring or feature logic.

- If it is wiring, keep it in `app.ts`.
- If it renders a panel, calls an API, owns workflow state, transforms domain data, or grows beyond a small event handler, put it in a module.
- If a module needs runtime state, pass it explicitly as dependencies instead of importing `app.ts`.

## Refactor Rule

When adding a new Viewer feature, the default shape is:

1. Create or extend a focused module.
2. Export a small controller/helper API.
3. Wire it in `app.ts`.
4. Run `npm run typecheck`.
5. Run `npm run build` for multi-file changes.

`app.ts` should not become the place where unfinished ideas accumulate. If a temporary implementation must start there, leave a short TODO with the target module and move it before expanding the feature.
