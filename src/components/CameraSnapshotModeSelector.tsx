import type { CameraSnapshotMode } from '@/api/cameras';

export const CAMERA_SNAPSHOT_MODE_CONTENT: Record<
  CameraSnapshotMode,
  { label: string; title: string; description: string }
> = {
  annotated: {
    label: 'С разметкой',
    title: 'С разметкой',
    description: 'Последняя визуализация распознавания'
  },
  detection: {
    label: 'Последнее распознавание',
    title: 'Последнее распознавание',
    description: 'Кадр, сохранённый в момент последней детекции'
  },
  latest: {
    label: 'Последний снимок',
    title: 'Последний снимок',
    description: 'Свежий кадр из видеопотока'
  }
};

const CAMERA_SNAPSHOT_MODE_ORDER: CameraSnapshotMode[] = [
  'annotated',
  'detection',
  'latest'
];

export type CameraSnapshotAccess = {
  canViewStoredSnapshots: boolean;
  canViewLiveSnapshot: boolean;
};

export function canViewCameraSnapshotMode(
  mode: CameraSnapshotMode,
  access: CameraSnapshotAccess
) {
  return mode === 'latest'
    ? access.canViewLiveSnapshot
    : access.canViewStoredSnapshots;
}

export function availableCameraSnapshotModes(access: CameraSnapshotAccess) {
  return CAMERA_SNAPSHOT_MODE_ORDER.filter(mode => canViewCameraSnapshotMode(mode, access));
}

export function defaultCameraSnapshotMode(access: CameraSnapshotAccess): CameraSnapshotMode {
  return availableCameraSnapshotModes(access)[0] ?? 'latest';
}

type CameraSnapshotModeSelectorProps = {
  value: CameraSnapshotMode;
  canViewStoredSnapshots: boolean;
  canViewLiveSnapshot: boolean;
  onChange: (mode: CameraSnapshotMode) => void;
  ariaLabel?: string;
};

export function CameraSnapshotModeSelector({
  value,
  canViewStoredSnapshots,
  canViewLiveSnapshot,
  onChange,
  ariaLabel = 'Режим просмотра кадра'
}: CameraSnapshotModeSelectorProps) {
  const modes = availableCameraSnapshotModes({
    canViewStoredSnapshots,
    canViewLiveSnapshot
  });

  if (modes.length === 0) return null;

  return (
    <div
      className={`snapshot-mode-toggle ${modes.length === 3 ? 'three-options' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {modes.map(mode => {
        const content = CAMERA_SNAPSHOT_MODE_CONTENT[mode];
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={value === mode}
            className={`snapshot-mode-option ${value === mode ? 'active' : ''}`}
            title={content.label}
            onClick={() => onChange(mode)}
          >
            {content.label}
          </button>
        );
      })}
    </div>
  );
}
