import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { useStore } from '@/store/useStore';
import { navigate } from '@/router/routes';
import type { ParkingZone } from '@/types';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { useSessionStore } from '@/auth/sessionStore';

type ZoneFilters = {
  cameraId: string;
  partnerId: string;
  status: 'all' | 'active' | 'inactive';
  maxPay: string;
};

type ZoneEditorState = {
  zoneType: ParkingZone['zone_type'];
  capacity: string;
  pay: string;
  partnerId: string;
  locationType: string;
  isActive: boolean;
  isPrivate: boolean;
  isAccessible: boolean;
};

type ZoneSaveState = {
  loading: boolean;
  error?: string;
};

type ZoneCreateState = {
  cameraId: string;
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

function polygonSummary(zone: ParkingZone) {
  const imagePolygon = zone.image_polygon ?? zone.image_quad;
  const geoPoints = zone.geometry?.coordinates?.[0]?.length
    ? Math.max(0, zone.geometry.coordinates[0].length - 1)
    : zone.points.length;

  return {
    imageVertices: imagePolygon?.length ?? 0,
    geoVertices: geoPoints
  };
}

function zoneToEditor(zone: ParkingZone): ZoneEditorState {
  return {
    zoneType: zone.zone_type,
    capacity: String(zone.capacity),
    pay: String(zone.pay),
    partnerId: zone.partner_id === null || zone.partner_id === undefined ? '' : String(zone.partner_id),
    locationType: zone.location_type ?? '',
    isActive: zone.is_active !== false,
    isPrivate: zone.is_private === true,
    isAccessible: zone.is_accessible === true
  };
}

function normalizeEditor(editor: ZoneEditorState) {
  return {
    zoneType: editor.zoneType,
    capacity: editor.capacity.trim(),
    pay: editor.pay.trim(),
    partnerId: editor.partnerId.trim(),
    locationType: editor.locationType.trim(),
    isActive: editor.isActive,
    isPrivate: editor.isPrivate,
    isAccessible: editor.isAccessible
  };
}

export default function ZonesAdminPage() {
  const store = useStore();
  const activeZoneId = useStore(state => state.activeZoneId);
  const selectZone = useStore(state => state.selectZone);
  const notifySuccess = useFeedbackStore(state => state.success);
  const confirmAction = useFeedbackStore(state => state.confirm);
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>();
  const [editor, setEditor] = useState<ZoneEditorState | null>(null);
  const [saveState, setSaveState] = useState<ZoneSaveState>({ loading: false });
  const [createState, setCreateState] = useState<ZoneCreateState>({
    cameraId: ''
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filters, setFilters] = useState<ZoneFilters>({
    cameraId: '',
    partnerId: '',
    status: 'all',
    maxPay: ''
  });

  const selectedZone = useMemo(
    () => zones.find(zone => String(zone.id) === selectedZoneId),
    [zones, selectedZoneId]
  );

  const activeCount = useMemo(
    () => zones.filter(zone => zone.is_active !== false).length,
    [zones]
  );

  const hasEditorChanges = useMemo(() => {
    if (!selectedZone || !editor) return false;
    return JSON.stringify(normalizeEditor(editor)) !== JSON.stringify(normalizeEditor(zoneToEditor(selectedZone)));
  }, [selectedZone, editor]);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const nextZones = await api.listZones({
        camera_id: filters.cameraId ? Number(filters.cameraId) : undefined,
        partner_id: filters.partnerId ? Number(filters.partnerId) : currentPartnerId,
        is_active: filters.status === 'all' ? undefined : filters.status === 'active',
        max_pay: filters.maxPay ? Number(filters.maxPay) : undefined
      });
      setZones(nextZones);
      setSelectedZoneId(current =>
        current && nextZones.some(zone => String(zone.id) === current)
          ? current
          : store.activeZoneId && nextZones.some(zone => String(zone.id) === String(store.activeZoneId))
            ? String(store.activeZoneId)
            : nextZones[0]
              ? String(nextZones[0].id)
              : undefined
      );
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [currentPartnerId]);

  useEffect(() => {
    if (!selectedZone) {
      setEditor(null);
      setSaveState({ loading: false });
      return;
    }
    setEditor(zoneToEditor(selectedZone));
    setSaveState({ loading: false });
  }, [selectedZone?.id]);

  useEffect(() => {
    if (selectedZoneId && String(activeZoneId) !== selectedZoneId) {
      selectZone(selectedZoneId);
    }
  }, [activeZoneId, selectedZoneId, selectZone]);

  useEffect(() => {
    if (selectedZone) {
      setCreateState(prev => ({ ...prev, cameraId: String(selectedZone.camera_id) }));
      return;
    }
    if (filters.cameraId.trim()) {
      setCreateState(prev => ({ ...prev, cameraId: filters.cameraId.trim() }));
    }
  }, [selectedZone?.id, filters.cameraId]);

  async function prepareZoneWorkspace(zone: ParkingZone) {
    store.setLabelerReturnRoute('zones');
    store.setCamera(String(zone.camera_id));
    store.selectZone(zone.id);
    await Promise.all([
      store.loadCameraMeta(zone.camera_id),
      store.loadZones()
    ]);
  }

  async function openZoneImageGeometry(zone: ParkingZone) {
    setError(undefined);
    try {
      await prepareZoneWorkspace(zone);
      store.setTool('editZone');
      store.setViewMode('labeler');
      navigate('labeler');
    } catch (err: any) {
      setError(`Не удалось открыть геометрию зоны: ${String(err?.message || err)}`);
    }
  }

  async function openZoneMapGeometry(zone: ParkingZone) {
    setError(undefined);
    try {
      await prepareZoneWorkspace(zone);
      store.setTool('select');
      navigate('labeler');
      window.setTimeout(() => {
        store.setViewMode('zoneMapSelector');
      }, 0);
    } catch (err: any) {
      setError(`Не удалось открыть карту зоны: ${String(err?.message || err)}`);
    }
  }

  async function startCreateZone() {
    const cameraId = parseInt(createState.cameraId, 10);
    if (!Number.isFinite(cameraId) || cameraId < 1) {
      setError('Для создания зоны укажите корректный Camera ID.');
      return;
    }

    setCreateLoading(true);
    setError(undefined);
    try {
      await api.getCamera(cameraId);
      store.setLabelerReturnRoute('zones');
      store.setCamera(String(cameraId));
      await Promise.all([
        store.loadCameraMeta(cameraId),
        store.loadZones()
      ]);
      store.selectZone(undefined);
      store.zoneDraftClear();
      store.addZone();
      store.setViewMode('labeler');
      navigate('labeler');
    } catch (err: any) {
      setError(`Не удалось открыть создание зоны: ${String(err?.message || err)}`);
    } finally {
      setCreateLoading(false);
    }
  }

  async function onSaveZone() {
    if (!selectedZone || !editor) return;

    const capacity = parseInt(editor.capacity, 10);
    const pay = parseInt(editor.pay, 10);
    const partnerId = editor.partnerId.trim() ? parseInt(editor.partnerId, 10) : null;

    if (!Number.isFinite(capacity) || capacity < 1) {
      setSaveState({ loading: false, error: 'Вместимость зоны должна быть не меньше 1.' });
      return;
    }

    if (!Number.isFinite(pay) || pay < 0) {
      setSaveState({ loading: false, error: 'Цена зоны должна быть неотрицательной.' });
      return;
    }

    if (editor.partnerId.trim() && (!Number.isFinite(partnerId) || partnerId === null || partnerId < 1)) {
      setSaveState({ loading: false, error: 'Partner ID должен быть положительным числом.' });
      return;
    }

    setSaveState({ loading: true });
    try {
      const updated = await api.updateZone(selectedZone.id, {
        ...selectedZone,
        zone_type: editor.zoneType,
        capacity,
        pay,
        partner_id: partnerId,
        location_type: editor.locationType.trim() || null,
        is_active: editor.isActive,
        is_private: editor.isPrivate,
        is_accessible: editor.isAccessible
      });

      setZones(prev => prev.map(zone => String(zone.id) === String(updated.id) ? updated : zone));
      setEditor(zoneToEditor(updated));
      setSaveState({ loading: false });
      notifySuccess('Настройки зоны сохранены.');
    } catch (err: any) {
      setSaveState({ loading: false, error: `Ошибка сохранения зоны: ${String(err?.message || err)}` });
    }
  }

  async function onDeleteZone() {
    if (!selectedZone) return;
    const shouldDelete = await confirmAction({
      title: 'Удалить зону?',
      message: `Зона #${selectedZone.id} будет удалена. Это действие нельзя отменить.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });
    if (!shouldDelete) {
      return;
    }

    setDeleteLoading(true);
    setError(undefined);
    try {
      await api.deleteZone(selectedZone.id);
      const removedId = String(selectedZone.id);
      const nextZones = zones.filter(zone => String(zone.id) !== removedId);
      setZones(nextZones);
      setSelectedZoneId(nextZones[0] ? String(nextZones[0].id) : undefined);
      setSaveState({ loading: false });
      notifySuccess(`Зона #${removedId} удалена.`);
    } catch (err: any) {
      setError(`Ошибка удаления зоны: ${String(err?.message || err)}`);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Зоны</h1>
          <p>
            Парковочные зоны, фильтры мониторинга и геометрия разметки
            {currentPartnerId !== undefined ? ` · партнёр #${currentPartnerId}` : ''}
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button onClick={startCreateZone} disabled={createLoading}>
            {createLoading ? 'Открытие...' : '+ Новая зона'}
          </Button>
          <Button onClick={load} disabled={loading}>{loading ? 'Загрузка...' : 'Обновить'}</Button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Всего зон</div>
          <div className="metric-value">{zones.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Активных</div>
          <div className="metric-value">{activeCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">С камерами</div>
          <div className="metric-value">{zones.filter(zone => zone.camera_id > 0).length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Платных</div>
          <div className="metric-value">{zones.filter(zone => zone.pay > 0).length}</div>
        </div>
      </div>

      <div className="filter-bar">
        <Field label="Camera ID">
          <Input
            value={filters.cameraId}
            onChange={e => setFilters(prev => ({ ...prev, cameraId: e.target.value }))}
            placeholder="Все камеры"
          />
        </Field>
        <Field label="Partner ID">
          <Input
            value={filters.partnerId || (currentPartnerId !== undefined ? String(currentPartnerId) : '')}
            onChange={e => setFilters(prev => ({ ...prev, partnerId: e.target.value }))}
            placeholder={currentPartnerId !== undefined ? `Текущий: #${currentPartnerId}` : 'Все партнёры'}
          />
        </Field>
        <Field label="Статус">
          <Select
            value={filters.status}
            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value as ZoneFilters['status'] }))}
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </Select>
        </Field>
        <Field label="Макс. цена">
          <Input
            type="number"
            min={0}
            value={filters.maxPay}
            onChange={e => setFilters(prev => ({ ...prev, maxPay: e.target.value }))}
            placeholder="Без ограничения"
          />
        </Field>
        <Button variant="ghost" onClick={load} disabled={loading}>Применить</Button>
      </div>

      <div className="section-panel zone-create-panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Создание зоны</h2>
            <div className="small">Новая зона создаётся через разметчик, потому что геометрию нужно отрисовать на изображении камеры.</div>
          </div>
        </div>
        <div className="zone-create-grid">
          <Field label="Camera ID">
            <Input
              value={createState.cameraId}
              onChange={e => setCreateState(prev => ({ ...prev, cameraId: e.target.value }))}
              placeholder="ID камеры"
            />
          </Field>
          <div className="zone-create-actions">
            <Button onClick={startCreateZone} disabled={createLoading}>
              {createLoading ? 'Открытие...' : 'Открыть создание в разметке'}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="zones-admin-grid">
        <div className="section-panel">
          <div className="table-header zones-admin">
            <span>ID</span>
            <span>Камера</span>
            <span>Тип</span>
            <span>Места</span>
            <span>Свободно</span>
            <span>Цена</span>
            <span>Статус</span>
            <span>Локация</span>
          </div>
          <div className="table-list">
            {zones.map(zone => {
              const freeCount = zone.free_count ?? (typeof zone.occupied === 'number' ? Math.max(0, zone.capacity - zone.occupied) : undefined);
              const isSelected = String(zone.id) === selectedZoneId;
              return (
                <button
                  type="button"
                  key={String(zone.id)}
                  className={`table-row zones-admin zone-row-button ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedZoneId(String(zone.id));
                    selectZone(zone.id);
                  }}
                >
                  <span>{String(zone.id)}</span>
                  <span>{zone.camera_id}</span>
                  <span>{zone.zone_type}</span>
                  <span>{zone.capacity}</span>
                  <span>{freeCount ?? '—'}</span>
                  <span>{zone.pay}</span>
                  <span className={`status-pill ${zone.is_active === false ? 'paused' : 'active'}`}>
                    {zone.is_active === false ? 'paused' : 'active'}
                  </span>
                  <span>{zone.location_type ?? '—'}</span>
                </button>
              );
            })}
            {!loading && zones.length === 0 && <div className="empty-state">Зоны не найдены</div>}
          </div>
        </div>

        <div className="section-panel zone-detail-panel">
          {selectedZone ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>Зона #{selectedZone.id}</h2>
                  <div className="small">Камера: {selectedZone.camera_id}</div>
                </div>
                <span className={`status-pill ${selectedZone.is_active === false ? 'paused' : 'active'}`}>
                  {selectedZone.is_active === false ? 'Неактивна' : 'Активна'}
                </span>
              </div>

              <div className="details-grid zone-details-grid">
                <div className="detail-card">
                  <div className="metric-label">Тип</div>
                  <div className="detail-value">{selectedZone.zone_type}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Вместимость</div>
                  <div className="detail-value">{selectedZone.capacity}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Свободно</div>
                  <div className="detail-value">
                    {selectedZone.free_count ?? (typeof selectedZone.occupied === 'number' ? Math.max(0, selectedZone.capacity - selectedZone.occupied) : '—')}
                  </div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Цена</div>
                  <div className="detail-value">{selectedZone.pay}</div>
                </div>
              </div>

              <div className="details-grid zone-meta-grid">
                <div className="detail-card">
                  <div className="metric-label">Partner ID</div>
                  <div className="detail-value">{selectedZone.partner_id ?? '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Confidence</div>
                  <div className="detail-value">
                    {typeof selectedZone.confidence === 'number'
                      ? `${selectedZone.confidence.toFixed(2)}${selectedZone.confidence_level ? ` (${selectedZone.confidence_level})` : ''}`
                      : '—'}
                  </div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Location</div>
                  <div className="detail-value">{selectedZone.location_type ?? '—'}</div>
                </div>
                <div className="detail-card">
                  <div className="metric-label">Доступность</div>
                  <div className="detail-value">
                    {selectedZone.is_private ? 'private' : 'public'} / {selectedZone.is_accessible ? 'accessible' : 'regular'}
                  </div>
                </div>
              </div>

              <div className="zone-geometry-summary">
                <div className="small">Вершины на изображении: {polygonSummary(selectedZone).imageVertices}</div>
                <div className="small">Вершины в geometry: {polygonSummary(selectedZone).geoVertices}</div>
                <div className="small">Создано: {formatDate(selectedZone.created_at)}</div>
                <div className="small">Обновлено: {formatDate(selectedZone.updated_at)}</div>
                <div className="small">Occupancy updated: {formatDate(selectedZone.occupancy_updated_at)}</div>
              </div>

              <div className="zone-geometry-actions">
                <Button onClick={() => openZoneImageGeometry(selectedZone)}>
                  Редактировать полигон
                </Button>
                <Button variant="ghost" onClick={() => openZoneMapGeometry(selectedZone)}>
                  Геометрия на карте
                </Button>
              </div>

              {editor && (
                <div className="zone-settings-grid">
                  <Field label="Тип зоны">
                    <Select
                      value={editor.zoneType}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, zoneType: e.target.value as ParkingZone['zone_type'] }) : prev);
                      }}
                    >
                      <option value="standard">standard</option>
                      <option value="parallel">parallel</option>
                      <option value="disabled">disabled</option>
                    </Select>
                  </Field>
                  <Field label="Вместимость">
                    <Input
                      type="number"
                      min={1}
                      value={editor.capacity}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, capacity: e.target.value }) : prev);
                      }}
                    />
                  </Field>
                  <Field label="Цена">
                    <Input
                      type="number"
                      min={0}
                      value={editor.pay}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, pay: e.target.value }) : prev);
                      }}
                    />
                  </Field>
                  <Field label="Partner ID">
                    <Input
                      value={editor.partnerId}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, partnerId: e.target.value }) : prev);
                      }}
                      placeholder="Не задан"
                    />
                  </Field>
                  <Field label="Location Type">
                    <Input
                      value={editor.locationType}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, locationType: e.target.value }) : prev);
                      }}
                      placeholder="street / yard / parking_lot / garage"
                    />
                  </Field>
                  <Field label="Флаги">
                    <div className="zone-flags-grid">
                      <label className="zone-flag-toggle">
                        <input
                          type="checkbox"
                          checked={editor.isActive}
                          onChange={e => {
                            setSaveState(prev => ({ loading: false, error: undefined }));
                            setEditor(prev => prev ? ({ ...prev, isActive: e.target.checked }) : prev);
                          }}
                        />
                        <span className="small">Активна</span>
                      </label>
                      <label className="zone-flag-toggle">
                        <input
                          type="checkbox"
                          checked={editor.isPrivate}
                          onChange={e => {
                            setSaveState(prev => ({ loading: false, error: undefined }));
                            setEditor(prev => prev ? ({ ...prev, isPrivate: e.target.checked }) : prev);
                          }}
                        />
                        <span className="small">Private</span>
                      </label>
                      <label className="zone-flag-toggle">
                        <input
                          type="checkbox"
                          checked={editor.isAccessible}
                          onChange={e => {
                            setSaveState(prev => ({ loading: false, error: undefined }));
                            setEditor(prev => prev ? ({ ...prev, isAccessible: e.target.checked }) : prev);
                          }}
                        />
                        <span className="small">Accessible</span>
                      </label>
                    </div>
                  </Field>
                </div>
              )}

              {saveState.error && <div className="notice error">{saveState.error}</div>}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={onSaveZone} disabled={saveState.loading || !editor || !hasEditorChanges}>
                  {saveState.loading ? 'Сохранение...' : 'Сохранить зону'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditor(zoneToEditor(selectedZone));
                    setSaveState({ loading: false });
                  }}
                  disabled={saveState.loading || !editor || !hasEditorChanges}
                >
                  Сбросить
                </Button>
                <Button onClick={() => openZoneImageGeometry(selectedZone)}>Открыть в разметке</Button>
                <Button variant="danger" onClick={onDeleteZone} disabled={deleteLoading}>
                  {deleteLoading ? 'Удаление...' : 'Удалить зону'}
                </Button>
                <Button variant="ghost" onClick={load} disabled={loading}>
                  {loading ? 'Обновление...' : 'Обновить список'}
                </Button>
              </div>
            </>
          ) : (
            <div className="empty-state">Выберите зону из списка, чтобы увидеть детали.</div>
          )}
        </div>
      </div>
    </section>
  );
}
