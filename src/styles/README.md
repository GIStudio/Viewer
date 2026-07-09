# Viewer CSS Migration Notes

This directory owns the route-aware CSS split for the active Viewer.

- `base.css`, `shell.css`, and `shared.css` are loaded by `main.tsx`.
- `viewer.css`, `scene-graph.css`, and `asset-editor.css` are loaded by their route islands.
- Keep new CSS files around 100-250 lines, with a hard cap of 350 lines.
- Do not add new feature styles to `src/style.css`; it is only a temporary scratchpad for pre-existing dirty styles awaiting extraction.
- Prefer Ant Design or focused React components for new shell and panel UI. Treat Ant Design Pro as a reference system, not a scaffold target.
- Tailwind should only be introduced as a small React-only pilot after route CSS has been split and smoke-tested.
