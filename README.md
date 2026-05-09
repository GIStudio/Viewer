# Viewer

A browser-based 3D street scene viewer and asset editor built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

> Status: current viewer entry  
> Last verified: 2026-05-08

## Features

- **3D Scene Viewer** — load and inspect street scene GLB files with a free-camera orbit control
- **Scenario Designs Workspace** — load curated scenario designs and submit catalog-driven batch generation through `/api/scenario-designs/runs`
- **Design Workspace** — generate street scenes from presets or custom prompts through the RoadGen3D API
- **Branch / Pareto Trace** — run 100-sample branch searches, inspect 3D score scatter plots, and trace active RAG evidence, parameter triples, LLM patches, directives, and rejected edits
- **Persistent Benchmark Explorer** — browse historical benchmark samples, filter by preset / batch / run, compare Pareto fronts, and reload retained artifacts
- **Correlation Analysis** — analyze `input parameters / preset / patch` → `scene_layout.json` features → `walkability / safety / beauty / overall` with heatmaps, parameter scatter plots, categorical effects, and feature importance
- **GLB Rebuild** — rebuild missing `scene.glb` files from retained `scene_layout.json` when the layout and referenced assets still exist
- **Production Steps** — step through layered scene-build snapshots
- **Asset Editor** — browse asset manifests (`.jsonl`), preview individual `.glb` models, and edit metadata:
  - Scale adjustment with live 3D preview
  - Yaw / orientation control (0–360°) with a front-direction indicator arrow
  - Metric ruler / scale bar overlay (1 m tick marks)
  - Bounding-box dimensions readout (W × H × D in metres)
  - Persist changes back to the manifest file
- **Scene Graph** — hierarchical object tree with click-to-select highlighting
- **Instance Inspector** — click any placed object to view its manifest metadata

## Documentation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current Viewer code organization guard |
| [docs/road.md](docs/road.md) | Road geometry notes |
| [docs/multi-lane.md](docs/multi-lane.md) | Multi-lane band geometry notes |
| [docs/archive/README.md](docs/archive/README.md) | Historical plans and refactor notes |

## Current Generation Routes

The current Scenario Designs panel does not use per-sample LLM/RAG drafting. It loads `/api/scenario-designs`, submits `/api/scenario-designs/runs`, and the backend converts catalog entries into `template_patch` and `compose_config_patch` before reusing `/api/scene/jobs` with `preset_id=skip_llm`.

The Design and Branch panels still use `/api/scene/jobs`, `/api/design/branch-runs`, benchmark analysis, and evaluation endpoints for prompt/preset experiments.

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
npm install
```

### Configure paths

Copy the example environment file and point it at your asset data:

```bash
cp .env.example .env
# then edit .env
```

Key variables:

| Variable | Description |
|---|---|
| `VIEWER_ASSET_MANIFESTS_DIR` | Directory containing `.jsonl` manifest files |
| `VIEWER_ASSET_MANIFEST_PATH` | Path to the primary manifest (default: `<dir>/assets_manifest.jsonl`) |
| `VIEWER_EXTRA_MANIFEST_DIRS` | `:` separated list of additional manifest directories |
| `ROADGEN_VIEWER_ALLOWED_ROOTS` | Extra root directories the dev server may serve files from |
| `ROADGEN_VIEWER_PORT` | Dev-server port override (default: `4173`) |

### Run

```bash
npm run dev
```

Then open [http://localhost:4173](http://localhost:4173) in your browser. From the repo root, `make viewer-web` is preferred because it detects whether `4173` is already occupied by another project and automatically starts RoadGen3D Viewer on the next free port.

## Asset Manifest Format

Each line in a `.jsonl` manifest is a JSON object describing one asset:

```json
{"asset_id": "bench_001", "category": "street_furniture", "text_desc": "Park bench", "glb_path": "/absolute/path/to/bench_001.glb"}
```

Fields written / updated by the Asset Editor:

| Field | Type | Description |
|---|---|---|
| `scale` | `number` | Uniform scale multiplier |
| `yaw_deg` | `number` | Canonical front-face rotation in degrees `[0, 360)` |
| `canonical_front` | `string` | Front direction label (`+X`, `-X`, `+Z`, `-Z`) |
| `dimensions_m` | `object` | `{width, height, depth}` bounding box in metres at the saved scale |

## Project Structure

```
src/
  main.ts           Entry point
  app.ts            Top-level app shell and routing
  asset-editor.ts   Asset Editor panel (Three.js preview + manifest CRUD)
  viewer-scenario-designs.ts  Scenario Designs catalog and batch-run UI
  viewer-design-controller.ts  Design workspace, branch runs, benchmark explorer
  viewer-branch-workspace.ts   Branch trace, influence matrix, score scatter shell
  branch-score-scatter-3d.ts   Three.js Pareto / score scatter renderer
  scene-graph.ts    Scene graph tree view
  sg-*.ts           Scene graph utilities
  style.css         Global styles
vite.config.ts      Dev server + API middleware
```

## License

MIT
