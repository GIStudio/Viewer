# app.ts 重构指南

## 已完成的修改

### 1. 更新导入语句 (Line 1-81)
✅ 已从新模块导入类型和函数：
- viewer-types.ts: 所有类型定义
- viewer-utils.ts: 工具函数
- viewer-api.ts: API调用
- viewer-hit-info.ts: 命中检测
- viewer-minimap.ts: 小地图
- viewer-export.ts: 导出功能

### 2. 删除重复类型定义
✅ 已删除：
- BranchRunNode (Line 100-119)
- BranchScatterPoint (Line 120-133)  
- BranchRunStatusPayload (Line 135-154)

### 3. 需要手动删除的重复代码

由于文件太大(7215行)，以下重复代码需要逐步删除：

#### Line 120-127: 常量定义（已在viewer-types.ts中）
```typescript
const DEFAULT_GRAPH_TEMPLATE_ID = "hkust_gz_gate";
const DESIGN_POLL_INTERVAL_MS = 1500;
const DESIGN_MAX_POLL_ATTEMPTS = 240;
const DESIGN_SCHEME_VARIANTS: DesignSchemeVariant[] = [...];
const VIEWER_DESIGN_PRESETS: DesignPreset[] = [...];
```

**删除方法**: 删除这7行，改为注释：
```typescript
// Constants moved to viewer-types.ts
```

#### Line 232-258: 类型定义（已在viewer-types.ts中）
```typescript
type MovementState = {...}
type CameraMode = "first_person" | "third_person" | "frame" | "graph_overlay";
type LightingPresetValues = {...}
type LightingState = {...}
type MinimapBounds = {...}
type HitDescriptor = {...}
```

**删除方法**: 删除这些类型定义

#### Line 258-320: LIGHTING_PRESETS等常量
这些常量应保留，因为它们在app.ts中直接使用。

### 4. 删除重复函数

以下函数已提取到模块中，应删除：

#### requireElement, escapeHtml, clamp, sleep, disposeObject
- 位置: Line ~470-510
- 删除: 这些函数现在在 viewer-utils.ts 中

#### apiJson, postApiJson, loadManifest, loadRecentLayouts
- 位置: Line ~1092-1164
- 删除: 这些函数现在在 viewer-api.ts 中

#### sceneBoundsFromBox, updateMinimapCamera, worldToMinimap
- 位置: Line ~4350-4400
- 删除: 这些函数现在在 viewer-minimap.ts 中

#### exportTopDownMapEnhanced, exportTopDownSvg
- 位置: Line ~761-1320
- 删除: 这些函数现在在 viewer-export.ts 中

### 5. 更新函数调用

在删除重复函数后，需要更新调用它们的地方：

```typescript
// 之前:
const el = requireElement<HTMLElement>(root, "#some-id");

// 之后: (已导入)
const el = requireElement<HTMLElement>(root, "#some-id");
```

函数调用方式不变，因为已经从模块导入。

## 编译验证

完成删除后运行：
```bash
cd web/viewer
npx tsc --noEmit
```

应该没有TS2440错误（导入冲突）。

## 预期结果

- app.ts: 从 7215 行减少到 ~5500 行
- 8个新模块: ~1580 行
- 总代码量不变，但组织结构更清晰

## 注意事项

1. **不要删除正在使用的函数** - 只删除已在模块中定义的重复项
2. **保留局部函数** - app.ts内部的辅助函数不需要删除
3. **验证编译** - 每删除一段代码后验证TypeScript编译
