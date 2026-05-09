export type ViewerLanguage = "en" | "zh" | "mixed";

export const VIEWER_LANGUAGE_EVENT = "roadgen3d:viewer-language-change";
const VIEWER_LANGUAGE_STORAGE_KEY = "viewer-lang";

type Translation = {
  en: string;
  zh: string;
};

const TRANSLATIONS: Record<string, Translation> = {
  "route.viewer.label": { en: "3D Viewer", zh: "3D 查看器" },
  "route.scene-graph.label": { en: "Reference", zh: "参考图" },
  "route.asset-editor.label": { en: "Asset Editor", zh: "资产编辑器" },
  "route.junction-editor.label": { en: "Junction Editor", zh: "路口编辑器" },
  "shell.viewer.kicker": { en: "RoadGen3D", zh: "RoadGen3D" },
  "shell.viewer.title": { en: "3D Road Viewer", zh: "3D 道路查看器" },
  "shell.scene-graph.kicker": { en: "Viewer / Reference", zh: "查看器 / 参考图" },
  "shell.scene-graph.title": { en: "Reference Plan Annotation", zh: "参考图标注" },
  "shell.scene-graph.subtitle": {
    en: "Calibrate the plan scale, trace road centerlines, define cross sections and street-furniture anchors, then export JSON or convert to a road graph.",
    zh: "校准参考图比例，描绘道路中心线，定义横断面与街道家具锚点，然后导出 JSON 或转换为道路 graph。",
  },
  "shell.asset-editor.kicker": { en: "Viewer / 3D Assets", zh: "查看器 / 3D 资产" },
  "shell.asset-editor.title": { en: "3D Asset Editor", zh: "3D 资产编辑器" },
  "shell.asset-editor.subtitle": { en: "Browse, inspect, and manage project 3D assets", zh: "浏览、检查并管理项目 3D 资产" },
  "shell.junction-editor.kicker": { en: "Viewer / Junction", zh: "查看器 / 路口" },
  "shell.junction-editor.title": { en: "Junction Editor", zh: "路口编辑器" },
  "shell.junction-editor.subtitle": {
    en: "Draw junction skeletons, Bezier curves, and corner patches for reusable templates.",
    zh: "绘制路口骨架、贝塞尔曲线和转角面片，生成可复用模板。",
  },
  "menu.file": { en: "File", zh: "文件" },
  "menu.view": { en: "View", zh: "视图" },
  "menu.tools": { en: "Tools", zh: "工具" },
  "menu.help": { en: "Help", zh: "帮助" },
  "menu.file.loadLayout": { en: "Load Layout", zh: "加载布局" },
  "menu.file.exportPng": { en: "Export PNG", zh: "导出 PNG" },
  "menu.file.exportSvg": { en: "Export SVG", zh: "导出 SVG" },
  "menu.file.exportJson": { en: "Export JSON", zh: "导出 JSON" },
  "menu.file.saveContext": { en: "Save Context", zh: "保存上下文" },
  "menu.view.resetView": { en: "Reset View", zh: "重置视图" },
  "menu.view.toggleLeft": { en: "Toggle Left Sidebar", zh: "切换左侧栏" },
  "menu.view.toggleRight": { en: "Toggle Right Sidebar", zh: "切换右侧栏" },
  "menu.view.toggleBottom": { en: "Toggle Status Workbench", zh: "切换状态工作台" },
  "menu.tools.settings": { en: "Settings", zh: "设置" },
  "menu.tools.design": { en: "Design", zh: "设计" },
  "menu.tools.evaluate": { en: "Evaluate", zh: "评估" },
  "menu.tools.compare": { en: "Compare", zh: "对比" },
  "menu.tools.history": { en: "History", zh: "历史" },
  "menu.tools.presets": { en: "Presets", zh: "预设" },
  "menu.tools.floatingLane": { en: "Floating Lane", zh: "浮动车道" },
  "menu.help.shortcuts": { en: "Shortcuts", zh: "快捷键" },
  "language.group": { en: "Language", zh: "语言" },
  "language.en": { en: "English", zh: "英文" },
  "language.zh": { en: "Chinese", zh: "中文" },
  "language.mixed": { en: "Bilingual", zh: "中英混合" },
  "common.error.failedToFetch": { en: "Failed to fetch", zh: "请求失败。" },
  "shell.navigation": { en: "Navigation", zh: "导航" },
  "shell.leftSidebar": { en: "Left Sidebar", zh: "左侧栏" },
  "shell.inspector": { en: "Inspector", zh: "检查器" },
  "shell.rightSidebar": { en: "Right Sidebar", zh: "右侧栏" },
  "shell.pin": { en: "Pin", zh: "固定" },
  "shell.pinned": { en: "Pinned", zh: "已固定" },
  "shell.statusWorkbench": { en: "Status Workbench", zh: "状态工作台" },
  "shell.status.ready": { en: "Ready.", zh: "就绪。" },
  "shell.status": { en: "Status", zh: "状态" },
  "shell.activity": { en: "Activity", zh: "活动" },
  "shell.hints": { en: "Hints", zh: "提示" },
  "viewer.hints.capture": { en: "Click to capture mouse, then use WASD to move.", zh: "点击场景捕获鼠标，然后用 WASD 移动。" },
  "viewer.hints.move": {
    en: "Shift accelerates movement, Esc unlocks the cursor, and R resets the roam state.",
    zh: "Shift 加速，Esc 释放鼠标，R 重置漫游状态。",
  },
  "viewer.hints.tools": {
    en: "Use Tools in the top menu or the right tabs for Evaluate, Compare, History, Presets, and Scene Overlay.",
    zh: "通过顶部 Tools 或右侧标签进入评估、对比、历史、预设和场景叠加。",
  },
  "viewer.hints.captureMode": { en: "Headless capture mode is ready for scripted camera renders.", zh: "无头截图模式已就绪，可执行脚本化相机渲染。" },
  "viewer.left.recentLayouts": { en: "Recent Layouts", zh: "最近布局" },
  "viewer.left.entry": { en: "Layout / scene entry", zh: "布局 / 场景入口" },
  "viewer.left.recentResult": { en: "Recent Result", zh: "最近结果" },
  "viewer.left.scene": { en: "Scene", zh: "场景" },
  "viewer.tab.settings": { en: "Settings", zh: "设置" },
  "viewer.tab.design": { en: "Design", zh: "设计" },
  "viewer.tab.evaluate": { en: "Evaluate", zh: "评估" },
  "viewer.tab.compare": { en: "Compare", zh: "对比" },
  "viewer.tab.history": { en: "History", zh: "历史" },
  "viewer.tab.presets": { en: "Presets", zh: "预设" },
  "viewer.tab.floatingLane": { en: "Floating Lane", zh: "浮动车道" },
  "viewer.tab.help": { en: "Help", zh: "帮助" },
  "viewer.status.loading": { en: "Loading viewer...", zh: "正在加载查看器..." },
  "viewer.status.initialized": { en: "Viewer shell initialized.", zh: "查看器框架已初始化。" },
  "sceneGraph.hints.loadPlan": {
    en: "Load or import a reference plan, then pick a tool from the left rail to annotate roads, zones, or furniture.",
    zh: "加载或导入参考图后，从左侧栏选择工具来标注道路、区域或街道家具。",
  },
  "sceneGraph.hints.centerStage": {
    en: "The center stage is reserved for the plan image and overlay geometry; inspector and export tools stay on the right.",
    zh: "中间画布用于参考图和叠加几何，检查器与导出工具位于右侧。",
  },
  "sceneGraph.hints.statusFeedback": {
    en: "Status and graph conversion feedback are shown in the bottom workbench.",
    zh: "状态与 graph 转换反馈会显示在底部工作台。",
  },
  "sceneGraph.status.waitingReferenceImage": { en: "Waiting for a reference image.", zh: "等待参考图。" },
  "sceneGraph.status.graphPlaceholder": { en: "Road graph results appear here automatically.", zh: "道路 Graph 结果会自动显示在这里。" },
  "sceneGraph.status.annotationReady": { en: "Annotation ready.", zh: "标注工具已就绪。" },
  "sceneGraph.status.loadingDefaultPlan": { en: "Loading default reference plan...", zh: "正在加载默认参考图..." },
  "sceneGraph.status.loadReferenceImage": { en: "Load a reference plan image to start annotating.", zh: "加载参考图后即可开始标注。" },
  "sceneGraph.status.failedSelectedImage": { en: "Failed to load the selected image.", zh: "加载所选图片失败。" },
  "sceneGraph.status.selectedImageTimeout": { en: "Timed out while loading the selected image.", zh: "加载所选图片超时。" },
  "sceneGraph.status.failedLoadReferencePlan": { en: "Failed to load reference plan.", zh: "加载参考图失败。" },
  "sceneGraph.status.failedLoadUploadedImage": { en: "Failed to load uploaded image.", zh: "加载上传图片失败。" },
  "sceneGraph.status.failedRefreshReferencePlans": { en: "Failed to refresh reference plans.", zh: "刷新参考图列表失败。" },
  "sceneGraph.status.referenceImageUpdated": {
    en: "Reference image updated. Road graph will be generated after annotation.",
    zh: "参考图已更新，标注后会自动生成道路 Graph。",
  },
  "sceneGraph.status.annotationChangedRefreshGraph": {
    en: "Annotation changed. Road graph will refresh automatically.",
    zh: "标注已变更，道路 Graph 会自动刷新。",
  },
  "sceneGraph.status.annotationReset": { en: "Annotation reset. Draw new features to generate a road graph.", zh: "标注已重置，绘制新要素后会生成道路 Graph。" },
  "sceneGraph.status.scaleChanged": { en: "Scale changed. Road graph will refresh automatically.", zh: "比例已变更，道路 Graph 会自动刷新。" },
  "sceneGraph.status.jsonAppliedRefreshGraph": { en: "Annotation JSON applied. Road graph will refresh automatically.", zh: "标注 JSON 已应用，道路 Graph 会自动刷新。" },
  "sceneGraph.status.autoGraphQueued": { en: "Road graph will update automatically after edits.", zh: "道路 Graph 会在编辑后自动更新。" },
  "sceneGraph.status.autoGraphUpdating": { en: "Updating road graph automatically...", zh: "正在自动更新道路 Graph..." },
  "sceneGraph.status.graphSettingsChanged": { en: "Road graph settings changed.", zh: "道路 Graph 设置已变更。" },
  "sceneGraph.status.addCenterlineBeforeConvert": { en: "Add at least one centerline before converting.", zh: "至少添加一条中心线后再转换。" },
  "sceneGraph.status.convertingGraph": { en: "Converting annotation to graph...", zh: "正在将标注转换为 graph..." },
  "sceneGraph.status.graphComplete": { en: "Graph conversion complete.", zh: "Graph 转换完成。" },
  "sceneGraph.status.failedConvertAnnotation": { en: "Failed to convert annotation.", zh: "标注转换失败。" },
  "sceneGraph.status.annotationCleared": { en: "Annotation cleared.", zh: "标注已清空。" },
  "sceneGraph.status.referenceImageCleared": { en: "Reference image cleared.", zh: "参考图已清除。" },
  "sceneGraph.status.resetCancelled": { en: "Reset cancelled.", zh: "已取消重置。" },
  "sceneGraph.status.roadSnapEnabled": { en: "Road snap enabled.", zh: "已开启道路吸附。" },
  "sceneGraph.status.centerlineNeedsTwoPoints": { en: "Centerline needs at least two points.", zh: "中心线至少需要两个点。" },
  "sceneGraph.status.jsonCopied": { en: "Annotation JSON copied to clipboard.", zh: "标注 JSON 已复制到剪贴板。" },
  "sceneGraph.status.appliedJson": { en: "Applied annotation JSON.", zh: "已应用标注 JSON。" },
  "assetEditor.hints.pickManifest": {
    en: "Use the left rail to pick a manifest, filter assets, and browse the gallery.",
    zh: "使用左侧栏选择 manifest、筛选资产并浏览图库。",
  },
  "assetEditor.hints.centerWorkspace": {
    en: "The center workspace stays focused on preview and object selection.",
    zh: "中间工作区用于预览和对象选择。",
  },
  "assetEditor.hints.rightInspector": {
    en: "Metadata, object lists, and export actions live in the right inspector tabs.",
    zh: "元数据、对象列表和导出操作位于右侧检查器标签中。",
  },
  "assetEditor.hints.orbit": {
    en: "Scroll to orbit, right-drag to pan, and use Fit to frame the current asset.",
    zh: "滚轮环绕视角，右键拖拽平移，使用 Fit 框选当前资产。",
  },
  "assetEditor.hints.selection": {
    en: "Toggle Select to enter rectangle selection mode for mesh-level editing.",
    zh: "打开 Select 可进入框选模式，进行 mesh 级编辑。",
  },
  "assetEditor.hints.export": {
    en: "Export GLB and Save live in the Export tab on the right rail.",
    zh: "Export GLB 和 Save 位于右侧栏的 Export 标签。",
  },
  "assetEditor.status.ready": { en: "Asset editor ready.", zh: "资产编辑器已就绪。" },
  "junctionEditor.hints.crossSkeleton": {
    en: "Cross skeleton uses five points: the center plus four road-arm endpoints.",
    zh: "十字骨架使用五个点：中心点加四个道路端点。",
  },
  "junctionEditor.hints.multiSelect": {
    en: "Use Multi Select and Merge Selected from the right rail to build turn or corner surfaces.",
    zh: "使用右侧栏的 Multi Select 和 Merge Selected 来构建转向或转角面。",
  },
  "junctionEditor.hints.cornerPatch": {
    en: "Draw Corner Skeleton and Draw Patch stay available for manual corner geometry overrides.",
    zh: "Draw Corner Skeleton 和 Draw Patch 可用于手动覆盖转角几何。",
  },
  "junctionEditor.status.readyDetailed": {
    en: "Junction editor ready. Center stays fixed at the visual origin; use the left rail to edit arm lengths and lane counts.",
    zh: "路口编辑器已就绪。中心点固定在视觉原点，可用左侧栏编辑道路臂长度和车道数。",
  },
  "junctionEditor.status.ready": { en: "Junction editor ready.", zh: "路口编辑器已就绪。" },
  "viewer.settings.title": { en: "Display Settings", zh: "显示设置" },
  "viewer.settings.subtitle": { en: "Light presets, shadows, and laser pointer", zh: "光照预设、阴影和激光指示器" },
  "viewer.settings.close": { en: "Close settings", zh: "关闭设置" },
  "viewer.settings.lightingPreset": { en: "Lighting Preset", zh: "光照预设" },
  "viewer.settings.exposure": { en: "Exposure", zh: "曝光" },
  "viewer.settings.keyLight": { en: "Key Light Intensity", zh: "主光强度" },
  "viewer.settings.fillLight": { en: "Fill Light Intensity", zh: "补光强度" },
  "viewer.settings.warmth": { en: "Warmth", zh: "色温" },
  "viewer.design.title": { en: "Design Assistant", zh: "设计助手" },
  "viewer.design.subtitle": {
    en: "Generate scenes, trace RAG / triples / search patches, and compare Pareto scores",
    zh: "生成场景、追踪 RAG / triples / search patches，并对比 Pareto 分数",
  },
  "viewer.evaluate.title": { en: "Design Evaluation", zh: "设计评估" },
  "viewer.evaluate.subtitle": { en: "AI-driven layout assessment and suggestions", zh: "AI 驱动的布局评估与建议" },
  "viewer.compare.title": { en: "Layout Comparison", zh: "布局对比" },
  "viewer.compare.subtitle": { en: "Compare two layouts side-by-side", zh: "对比两个布局的配置、指标和地物差异" },
  "viewer.history.title": { en: "History Analysis", zh: "历史分析" },
  "viewer.history.subtitle": { en: "Scatter plot analysis of scene generation history", zh: "场景生成历史的散点图分析" },
  "viewer.history.scatter": { en: "Scatter", zh: "散点图" },
  "viewer.history.frequency": { en: "Frequency", zh: "频次分布" },
  "viewer.history.trend": { en: "Trend", zh: "趋势" },
  "viewer.history.scores": { en: "Three-System Scores", zh: "三系统评分" },
  "viewer.presets.title": { en: "Scene Presets", zh: "场景预设" },
  "viewer.presets.subtitle": {
    en: "Pre-configured scene styles. The highlighted card matches the currently loaded scene's generation preset.",
    zh: "预配置场景风格。高亮卡片会匹配当前加载场景的生成预设。",
  },
  "viewer.help.title": { en: "Help", zh: "帮助" },
  "viewer.help.subtitle": { en: "Generation flow and step-by-step details", zh: "生成流程与步骤说明" },
  "viewer.minimap.title": { en: "Scene Map", zh: "场景地图" },
  "viewer.overlay.capture": { en: "Click scene to capture mouse", zh: "点击场景捕获鼠标" },
  "viewer.compare.exit": { en: "Exit Split View", zh: "退出分屏视图" },
  "sceneGraph.right.view": { en: "View", zh: "视图" },
  "sceneGraph.right.inspector": { en: "Inspector", zh: "检查器" },
  "sceneGraph.right.data": { en: "Data", zh: "数据" },
  "sceneGraph.right.viewLayerOptions": { en: "View & Layer Options", zh: "视图与图层选项" },
  "sceneGraph.right.referencePlan": { en: "Reference Plan", zh: "参考图" },
  "sceneGraph.right.importPng": { en: "Import PNG", zh: "导入 PNG" },
  "sceneGraph.right.clearImage": { en: "Clear Image", zh: "清除图片" },
  "sceneGraph.right.originalImage": { en: "Original Image", zh: "原始图片" },
  "sceneGraph.right.annotationOverlay": { en: "Annotation Overlay", zh: "标注叠加层" },
  "sceneGraph.right.junctionCore": { en: "Junction Core", zh: "路口核心" },
  "sceneGraph.right.junctionConnectors": { en: "Junction Connectors", zh: "路口连接线" },
  "sceneGraph.right.junctionOutlines": { en: "Junction Outlines", zh: "路口轮廓" },
  "sceneGraph.right.crosswalks": { en: "Crosswalks", zh: "人行横道" },
  "sceneGraph.right.approachBoundaries": { en: "Approach Boundaries", zh: "进口道边界" },
  "sceneGraph.right.junctionLabels": { en: "Junction Labels", zh: "路口标签" },
  "sceneGraph.right.junctionDebug": { en: "Junction Debug", zh: "路口调试" },
  "sceneGraph.right.originalOpacity": { en: "Original Opacity", zh: "原图透明度" },
  "sceneGraph.right.overlayOpacity": { en: "Overlay Opacity", zh: "叠加层透明度" },
  "sceneGraph.right.pixelsPerMeter": { en: "Pixels / Meter", zh: "像素 / 米" },
  "sceneGraph.right.defaultRoundaboutRadius": { en: "Default Roundabout Radius", zh: "默认环岛半径" },
  "sceneGraph.right.selectedFeature": { en: "Selected Feature", zh: "选中要素" },
  "sceneGraph.right.importExport": { en: "Import / Export", zh: "导入 / 导出" },
  "sceneGraph.right.importJson": { en: "Import JSON", zh: "导入 JSON" },
  "sceneGraph.right.importAnnotation": { en: "Import Annotation", zh: "导入标注" },
  "sceneGraph.right.applyJson": { en: "Apply JSON", zh: "应用 JSON" },
  "sceneGraph.right.downloadJson": { en: "Download JSON", zh: "下载 JSON" },
  "sceneGraph.right.downloadAnnotation": { en: "Download Annotation", zh: "下载标注" },
  "sceneGraph.right.copyJson": { en: "Copy JSON", zh: "复制 JSON" },
  "sceneGraph.right.copyAnnotation": { en: "Copy Annotation", zh: "复制标注" },
  "sceneGraph.right.convertGraph": { en: "Convert to Graph", zh: "转换为 Graph" },
  "sceneGraph.right.retryGraph": { en: "Retry Graph Conversion", zh: "重试 Graph 转换" },
  "sceneGraph.right.downloadGraph": { en: "Download Graph", zh: "下载 Graph" },
  "sceneGraph.right.downloadRoadGraph": { en: "Download Road Graph", zh: "下载道路 Graph" },
  "sceneGraph.right.graphConversion": { en: "Graph Conversion", zh: "Graph 转换" },
  "sceneGraph.right.graphAutoNote": {
    en: "Road graph is generated automatically after annotation edits. Use retry only if the automatic conversion fails.",
    zh: "道路 Graph 会在标注修改后自动生成；只有自动转换失败时才需要重试。",
  },
  "sceneGraph.right.segmentLength": { en: "Segment Length (m)", zh: "分段长度 (m)" },
  "sceneGraph.right.sidewalkWidth": { en: "Sidewalk Width (m)", zh: "人行道宽度 (m)" },
  "sceneGraph.right.annotationSummary": { en: "Annotation Summary", zh: "标注摘要" },
  "sceneGraph.right.featureTable": { en: "Feature Table", zh: "要素表" },
  "sceneGraph.right.type": { en: "Type", zh: "类型" },
  "sceneGraph.right.id": { en: "ID", zh: "ID" },
  "sceneGraph.right.label": { en: "Label", zh: "标签" },
  "sceneGraph.right.detail": { en: "Detail", zh: "详情" },
  "sceneGraph.right.annotationJson": { en: "Annotation JSON", zh: "标注 JSON" },
  "sceneGraph.inspector.choosePlan": { en: "Choose a reference plan", zh: "选择参考图" },
  "sceneGraph.inspector.kind": { en: "Kind", zh: "类型" },
  "sceneGraph.inspector.strip": { en: "Strip", zh: "横断面条带" },
  "sceneGraph.inspector.station": { en: "Station (m)", zh: "桩号 (m)" },
  "sceneGraph.inspector.lateralOffset": { en: "Lateral Offset (m)", zh: "横向偏移 (m)" },
  "sceneGraph.inspector.yaw": { en: "Yaw", zh: "朝向" },
  "sceneGraph.inspector.streetFurniture": { en: "Street Furniture", zh: "街道家具" },
  "sceneGraph.inspector.furnitureKind": { en: "Furniture Kind", zh: "家具类型" },
  "sceneGraph.inspector.noFurniture": { en: "No furniture instances yet.", zh: "还没有家具实例。" },
  "sceneGraph.inspector.selectFurnitureStrip": { en: "Select a furnishing or frontage strip", zh: "选择家具带或临街预留带" },
  "sceneGraph.inspector.cancelPlacement": { en: "Cancel Placement", zh: "取消放置" },
  "sceneGraph.inspector.placeCanvas": { en: "Place on Canvas", zh: "在画布上放置" },
  "sceneGraph.inspector.buildingRegion": { en: "Building Region", zh: "建筑区域" },
  "sceneGraph.inspector.buildingRegionNote": {
    en: "Rotated rectangle for building generation and orientation override.",
    zh: "用于建筑生成和朝向覆盖的旋转矩形。",
  },
  "sceneGraph.inspector.centerX": { en: "Center X", zh: "中心 X" },
  "sceneGraph.inspector.centerY": { en: "Center Y", zh: "中心 Y" },
  "sceneGraph.inspector.widthPx": { en: "Width (px)", zh: "宽度 (px)" },
  "sceneGraph.inspector.heightPx": { en: "Height (px)", zh: "高度 (px)" },
  "sceneGraph.inspector.yawDeg": { en: "Yaw (deg)", zh: "朝向 (度)" },
  "sceneGraph.inspector.generationRule": { en: "Generation Rule", zh: "生成规则" },
  "sceneGraph.inspector.buildingRule": {
    en: "Buildings intersecting this region use its orientation. Later regions override earlier ones.",
    zh: "与该区域相交的建筑会使用此朝向，后绘制的区域会覆盖先前区域。",
  },
  "sceneGraph.inspector.functionalZone": { en: "Functional Zone", zh: "功能区域" },
  "sceneGraph.inspector.functionalZoneNote": {
    en: "Polygon zone for special functional areas like plazas, gardens, and playgrounds.",
    zh: "用于广场、花园、游乐场等特殊功能区的多边形区域。",
  },
  "sceneGraph.inspector.centroidX": { en: "Centroid X", zh: "质心 X" },
  "sceneGraph.inspector.centroidY": { en: "Centroid Y", zh: "质心 Y" },
  "sceneGraph.inspector.hint": { en: "Hint", zh: "提示" },
  "sceneGraph.inspector.zoneHint": {
    en: "Double-click the canvas to finish drawing a polygon zone. Minimum 3 points required.",
    zh: "双击画布完成多边形区域绘制，至少需要 3 个点。",
  },
  "sceneGraph.inspector.zoneFurniture": { en: "Zone Furniture", zh: "区域家具" },
  "sceneGraph.inspector.designSurface": { en: "Design Surface", zh: "设计面" },
  "sceneGraph.inspector.designSurfaceNote": {
    en: "Station-bound surface patch for lane changes, islands, pads, and paving.",
    zh: "绑定道路桩号的表面面片，用于车道变化、安全岛、铺装垫面等。",
  },
  "sceneGraph.inspector.surfaceRole": { en: "Surface Role", zh: "表面角色" },
  "sceneGraph.inspector.centerline": { en: "Centerline", zh: "中心线" },
  "sceneGraph.inspector.startStation": { en: "Start Station (m)", zh: "起始桩号 (m)" },
  "sceneGraph.inspector.endStation": { en: "End Station (m)", zh: "结束桩号 (m)" },
  "sceneGraph.inspector.lateralStart": { en: "Lateral Start (m)", zh: "横向起点 (m)" },
  "sceneGraph.inspector.lateralEnd": { en: "Lateral End (m)", zh: "横向终点 (m)" },
  "sceneGraph.inspector.materialPreset": { en: "Material Preset", zh: "材质预设" },
  "sceneGraph.inspector.colorHex": { en: "Color Hex", zh: "颜色 Hex" },
  "sceneGraph.inspector.roadLength": { en: "Road Length", zh: "道路长度" },
  "sceneGraph.inspector.missingCenterline": { en: "Missing centerline", zh: "缺少中心线" },
  "sceneGraph.inspector.x": { en: "X", zh: "X" },
  "sceneGraph.inspector.y": { en: "Y", zh: "Y" },
  "sceneGraph.inspector.anchor": { en: "Anchor", zh: "锚点" },
  "sceneGraph.inspector.crosswalkDepth": { en: "Crosswalk Depth", zh: "人行横道深度" },
  "sceneGraph.inspector.connectedArms": { en: "Connected Arms", zh: "连接道路臂" },
  "sceneGraph.inspector.approachSplits": { en: "Approach Splits", zh: "进口拆分" },
  "sceneGraph.inspector.zebraFeet": { en: "Zebra Boundary Feet", zh: "斑马线边界脚点" },
  "sceneGraph.inspector.cornerFocuses": { en: "Corner Focuses", zh: "转角焦点" },
  "sceneGraph.inspector.subLaneControlPoints": { en: "Sub-lane Control Points", zh: "子车道控制点" },
  "sceneGraph.inspector.boundaryExtensions": { en: "Boundary Extensions", zh: "边界延长线" },
  "sceneGraph.inspector.focusGuides": { en: "Focus Guides", zh: "焦点引导线" },
  "sceneGraph.inspector.connectedCenterlines": { en: "Connected Centerlines", zh: "连接中心线" },
  "sceneGraph.inspector.ownedGeometry": { en: "Owned Geometry", zh: "所属几何" },
  "sceneGraph.inspector.ownedGeometryNote": {
    en: "Rectangular carriageway core, zebra boundaries, sidewalk corners, near-road corners, frontage corners.",
    zh: "矩形车行道核心、斑马线边界、人行道转角、近路侧转角、临街转角。",
  },
  "sceneGraph.inspector.noDerivedControls": { en: "No derived control points for this junction.", zh: "该路口暂无派生控制点。" },
  "sceneGraph.inspector.editJunctionCorners": { en: "Edit Junction Corners", zh: "编辑路口转角" },
  "sceneGraph.inspector.roadStrip": { en: "Road Strip", zh: "道路条带" },
  "sceneGraph.inspector.junctionTurnPatch": { en: "Junction Turn Patch", zh: "路口转向面片" },
  "sceneGraph.inspector.junctionConnector": { en: "Junction Connector", zh: "路口连接面片" },
  "sceneGraph.inspector.junctionSidePatch": { en: "Junction Side Patch", zh: "路口侧向面片" },
  "sceneGraph.inspector.readOnly": { en: "read-only", zh: "只读" },
  "sceneGraph.inspector.owner": { en: "Owner", zh: "所属对象" },
  "sceneGraph.inspector.element": { en: "Element", zh: "元素" },
  "sceneGraph.inspector.stripKind": { en: "Strip Kind", zh: "条带类型" },
  "sceneGraph.inspector.zone": { en: "Zone", zh: "区域" },
  "sceneGraph.inspector.direction": { en: "Direction", zh: "方向" },
  "sceneGraph.inspector.width": { en: "Width", zh: "宽度" },
  "sceneGraph.inspector.junction": { en: "Junction", zh: "路口" },
  "sceneGraph.inspector.patch": { en: "Patch", zh: "面片" },
  "sceneGraph.inspector.patchRole": { en: "Patch Role", zh: "面片角色" },
  "sceneGraph.inspector.pairedConnector": { en: "Paired Connector", zh: "配对连接件" },
  "sceneGraph.inspector.endpoint": { en: "Endpoint", zh: "端点" },
  "sceneGraph.inspector.connector": { en: "Connector", zh: "连接件" },
  "sceneGraph.inspector.link": { en: "Link", zh: "链接" },
  "sceneGraph.inspector.quadrant": { en: "Quadrant", zh: "象限" },
  "sceneGraph.inspector.kernel": { en: "Kernel", zh: "核心" },
  "sceneGraph.inspector.from": { en: "From", zh: "来源" },
  "sceneGraph.inspector.to": { en: "To", zh: "目标" },
  "sceneGraph.inspector.points": { en: "Points", zh: "点数" },
  "sceneGraph.inspector.editing": { en: "Editing", zh: "编辑" },
  "sceneGraph.inspector.diagnosticGeometry": {
    en: "This lane element is diagnostic geometry. Select its owning road or junction to edit source data.",
    zh: "该车道元素是诊断几何。请选择其所属道路或路口来编辑源数据。",
  },
  "sceneGraph.inspector.cornerFamily": { en: "Corner Family", zh: "转角族" },
  "sceneGraph.inspector.allRoads": { en: "All Roads", zh: "全部道路" },
  "sceneGraph.inspector.aggregatedRoadSelection": { en: "aggregated road selection", zh: "聚合道路选择" },
  "sceneGraph.inspector.roadCount": { en: "Road Count", zh: "道路数量" },
  "sceneGraph.inspector.detailed": { en: "Detailed", zh: "详细" },
  "sceneGraph.inspector.coarse": { en: "Coarse", zh: "粗略" },
  "sceneGraph.inspector.totalLength": { en: "Total Length", zh: "总长度" },
  "sceneGraph.inspector.averageWidth": { en: "Average Width", zh: "平均宽度" },
  "sceneGraph.inspector.averageDriveLanes": { en: "Average Drive Lanes", zh: "平均机动车道" },
  "sceneGraph.inspector.totalStrips": { en: "Total Strips", zh: "条带总数" },
  "sceneGraph.inspector.totalFurniture": { en: "Total Furniture", zh: "家具总数" },
  "sceneGraph.inspector.roadIds": { en: "Road IDs", zh: "道路 ID" },
  "sceneGraph.inspector.noRoads": { en: "No roads yet.", zh: "还没有道路。" },
  "sceneGraph.inspector.totalWidth": { en: "Total Width (m)", zh: "总宽度 (m)" },
  "sceneGraph.inspector.referenceWidthPx": { en: "Reference Width (px)", zh: "参考宽度 (px)" },
  "sceneGraph.inspector.forwardDrive": { en: "Forward Drive", zh: "正向车道" },
  "sceneGraph.inspector.reverseDrive": { en: "Reverse Drive", zh: "反向车道" },
  "sceneGraph.inspector.bikeLanes": { en: "Bike Lanes", zh: "自行车道" },
  "sceneGraph.inspector.busLanes": { en: "Bus Lanes", zh: "公交车道" },
  "sceneGraph.inspector.parkingLanes": { en: "Parking Lanes", zh: "停车道" },
  "sceneGraph.inspector.highwayType": { en: "Highway Type", zh: "道路类型" },
  "sceneGraph.inspector.mode": { en: "Mode", zh: "模式" },
  "sceneGraph.inspector.referenceWidthM": { en: "Reference Width (m)", zh: "参考宽度 (m)" },
  "sceneGraph.inspector.carriageway": { en: "Carriageway", zh: "车行道" },
  "sceneGraph.inspector.laneSummary": { en: "Lane Summary", zh: "车道摘要" },
  "sceneGraph.inspector.driveLaneWidth": { en: "Drive Lane Width", zh: "机动车道宽度" },
  "sceneGraph.inspector.geometry": { en: "Geometry", zh: "几何" },
  "sceneGraph.inspector.calibratePixels": {
    en: "Calibrate Pixels / Meter from Reference Width",
    zh: "用参考宽度校准像素 / 米",
  },
  "sceneGraph.inspector.reseedCrossSection": { en: "Reseed Cross Section", zh: "重新生成横断面种子" },
  "sceneGraph.inspector.splitCrossSection": { en: "Split to Cross Section", zh: "拆分为横断面" },
  "sceneGraph.inspector.backCoarse": { en: "Back to Coarse", zh: "返回粗略模式" },
  "sceneGraph.inspector.coarseHint": {
    en: "Tune total width and reference scale first; you can also click any band in the seed cross section above to enter detailed editing.",
    zh: "先把总宽度和参考图调准；你现在也可以直接点击上方 seed 横截面中的任一部分，自动进入 detailed 编辑。",
  },
  "sceneGraph.inspector.crossSectionPreview": { en: "Cross Section Preview", zh: "横断面预览" },
  "sceneGraph.inspector.seedPreview": { en: "Seed preview from coarse parameters", zh: "由粗略参数生成的种子预览" },
  "sceneGraph.inspector.detailedCrossSection": { en: "Detailed cross section", zh: "详细横断面" },
  "sceneGraph.inspector.seedClickHint": {
    en: "Click a seed band to split this road into editable detailed strips.",
    zh: "点击种子条带，将道路拆分为可编辑的详细条带。",
  },
  "sceneGraph.inspector.detailClickHint": {
    en: "Click a band to select it, then adjust width and direction below.",
    zh: "点击条带进行选择，然后在下方调整宽度和方向。",
  },
  "sceneGraph.inspector.selectedStrip": { en: "Selected Strip", zh: "选中条带" },
  "sceneGraph.inspector.selectedStripHint": { en: "Click a band in the preview to focus one strip.", zh: "点击预览中的条带以聚焦一个条带。" },
  "sceneGraph.inspector.noStripSelected": { en: "No strip is selected yet.", zh: "尚未选择条带。" },
  "sceneGraph.inspector.stripId": { en: "Strip ID", zh: "条带 ID" },
  "sceneGraph.inspector.widthM": { en: "Width (m)", zh: "宽度 (m)" },
  "sceneGraph.inspector.metaurbanZone": { en: "MetaUrban Zone", zh: "MetaUrban 区域" },
  "sceneGraph.inspector.cornerLinkedRoads": { en: "Corner-linked Roads", zh: "转角关联道路" },
  "sceneGraph.inspector.guidance": { en: "Guidance", zh: "指引" },
  "sceneGraph.inspector.metaurbanAssetHook": { en: "MetaUrban Asset Hook", zh: "MetaUrban 资产挂点" },
  "sceneGraph.inspector.assetHookNote": { en: "Placeholder badges now, real assets later.", zh: "当前为占位徽标，后续接入真实资产。" },
  "sceneGraph.inspector.addStrip": { en: "Add Strip", zh: "添加条带" },
  "sceneGraph.inspector.noSelection": {
    en: "Select a centerline, junction, roundabout, control point, or building region to edit its properties here.",
    zh: "选择一条中心线、路口、环岛、控制点或建筑区域后，可以在这里编辑属性。",
  },
  "sceneGraph.inspector.missingSelection": { en: "The selected feature no longer exists.", zh: "当前选择的要素已经不存在。" },
  "sceneGraph.inspector.left": { en: "Left", zh: "左侧" },
  "sceneGraph.inspector.right": { en: "Right", zh: "右侧" },
  "sceneGraph.inspector.center": { en: "Center", zh: "中心" },
  "sceneGraph.inspector.leftSide": { en: "Left side", zh: "左侧" },
  "sceneGraph.inspector.rightSide": { en: "Right side", zh: "右侧" },
  "sceneGraph.inspector.forward": { en: "Forward", zh: "正向" },
  "sceneGraph.inspector.reverse": { en: "Reverse", zh: "反向" },
  "sceneGraph.inspector.bidirectional": { en: "Bidirectional", zh: "双向" },
  "sceneGraph.inspector.none": { en: "None", zh: "无" },
  "sceneGraph.strip.driveLane": { en: "Drive Lane", zh: "机动车道" },
  "sceneGraph.strip.busLane": { en: "Bus Lane", zh: "公交车道" },
  "sceneGraph.strip.bikeLane": { en: "Bike Lane", zh: "自行车道" },
  "sceneGraph.strip.parkingLane": { en: "Parking Lane", zh: "停车道" },
  "sceneGraph.strip.median": { en: "Median", zh: "中央分隔带" },
  "sceneGraph.strip.nearRoadBuffer": { en: "Near-Road Buffer", zh: "近路缓冲带" },
  "sceneGraph.strip.nearRoadFurnishing": { en: "Near-Road Furnishing", zh: "近路家具带" },
  "sceneGraph.strip.clearSidewalk": { en: "Clear Sidewalk", zh: "净行人道" },
  "sceneGraph.strip.farFromRoadBuffer": { en: "Far-From-Road Buffer", zh: "远路缓冲带" },
  "sceneGraph.strip.frontageReserve": { en: "Frontage Reserve", zh: "临街预留带" },
  "sceneGraph.strip.centralGreenBelt": { en: "Central Green Belt", zh: "中央绿带" },
  "sceneGraph.strip.sharedStreetSurface": { en: "Shared Street Surface", zh: "共享街道表面" },
  "sceneGraph.strip.coloredPavement": { en: "Colored Pavement", zh: "彩色铺装" },
  "sceneGraph.strip.nearRoadBufferAlt": { en: "Near-road Buffer", zh: "近路缓冲带" },
  "sceneGraph.strip.nearRoadFurnishingAlt": { en: "Near-road Furnishing", zh: "近路家具带" },
  "sceneGraph.strip.mainSidewalk": { en: "Main Sidewalk", zh: "主行人道" },
  "sceneGraph.strip.outerBuffer": { en: "Outer Buffer", zh: "外侧缓冲带" },
  "sceneGraph.strip.validRegion": { en: "Valid Region", zh: "有效区域" },
  "sceneGraph.surface.busLaneWidening": { en: "Bus Lane Widening", zh: "公交车道加宽" },
  "sceneGraph.surface.safetyIsland": { en: "Safety Island", zh: "安全岛" },
  "sceneGraph.surface.sharedSurface": { en: "Shared Surface", zh: "共享表面" },
  "sceneGraph.surface.transitPad": { en: "Transit Pad", zh: "公交站垫面" },
  "sceneGraph.surface.pavingZone": { en: "Paving Zone", zh: "铺装区域" },
  "sceneGraph.surface.carriageway": { en: "Carriageway", zh: "车行道" },
  "sceneGraph.surface.greenMedian": { en: "Green Median", zh: "绿色中央带" },
  "sceneGraph.surface.grassBelt": { en: "Grass Belt", zh: "草带" },
  "sceneGraph.surface.sidewalk": { en: "Sidewalk", zh: "人行道" },
  "sceneGraph.surface.furnishing": { en: "Furnishing", zh: "家具设施" },
  "sceneGraph.surface.contextGround": { en: "Context Ground", zh: "场地地面" },
  "sceneGraph.surface.crossing": { en: "Crossing", zh: "过街" },
  "sceneGraph.zone.plaza": { en: "Plaza", zh: "广场" },
  "sceneGraph.zone.garden": { en: "Garden", zh: "花园" },
  "sceneGraph.zone.playground": { en: "Playground", zh: "游乐场" },
  "sceneGraph.zone.amphitheater": { en: "Amphitheater", zh: "露天剧场" },
  "sceneGraph.zone.outdoorSeating": { en: "Outdoor Seating", zh: "户外座椅区" },
  "sceneGraph.zone.kiosk": { en: "Kiosk", zh: "亭棚" },
  "sceneGraph.zone.sculpture": { en: "Sculpture", zh: "雕塑" },
  "sceneGraph.furniture.bench": { en: "Bench", zh: "长椅" },
  "sceneGraph.furniture.lamp": { en: "Lamp", zh: "路灯" },
  "sceneGraph.furniture.trash": { en: "Trash", zh: "垃圾桶" },
  "sceneGraph.furniture.mailbox": { en: "Mailbox", zh: "邮筒" },
  "sceneGraph.furniture.bollard": { en: "Bollard", zh: "隔离桩" },
  "sceneGraph.furniture.sign": { en: "Sign", zh: "标识牌" },
  "sceneGraph.furniture.hydrant": { en: "Hydrant", zh: "消防栓" },
  "sceneGraph.furniture.busStop": { en: "Bus Stop", zh: "公交站" },
  "sceneGraph.furniture.tree": { en: "Tree", zh: "树木" },
  "sceneGraph.metaurban.optional": { en: "MetaUrban real assets are optional for this annotator.", zh: "该标注器中 MetaUrban 真实资产是可选项。" },
  "sceneGraph.metaurban.pull": {
    en: "To add them later, run `python metaurban/pull_asset.py --update`.",
    zh: "后续如需添加，可运行 `python metaurban/pull_asset.py --update`。",
  },
  "sceneGraph.metaurban.place": {
    en: "Place assets under `metaurban/assets` and `metaurban/assets_pedestrian`.",
    zh: "将资产放在 `metaurban/assets` 和 `metaurban/assets_pedestrian` 下。",
  },
  "sceneGraph.guidance.driveLane": { en: "Vehicular through-movement space.", zh: "车辆直行通行空间。" },
  "sceneGraph.guidance.busLane": { en: "Transit-priority movement space.", zh: "公交优先通行空间。" },
  "sceneGraph.guidance.bikeLane": { en: "Bike movement space.", zh: "自行车通行空间。" },
  "sceneGraph.guidance.parkingLane": { en: "Parking or loading edge space.", zh: "停车或装卸边缘空间。" },
  "sceneGraph.guidance.median": { en: "Central separator or refuge zone.", zh: "中央分隔或庇护区域。" },
  "sceneGraph.guidance.nearroadBuffer": {
    en: "MetaUrban nearroad_buffer_sidewalk objects typically sit here.",
    zh: "MetaUrban nearroad_buffer_sidewalk 对象通常放在这里。",
  },
  "sceneGraph.guidance.nearroadFurnishing": {
    en: "MetaUrban nearroad_sidewalk furniture and utilities typically sit here.",
    zh: "MetaUrban nearroad_sidewalk 家具和市政设施通常放在这里。",
  },
  "sceneGraph.guidance.clearSidewalk": {
    en: "MetaUrban main_sidewalk pedestrian flows and mailbox-scale objects typically sit here.",
    zh: "MetaUrban main_sidewalk 行人流线和邮筒尺度对象通常放在这里。",
  },
  "sceneGraph.guidance.farBuffer": {
    en: "MetaUrban farfromroad_sidewalk furniture or planting can extend here.",
    zh: "MetaUrban farfromroad_sidewalk 家具或种植可延伸到这里。",
  },
  "sceneGraph.guidance.frontageReserve": {
    en: "MetaUrban valid_region buildings and frontage reserve typically start here.",
    zh: "MetaUrban valid_region 建筑与临街预留通常从这里开始。",
  },
  "sceneGraph.guidance.grassBelt": { en: "Central grass or planted median strip.", zh: "中央草带或种植分隔带。" },
  "sceneGraph.guidance.sharedSurface": { en: "Shared pedestrian/vehicle street surface.", zh: "行人与车辆共享街道表面。" },
  "sceneGraph.guidance.coloredPavement": { en: "Decorative colored paving band.", zh: "装饰性彩色铺装带。" },
  "sceneGraph.metric.roads": { en: "Roads", zh: "道路" },
  "sceneGraph.metric.explicitJn": { en: "Explicit Jn", zh: "显式路口" },
  "sceneGraph.metric.legacyJn": { en: "Legacy Jn", zh: "旧路口" },
  "sceneGraph.metric.derivedJn": { en: "Derived Jn", zh: "派生路口" },
  "sceneGraph.metric.topologyJn": { en: "Topology Jn", zh: "拓扑路口" },
  "sceneGraph.metric.tCross": { en: "T / Cross", zh: "T / 十字" },
  "sceneGraph.metric.avgWidth": { en: "Avg Width", zh: "平均宽度" },
  "sceneGraph.metric.maxRefBand": { en: "Max Ref Band", zh: "最大参考带" },
  "sceneGraph.metric.driveLanes": { en: "Drive Lanes", zh: "机动车道" },
  "sceneGraph.metric.bikeBus": { en: "Bike / Bus", zh: "自行车 / 公交" },
  "sceneGraph.metric.parking": { en: "Parking", zh: "停车" },
  "sceneGraph.metric.strips": { en: "Strips", zh: "条带" },
  "sceneGraph.metric.furniture": { en: "Furniture", zh: "家具" },
  "sceneGraph.metric.zoneFurniture": { en: "Zone Furn.", zh: "区域家具" },
  "sceneGraph.metric.bldgRegions": { en: "Bldg Regions", zh: "建筑区域" },
  "sceneGraph.metric.funcZones": { en: "Func Zones", zh: "功能区" },
  "sceneGraph.metric.designSurfaces": { en: "Design Surfaces", zh: "设计面" },
  "sceneGraph.metric.scale": { en: "Scale", zh: "比例" },
  "sceneGraph.metric.graph": { en: "Graph", zh: "Graph" },
  "sceneGraph.metric.pending": { en: "Pending", zh: "待处理" },
  "sceneGraph.metric.segments": { en: "Segments", zh: "分段" },
  "sceneGraph.metric.edges": { en: "Edges", zh: "边" },
  "sceneGraph.metric.crossSections": { en: "Cross Sections", zh: "横断面" },
  "sceneGraph.metric.junctionSegments": { en: "Junction Segments", zh: "路口分段" },
};

