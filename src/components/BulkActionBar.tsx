import { Button } from './UiKit';

type BulkActionBarProps = {
  selectedCount: number;
  totalCount: number;
  busy?: boolean;
  canMutate?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
};

export function BulkActionBar({
  selectedCount,
  totalCount,
  busy = false,
  canMutate = true,
  onSelectAll,
  onClear,
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
        <Button type="button" variant="ghost" onClick={onSelectAll} disabled={busy || totalCount === 0}>
          Выбрать все отфильтрованные
        </Button>
        <Button type="button" variant="ghost" onClick={onClear} disabled={busy || !hasSelection}>
          Снять выбор
        </Button>
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
