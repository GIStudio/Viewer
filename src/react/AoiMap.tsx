import { useEffect, useRef } from "react";

import {
  DEFAULT_GUANGZHOU_OSM_VIEW,
  mountOsmAoiPicker,
  type OsmAoiPickerController,
  type OsmAoiSelection,
  type OsmMapView,
} from "../osm-aoi-picker";

type AoiMapProps = {
  selection: OsmAoiSelection | null;
  onSelectionChange: (selection: OsmAoiSelection | null) => void;
  initialView?: OsmMapView;
  onViewChange?: (view: OsmMapView) => void;
  readonly?: boolean;
  language?: "zh" | "en";
};

export function AoiMap({
  selection,
  onSelectionChange,
  initialView = DEFAULT_GUANGZHOU_OSM_VIEW,
  onViewChange,
  readonly = false,
  language = "zh",
}: AoiMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OsmAoiPickerController | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onViewChangeRef = useRef(onViewChange);
  onSelectionChangeRef.current = onSelectionChange;
  onViewChangeRef.current = onViewChange;

  useEffect(() => {
    if (!host.current) return undefined;
    controller.current = mountOsmAoiPicker(host.current, {
      initialView,
      initialSelection: selection,
      readonly,
      language,
      showConfirm: false,
      showCityPicker: !readonly,
      onViewChange: (next) => onViewChangeRef.current?.(next),
      onSelectionChange: (next) => onSelectionChangeRef.current(next),
      onConfirm: async () => undefined,
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, [language, readonly]);

  useEffect(() => {
    controller.current?.setSelection(selection);
  }, [selection]);

  return <div className="course-aoi-map" ref={host} aria-label="OpenStreetMap area selector" />;
}
