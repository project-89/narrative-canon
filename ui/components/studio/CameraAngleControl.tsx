"use client";

import { CameraGizmoPopup } from "./CameraGizmoPopup";

interface CameraAngleControlProps {
  sourceImageUrl: string;
  sourceLabel: string;
  onGenerate: (cameraDescription: string) => void;
  isGenerating: boolean;
  onClose: () => void;
}

/**
 * Thin wrapper — opens the 3D camera gizmo popup immediately.
 * Props interface unchanged so page.tsx needs zero changes.
 */
export function CameraAngleControl(props: CameraAngleControlProps) {
  return <CameraGizmoPopup {...props} />;
}
