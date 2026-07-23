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

export function defaultCameraSnapshotMode(canViewAnnotated: boolean): CameraSnapshotMode {
  return canViewAnnotated ? 'annotated' : 'detection';
}

type CameraSnapshotModeSelectorProps = {
  value: CameraSnapshotMode;
  canViewAnnotated: boolean;
  onChange: (mode: CameraSnapshotMode) => void;
  ariaLabel?: string;
};

export function CameraSnapshotModeSelector({
  value,
  canViewAnnotated,
  onChange,
  ariaLabel = 'Режим просмотра кадра'
}: CameraSnapshotModeSelectorProps) {
  const modes = CAMERA_SNAPSHOT_MODE_ORDER.filter(
    mode => mode !== 'annotated' || canViewAnnotated
  );

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
