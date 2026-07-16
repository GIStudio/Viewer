import { useEffect, useRef } from "react";

import {
  mountOsmAoiPicker,
  type OsmAoiPickerController,
  type Wgs84Bbox,
} from "../osm-aoi-picker";

type AoiMapProps = {
  bbox: Wgs84Bbox;
  onChange: (bbox: Wgs84Bbox) => void;
  readonly?: boolean;
  language?: "zh" | "en";
};

export function AoiMap({ bbox, onChange, readonly = false, language = "zh" }: AoiMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OsmAoiPickerController | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return undefined;
    controller.current = mountOsmAoiPicker(host.current, {
      initialBbox: bbox,
      readonly,
      language,
      showConfirm: false,
      showCityPicker: !readonly,
      onBboxChange: (next) => onChangeRef.current(next),
      onConfirm: async () => undefined,
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, [language, readonly]);

  useEffect(() => {
    controller.current?.setBbox(bbox);
  }, [bbox]);

  return <div className="course-aoi-map" ref={host} aria-label="OpenStreetMap area selector" />;
}