export function normalizeViewerLanguage(value: unknown): ViewerLanguage {
  return value === "zh" || value === "mixed" || value === "en" ? value : "en";
}

export function loadViewerLanguage(): ViewerLanguage {
  return normalizeViewerLanguage(localStorage.getItem(VIEWER_LANGUAGE_STORAGE_KEY));
}

export function viewerText(language: ViewerLanguage, en: string, zh: string): string {
  switch (language) {
    case "zh":
      return zh;
    case "mixed":
      return `${en} · ${zh}`;
    default:
      return en;
  }
}

export function translateViewerKey(language: ViewerLanguage, key: string): string | null {
  const translation = TRANSLATIONS[key];
  if (!translation) {
    return null;
  }
  return viewerText(language, translation.en, translation.zh);
}

export function translateViewerLiteral(language: ViewerLanguage, sourceText: string): string | null {
  const normalizedSource = sourceText.trim();
  if (!normalizedSource) {
    return null;
  }
  for (const translation of Object.values(TRANSLATIONS)) {
    const mixed = viewerText("mixed", translation.en, translation.zh);
    if (normalizedSource === translation.en || normalizedSource === translation.zh || normalizedSource === mixed) {
      return viewerText(language, translation.en, translation.zh);
    }
  }
  return null;
}

