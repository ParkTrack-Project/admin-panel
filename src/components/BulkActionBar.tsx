import { useEffect, useRef } from 'react';
import { Button } from './UiKit';

type BulkActionBarProps = {
  selectedCount: number;
  totalCount: number;
  busy?: boolean;
  canMutate?: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
};

type BulkSelectionCheckboxProps = {
  selectedCount: number;
  totalCount: number;
  busy?: boolean;
  label: string;
  onToggleAll: (checked: boolean) => void;
};

export function BulkSelectionCheckbox({
  selectedCount,
  totalCount,
  busy = false,
  label,
  onToggleAll
}: BulkSelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const checked = totalCount > 0 && selectedCount === totalCount;
  const indeterminate = selectedCount > 0 && selectedCount < totalCount;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      disabled={busy || totalCount === 0}
      onChange={() => onToggleAll(!checked)}
      aria-label={checked ? 'Снять выделение' : label}
      title={checked ? 'Снять выделение' : label}
    />
  );
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  busy = false,
  canMutate = true,
  onActivate,
  onDeactivate,
  onDelete
}: BulkActionBarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-summary">
        Выбрано: <strong>{selectedCount}</strong> из {totalCount}
      </div>
      <div className="bulk-action-buttons">
        <Button type="button" onClick={onActivate} disabled={busy || !hasSelection || !canMutate}>
          Активировать
        </Button>
        <Button type="button" variant="ghost" onClick={onDeactivate} disabled={busy || !hasSelection || !canMutate}>
          Деактивировать
        </Button>
        <Button type="button" variant="danger" onClick={onDelete} disabled={busy || !hasSelection || !canMutate}>
          Удалить
        </Button>
      </div>
    </div>
  );
}
