import { useEffect, useRef } from "react";

import {
  mountOsmRoadStudyPicker,
  type OsmRoadStudyPickerController,
} from "../osm-road-study-picker";
import type {
  OsmRoadPreview,
  OsmRoadStudyResponse,
  OsmRoadStudySelection,
} from "../workflow-api";

export function OsmRoadStudyMap({
  preview,
  language,
  bufferReadonly = false,
  onResolve,
  onApply,
  onBack,
}: {
  preview: OsmRoadPreview;
  language: "zh" | "en";
  bufferReadonly?: boolean;
  onResolve: (selection: OsmRoadStudySelection) => Promise<OsmRoadStudyResponse>;
  onApply: (result: OsmRoadStudyResponse) => void | Promise<void>;
  onBack: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<OsmRoadStudyPickerController | null>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    controller.current = mountOsmRoadStudyPicker(host.current, {
      preview,
      language,
      bufferReadonly,
      onResolve,
      onApply,
      onBack,
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, [preview.preview_id, language, bufferReadonly]);

  return <div className="course-osm-road-study-map" ref={host} />;
}