export function setViewerLanguage(language: ViewerLanguage): void {
  localStorage.setItem(VIEWER_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent<{ language: ViewerLanguage }>(VIEWER_LANGUAGE_EVENT, {
    detail: { language },
  }));
}

export function applyViewerTranslations(root: ParentNode, language: ViewerLanguage): void {
  root.querySelectorAll<HTMLElement>("[data-i18n-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nKey || "");
    if (translated !== null) {
      element.textContent = translated;
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-source-text]").forEach((element) => {
    if (element.dataset.i18nKey) {
      return;
    }
    const translated = translateViewerLiteral(language, element.dataset.i18nSourceText || "");
    if (translated !== null) {
      element.textContent = translated;
    }
  });

  const literalContainers = new Set<HTMLElement>();
  if (root instanceof HTMLElement && root.dataset.i18nScope === "literal") {
    literalContainers.add(root);
  }
  root.querySelectorAll<HTMLElement>('[data-i18n-scope="literal"]').forEach((element) => {
    literalContainers.add(element);
  });
  const literalSelector = [
    "button",
    "div.scene-micro-note",
    "div.scene-empty-note",
    "h3",
    "label.scene-file-button",
    "option",
    "span",
    "strong",
    "summary",
    "th",
  ].join(",");
  literalContainers.forEach((container) => {
    container.querySelectorAll<HTMLElement>(literalSelector).forEach((element) => {
      if (element.dataset.i18nKey || element.dataset.i18nSourceText) {
        return;
      }
      const text = element.textContent?.trim() ?? "";
      if (!text || element.childElementCount > 0) {
        return;
      }
      const translated = translateViewerLiteral(language, text);
      if (translated !== null) {
        element.textContent = translated;
      }
    });
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-title-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nTitleKey || "");
    if (translated !== null) {
      element.setAttribute("title", translated);
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label-key]").forEach((element) => {
    const translated = translateViewerKey(language, element.dataset.i18nAriaLabelKey || "");
    if (translated !== null) {
      element.setAttribute("aria-label", translated);
    }
  });
}
