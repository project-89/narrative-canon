/**
 * Camera Angle Text Builder
 *
 * Maps three camera parameters (azimuth, elevation, distance)
 * to a single cinematography description string for re-rendering
 * scenes from different virtual camera positions.
 */

export interface CameraOption {
  value: string;
  label: string;
}

export const AZIMUTH_OPTIONS: CameraOption[] = [
  { value: "front", label: "Front" },
  { value: "3/4 front-left", label: "3/4 Front-Left" },
  { value: "3/4 front-right", label: "3/4 Front-Right" },
  { value: "profile left", label: "Profile Left" },
  { value: "profile right", label: "Profile Right" },
  { value: "3/4 rear-left", label: "3/4 Rear-Left" },
  { value: "3/4 rear-right", label: "3/4 Rear-Right" },
  { value: "rear", label: "Rear" },
];

export const ELEVATION_OPTIONS: CameraOption[] = [
  { value: "worm's eye", label: "Worm's Eye" },
  { value: "low angle", label: "Low Angle" },
  { value: "eye level", label: "Eye Level" },
  { value: "slightly elevated", label: "Slightly Elevated" },
  { value: "high angle", label: "High Angle" },
  { value: "bird's eye", label: "Bird's Eye" },
];

export const DISTANCE_OPTIONS: CameraOption[] = [
  { value: "extreme close-up", label: "Extreme Close-Up" },
  { value: "close-up", label: "Close-Up" },
  { value: "medium close-up", label: "Medium Close-Up" },
  { value: "medium shot", label: "Medium Shot" },
  { value: "medium wide", label: "Medium Wide" },
  { value: "wide shot", label: "Wide Shot" },
  { value: "extreme wide", label: "Extreme Wide" },
];

export function getCameraDescription(
  azimuth: string,
  elevation: string,
  distance: string,
): string {
  return `${azimuth} view, ${elevation}, ${distance}`;
}
