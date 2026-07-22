const OSM_PICKER_INTENT_KEY = "roadgen3d:professional-open-osm-picker";

export function requestProfessionalOsmPicker(): void {
  try {
    window.sessionStorage.setItem(OSM_PICKER_INTENT_KEY, "1");
  } catch {
    // Navigation still reaches 01A when storage is unavailable.
  }
}

export function consumeProfessionalOsmPickerRequest(): boolean {
  try {
    const requested = window.sessionStorage.getItem(OSM_PICKER_INTENT_KEY) === "1";
    window.sessionStorage.removeItem(OSM_PICKER_INTENT_KEY);
    return requested;
  } catch {
    return false;
  }
}
