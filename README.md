# Viewer

A browser-based 3D street scene viewer and asset editor built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

## Features

- **3D Scene Viewer** — load and inspect street scene GLB files with a free-camera orbit control
- **Production Steps** — step through layered scene-build snapshots
- **Asset Editor** — browse asset manifests (`.jsonl`), preview individual `.glb` models, and edit metadata:
  - Scale adjustment with live 3D preview
  - Yaw / orientation control (0–360°) with a front-direction indicator arrow
  - Metric ruler / scale bar overlay (1 m tick marks)
  - Bounding-box dimensions readout (W × H × D in metres)
  - Persist changes back to the manifest file
- **Scene Graph** — hierarchical object tree with click-to-select highlighting
- **Instance Inspector** — click any placed object to view its manifest metadata

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

### Run

```bash
npm run dev
```

Then open [http://localhost:4173](http://localhost:4173) in your browser.

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
  scene-graph.ts    Scene graph tree view
  sg-*.ts           Scene graph utilities
  style.css         Global styles
vite.config.ts      Dev server + API middleware
```

## License

MIT
