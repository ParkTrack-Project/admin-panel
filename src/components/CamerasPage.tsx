import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { api, Camera, CameraSnapshot, CreateCameraRequest } from '@/api/client';
import { Button, Field, Input, Select, Textarea } from './UiKit';
import { BulkActionBar, BulkSelectionCheckbox } from './BulkActionBar';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { navigate } from '@/router/routes';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { useSessionStore } from '@/auth/sessionStore';

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowAnchor: [12, 41]
});
L.Marker.prototype.options.icon = defaultIcon;

function hasCoordinates(latitude?: number | null, longitude?: number | null): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && typeof longitude === 'number'
    && Number.isFinite(longitude);
}

function MapAutoCenter({ cameras, selectedId }: { cameras: Camera[]; selectedId?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!cameras.length) return;
    const selected = cameras.find(c => c.camera_id === selectedId && hasCoordinates(c.latitude, c.longitude));
    if (selected) {
      map.setView([selected.latitude, selected.longitude], 17);
      return;
    }
    const pts = cameras
      .filter(c => hasCoordinates(c.latitude, c.longitude))
      .map(c => [c.latitude, c.longitude] as [number, number]);
    if (!pts.length) return;
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds.pad(0.2));
  }, [cameras, selectedId, map]);

  return null;
}

type SnapshotState = {
  loading: boolean;
  error?: string;
  data?: CameraSnapshot;
};

type CameraEditorState = {
  title: string;
  source: string;
  imageWidth: string;
  imageHeight: string;
  latitude: string;
  longitude: string;
  calib: string;
  isActive: boolean;
};

type CameraSaveState = {
  loading: boolean;
  error?: string;
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

function cameraToEditor(camera: Camera): CameraEditorState {
  return {
    title: camera.title || '',
    source: camera.source || '',
    imageWidth: String(camera.image_width ?? ''),
    imageHeight: String(camera.image_height ?? ''),
    latitude: String(camera.latitude ?? ''),
    longitude: String(camera.longitude ?? ''),
    calib: camera.calib ? JSON.stringify(camera.calib, null, 2) : '',
    isActive: camera.is_active !== false
  };
}

function normalizeEditor(editor: CameraEditorState) {
  return {
    title: editor.title.trim(),
    source: editor.source.trim(),
    imageWidth: editor.imageWidth.trim(),
    imageHeight: editor.imageHeight.trim(),
    latitude: editor.latitude.trim(),
    longitude: editor.longitude.trim(),
    calib: editor.calib.trim(),
    isActive: editor.isActive
  };
}

type MediaSize = {
  width: number;
  height: number;
};

function probeImageSize(source: string): Promise<MediaSize> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        return;
      }
      reject(new Error('Image dimensions are empty.'));
    };
    img.onerror = () => reject(new Error('Image source is not readable as an image.'));
    img.src = source;
  });
}

function probeVideoSize(source: string): Promise<MediaSize> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const size = { width: video.videoWidth, height: video.videoHeight };
        cleanup();
        resolve(size);
        return;
      }
      cleanup();
      reject(new Error('Video dimensions are empty.'));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Video source is not readable in browser.'));
    };
    video.src = source;
  });
}

async function detectMediaSize(source: string): Promise<MediaSize> {
  try {
    return await probeImageSize(source);
  } catch {
    return probeVideoSize(source);
  }
}

export default function CamerasPage() {
  const store = useStore();
  const { setViewMode, setCamera, loadCameraMeta, cameraId, setLabelerReturnRoute } = store;
  const notifySuccess = useFeedbackStore(state => state.success);
  const confirmAction = useFeedbackStore(state => state.confirm);
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [hoverId, setHoverId] = useState<number | undefined>();
  const [zoneCounts, setZoneCounts] = useState<Record<number, number>>({});
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<number>>(() => new Set());
  const [filters, setFilters] = useState({
    q: '',
    isActive: 'all'
  });
  const snapshotPreviewRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotState>({ loading: false });
  const [snapshotReloadKey, setSnapshotReloadKey] = useState(0);
  const [isSnapshotFullscreen, setIsSnapshotFullscreen] = useState(false);
  const [editor, setEditor] = useState<CameraEditorState | null>(null);
  const [saveState, setSaveState] = useState<CameraSaveState>({ loading: false });

  const selectedCamera = useMemo(
    () => cameras.find(cam => cam.camera_id === selectedId),
    [cameras, selectedId]
  );
  const visibleCameraIds = useMemo(
    () => cameras.map(cam => cam.camera_id),
    [cameras]
  );
  const hasEditorChanges = useMemo(() => {
    if (!selectedCamera || !editor) return false;
    return JSON.stringify(normalizeEditor(editor)) !== JSON.stringify(normalizeEditor(cameraToEditor(selectedCamera)));
  }, [selectedCamera, editor]);

  async function loadCameras() {
    setLoading(true);
    setError(undefined);
    try {
      const list = await api.listCameras({
        q: filters.q || undefined,
        is_active: filters.isActive === 'all' ? undefined : filters.isActive === 'active',
        partner_id: currentPartnerId
      });
      setCameras(list);
      setSelectedId(current => {
        if (current && list.some(cam => cam.camera_id === current)) return current;
        const storedCameraId = cameraId ? parseInt(cameraId, 10) : undefined;
        if (storedCameraId && list.some(cam => cam.camera_id === storedCameraId)) return storedCameraId;
        return list[0]?.camera_id;
      });
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCameras();
  }, [currentPartnerId]);

  useEffect(() => {
    setSelectedCameraIds(prev => {
      const visible = new Set(visibleCameraIds);
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleCameraIds]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsSnapshotFullscreen(document.fullscreenElement === snapshotPreviewRef.current);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!cameras.length) return;
    let cancelled = false;

    async function loadCounts() {
      try {
        const entries = await Promise.all(
          cameras.map(async cam => {
            try {
              const zones = await api.listZones(cam.camera_id);
              return [cam.camera_id, zones.length] as const;
            } catch {
              return [cam.camera_id, 0] as const;
            }
          })
        );

        if (cancelled) return;
        const map: Record<number, number> = {};
        for (const [id, count] of entries) map[id] = count;
        setZoneCounts(map);
      } catch {
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [cameras]);

  useEffect(() => {
    let cancelled = false;
    let lastImageUrl: string | undefined;

    async function loadSnapshot() {
      if (!selectedCamera) {
        setSnapshot({ loading: false });
        return;
      }

      setSnapshot({ loading: true });
      try {
        const data = await api.getSnapshot(selectedCamera.camera_id, {
          annotated: true,
          fallback_to_raw: true
        });
        if (!cancelled) {
          lastImageUrl = data.image_url;
          setSnapshot({ loading: false, data });
        }
      } catch (e: any) {
        if (!cancelled) {
          setSnapshot({ loading: false, error: String(e?.message || e) });
        }
      }
    }

    loadSnapshot();
    return () => {
      cancelled = true;
      if (lastImageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(lastImageUrl);
      }
    };
  }, [selectedCamera?.camera_id, snapshotReloadKey]);

  useEffect(() => {
    if (!selectedCamera) {
      setEditor(null);
      setSaveState({ loading: false });
      return;
    }
    setEditor(cameraToEditor(selectedCamera));
    setSaveState({ loading: false });
  }, [selectedCamera?.camera_id]);

  const center: LatLngExpression = useMemo(() => {
    const first = cameras.find(c => hasCoordinates(c.latitude, c.longitude));
    if (first) return [first.latitude, first.longitude];
    return [59.9386, 30.3141];
  }, [cameras]);

  function openLabeler(cam: Camera) {
    setLabelerReturnRoute('cameras');
    setCamera(String(cam.camera_id));
    loadCameraMeta(cam.camera_id);
    store.loadZones();
    setViewMode('labeler');
    navigate('labeler');
  }

  async function onDeleteCamera(cameraId: number) {
    setDeletingId(cameraId);
    try {
      await api.deleteCamera(cameraId);
      notifySuccess('Камера удалена.');
      await loadCameras();
    } catch (e: any) {
      setError(`Ошибка удаления камеры: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function onAddCamera(data: CreateCameraRequest) {
    try {
      setLoading(true);
      setError(undefined);
      const created = await api.createCamera(data);
      await loadCameras();
      setSelectedId(created.camera_id);
      notifySuccess('Камера создана.');
      setShowAddCamera(false);
    } catch (e: any) {
      setError(`Ошибка создания камеры: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function onSaveCamera() {
    if (!selectedCamera || !editor) return;

    const title = editor.title.trim();
    const source = editor.source.trim();
    const imageWidth = parseInt(editor.imageWidth, 10);
    const imageHeight = parseInt(editor.imageHeight, 10);
    const latitude = parseFloat(editor.latitude);
    const longitude = parseFloat(editor.longitude);

    if (!title || !source) {
      setSaveState({ loading: false, error: 'Название и источник камеры обязательны.' });
      return;
    }

    if (!Number.isFinite(imageWidth) || imageWidth < 1 || !Number.isFinite(imageHeight) || imageHeight < 1) {
      setSaveState({ loading: false, error: 'Размер изображения должен быть больше 0.' });
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setSaveState({ loading: false, error: 'Координаты камеры должны быть корректными числами.' });
      return;
    }

    let calibParsed: any = null;
    if (editor.calib.trim()) {
      try {
        calibParsed = JSON.parse(editor.calib);
      } catch {
        setSaveState({ loading: false, error: 'Ошибка парсинга JSON в calib.' });
        return;
      }
    }

    setSaveState({ loading: true });
    try {
      const updated = await api.updateCamera(selectedCamera.camera_id, {
        title,
        source,
        image_width: imageWidth,
        image_height: imageHeight,
        latitude,
        longitude,
        calib: calibParsed,
        is_active: editor.isActive
      });

      setCameras(prev =>
        prev.map(cam => cam.camera_id === updated.camera_id ? updated : cam)
      );
      setEditor(cameraToEditor(updated));
      setSaveState({ loading: false });
      notifySuccess('Настройки камеры сохранены.');
    } catch (e: any) {
      setSaveState({ loading: false, error: `Ошибка сохранения камеры: ${String(e)}` });
    }
  }

  function toggleSelectedCamera(cameraId: number, checked: boolean) {
    setSelectedCameraIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(cameraId);
      } else {
        next.delete(cameraId);
      }
      return next;
    });
  }

  async function onBulkSetCamerasActive(isActive: boolean) {
    if (!selectedCameraIds.size) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = [...selectedCameraIds];
      const updated = await Promise.all(ids.map(cameraId => api.updateCamera(cameraId, { is_active: isActive })));
      setCameras(prev =>
        prev.map(camera => updated.find(item => item.camera_id === camera.camera_id) ?? camera)
      );
      setSelectedCameraIds(new Set());
      notifySuccess(`Камеры ${isActive ? 'активированы' : 'деактивированы'}.`);
    } catch (e: any) {
      setError(`Ошибка массового обновления камер: ${String(e?.message || e)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function onBulkDeleteCameras() {
    if (!selectedCameraIds.size) return;

    const shouldDelete = await confirmAction({
      title: 'Удалить выбранные камеры?',
      message: `Будет удалено камер: ${selectedCameraIds.size}. Это действие нельзя отменить.`,
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
      tone: 'danger'
    });
    if (!shouldDelete) return;

    setBulkLoading(true);
    setError(undefined);
    try {
      const ids = new Set(selectedCameraIds);
      await Promise.all([...ids].map(cameraId => api.deleteCamera(cameraId)));
      setCameras(prev => prev.filter(camera => !ids.has(camera.camera_id)));
      setSelectedCameraIds(new Set());
      notifySuccess('Выбранные камеры удалены.');
    } catch (e: any) {
      setError(`Ошибка массового удаления камер: ${String(e?.message || e)}`);
    } finally {
      setBulkLoading(false);
    }
  }

  async function toggleSnapshotFullscreen() {
    const container = snapshotPreviewRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
        return;
      }
      await container.requestFullscreen();
    } catch (e: any) {
      setError(`Не удалось открыть snapshot на весь экран: ${String(e?.message || e)}`);
    }
  }

  return (
    <>
      <div className="sidebar camera-admin-sidebar">
        <div className="page-heading" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>Камеры</h1>
            <p style={{ marginTop: 4 }}>
              Рабочие камеры, привязка и поток распознавания
              {currentPartnerId !== undefined ? ` · партнёр #${currentPartnerId}` : ''}
            </p>
          </div>
          <Button onClick={() => setShowAddCamera(true)}>+ Добавить</Button>
        </div>

        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <Field label="Поиск">
            <Input
              value={filters.q}
              onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
              placeholder="Название камеры"
            />
          </Field>
          <Field label="Статус">
            <Select
              value={filters.isActive}
              onChange={e => setFilters(prev => ({ ...prev, isActive: e.target.value }))}
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
            </Select>
          </Field>
          <Button variant="ghost" onClick={loadCameras} disabled={loading}>
            {loading ? 'Загрузка...' : 'Применить'}
          </Button>
        </div>

        <BulkActionBar
          selectedCount={selectedCameraIds.size}
          totalCount={cameras.length}
          busy={bulkLoading}
          onActivate={() => onBulkSetCamerasActive(true)}
          onDeactivate={() => onBulkSetCamerasActive(false)}
          onDelete={onBulkDeleteCameras}
        />

        {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="section-panel" style={{ marginBottom: 12 }}>
          <div className="table-header camera-list-header">
            <span className="bulk-check-cell">
              <BulkSelectionCheckbox
                selectedCount={selectedCameraIds.size}
                totalCount={visibleCameraIds.length}
                busy={bulkLoading}
                label="Выбрать все отфильтрованные камеры"
                onToggleAll={checked => setSelectedCameraIds(checked ? new Set(visibleCameraIds) : new Set())}
              />
            </span>
            <span>Камера</span>
            <span>Зоны</span>
            <span>Статус</span>
          </div>
          <div className="table-list">
            {cameras.map(cam => {
              const isActive = cam.camera_id === selectedId;
              const zonesCount = zoneCounts[cam.camera_id];
              const isBulkSelected = selectedCameraIds.has(cam.camera_id);
              return (
                <div
                  key={cam.camera_id}
                  role="button"
                  tabIndex={0}
                  className={`camera-list-item ${isActive ? 'active' : ''} ${isBulkSelected ? 'bulk-row-selected' : ''}`}
                  onMouseEnter={() => setHoverId(cam.camera_id)}
                  onMouseLeave={() => setHoverId(id => (id === cam.camera_id ? undefined : id))}
                  onClick={() => setSelectedId(cam.camera_id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(cam.camera_id);
                    }
                  }}
                >
                  <span className="bulk-check-cell">
                    <input
                      type="checkbox"
                      checked={isBulkSelected}
                      onClick={e => e.stopPropagation()}
                      onChange={e => toggleSelectedCamera(cam.camera_id, e.target.checked)}
                      aria-label={`Выбрать камеру ${cam.camera_id}`}
                    />
                  </span>
                  <span>
                    <strong>{cam.title}</strong>
                    <span className="small" style={{ display: 'block' }}>ID: {cam.camera_id}</span>
                  </span>
                  <span>{typeof zonesCount === 'number' ? zonesCount : '—'}</span>
                  <span className={`status-pill ${cam.is_active === false ? 'paused' : 'active'}`}>
                    {cam.is_active === false ? 'paused' : 'active'}
                  </span>
                </div>
              );
            })}
            {!loading && !cameras.length && (
              <div className="empty-state">Камеры не найдены</div>
            )}
          </div>
        </div>

        {selectedCamera && (
          <div className="section-panel camera-detail-panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0 }}>{selectedCamera.title}</h2>
                <div className="small">ID: {selectedCamera.camera_id}</div>
              </div>
              <span className={`status-pill ${selectedCamera.is_active === false ? 'paused' : 'active'}`}>
                {selectedCamera.is_active === false ? 'Неактивна' : 'Активна'}
              </span>
            </div>

            <div className="details-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
              <div className="detail-card">
                <div className="metric-label">Источник</div>
                <div className="detail-value" style={{ fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {selectedCamera.source}
                </div>
              </div>
              <div className="detail-card">
                <div className="metric-label">Изображение</div>
                <div className="detail-value" style={{ fontSize: 14 }}>
                  {selectedCamera.image_width} x {selectedCamera.image_height}
                </div>
              </div>
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Координаты: {selectedCamera.latitude}, {selectedCamera.longitude}
            </div>
            <div className="small">
              Создано: {formatDate(selectedCamera.created_at)}
            </div>
            <div className="small">
              Обновлено: {formatDate(selectedCamera.updated_at)}
            </div>

            {editor && (
              <div className="camera-settings-grid">
                <Field label="Название">
                  <Input
                    value={editor.title}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, title: e.target.value }) : prev);
                    }}
                    placeholder="Название камеры"
                  />
                </Field>
                <Field label="Источник">
                  <Input
                    value={editor.source}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, source: e.target.value }) : prev);
                    }}
                    placeholder="https://... или rtsp://..."
                  />
                </Field>
                <Field label="Ширина">
                  <Input
                    type="number"
                    min={1}
                    value={editor.imageWidth}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, imageWidth: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Высота">
                  <Input
                    type="number"
                    min={1}
                    value={editor.imageHeight}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, imageHeight: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Широта">
                  <Input
                    type="number"
                    step="any"
                    value={editor.latitude}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, latitude: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Долгота">
                  <Input
                    type="number"
                    step="any"
                    value={editor.longitude}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, longitude: e.target.value }) : prev);
                    }}
                  />
                </Field>
                <Field label="Calib (JSON)">
                  <Textarea
                    value={editor.calib}
                    onChange={e => {
                      setSaveState(prev => ({ loading: false, error: undefined }));
                      setEditor(prev => prev ? ({ ...prev, calib: e.target.value }) : prev);
                    }}
                    placeholder='{"image_width": 1920, ...}'
                    rows={7}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                </Field>
                <Field label="Статус">
                  <label className="camera-status-toggle">
                    <input
                      type="checkbox"
                      checked={editor.isActive}
                      onChange={e => {
                        setSaveState(prev => ({ loading: false, error: undefined }));
                        setEditor(prev => prev ? ({ ...prev, isActive: e.target.checked }) : prev);
                      }}
                    />
                    <span className="small">Камера активна</span>
                  </label>
                </Field>
              </div>
            )}

            {saveState.error && <div className="notice error">{saveState.error}</div>}
            <div className="camera-preview" ref={snapshotPreviewRef}>
              <div className="camera-preview-header">
                <h3>Распознанные автомобили</h3>
                <div className="camera-preview-actions">
                  {snapshot.data?.image_url && (
                    <Button
                      variant="ghost"
                      onClick={toggleSnapshotFullscreen}
                      title={isSnapshotFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть snapshot на весь экран'}
                    >
                      {isSnapshotFullscreen ? 'Свернуть' : 'На весь экран'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setSnapshotReloadKey(key => key + 1)}
                  >
                    Обновить кадр
                  </Button>
                </div>
              </div>
              {snapshot.loading && <div className="empty-state">Загрузка snapshot...</div>}
              {!snapshot.loading && snapshot.error && (
                <div className="notice warning">{snapshot.error}</div>
              )}
              {!snapshot.loading && !snapshot.error && snapshot.data?.captured_at && (
                <div className="small" style={{ marginBottom: 8 }}>
                  Захвачено: {formatDate(snapshot.data.captured_at)}
                </div>
              )}
              {!snapshot.loading && snapshot.data?.image_url && (
                <img
                  className="camera-preview-image"
                  src={snapshot.data.image_url}
                  alt={`Snapshot camera ${selectedCamera.camera_id}`}
                />
              )}
              {!snapshot.loading && !snapshot.error && !snapshot.data?.image_url && (
                <div className="empty-state">API не вернул изображение для этой камеры.</div>
              )}
            </div>

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button onClick={onSaveCamera} disabled={saveState.loading || !editor || !hasEditorChanges}>
                {saveState.loading ? 'Сохранение...' : 'Сохранить настройки'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditor(cameraToEditor(selectedCamera));
                  setSaveState({ loading: false });
                }}
                disabled={saveState.loading || !editor || !hasEditorChanges}
              >
                Сбросить
              </Button>
              <Button onClick={() => openLabeler(selectedCamera)}>Настроить и размечать</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLabelerReturnRoute('cameras');
                  setCamera(String(selectedCamera.camera_id));
                  loadCameraMeta(selectedCamera.camera_id);
                  navigate('labeler');
                  window.setTimeout(() => {
                    store.setViewMode('cameraMapSelector');
                  }, 0);
                }}
              >
                Положение на карте
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const shouldDelete = await confirmAction({
                    title: 'Удалить камеру?',
                    message: `Камера "${selectedCamera.title}" будет удалена из системы.`,
                    confirmLabel: 'Удалить',
                    cancelLabel: 'Отмена',
                    tone: 'danger'
                  });
                  if (shouldDelete) {
                    await onDeleteCamera(selectedCamera.camera_id);
                  }
                }}
                disabled={deletingId === selectedCamera.camera_id}
              >
                {deletingId === selectedCamera.camera_id ? 'Удаление...' : 'Удалить'}
              </Button>
            </div>
          </div>
        )}

        {showAddCamera && (
          <AddCameraForm
            onSave={onAddCamera}
            onCancel={() => setShowAddCamera(false)}
            loading={loading}
            defaultPartnerId={currentPartnerId}
          />
        )}
      </div>

      <div className="canvas">
        <MapContainer center={center} zoom={14} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapAutoCenter cameras={cameras} selectedId={selectedId} />
          {cameras.filter(c => hasCoordinates(c.latitude, c.longitude)).map(cam => {
            const isActive = cam.camera_id === selectedId;
            const isHover = cam.camera_id === hoverId;
            const isCameraActive = cam.is_active !== false;
            let color = '#2f54eb';
            if (!isCameraActive) color = '#ff4d4f';
            else if (isActive) color = '#ff7a45';
            else if (isHover) color = '#ffd666';

            const icon = L.divIcon({
              className: 'camera-marker',
              html: `<div style="width:${isActive ? 18 : 12}px;height:${isActive ? 18 : 12}px;border-radius:50%;background:${color};border:2px solid white;"></div>`,
              iconSize: [isActive ? 18 : 12, isActive ? 18 : 12],
              iconAnchor: [9, 9]
            });

            return (
              <Marker
                key={cam.camera_id}
                position={[cam.latitude, cam.longitude]}
                eventHandlers={{
                  click: () => setSelectedId(cam.camera_id),
                  mouseover: () => setHoverId(cam.camera_id),
                  mouseout: () => setHoverId(id => (id === cam.camera_id ? undefined : id))
                }}
                icon={icon}
              >
                <Popup>
                  <div style={{ maxWidth: 220 }}>
                    <div><b>{cam.title}</b></div>
                    <div className="small">ID: {cam.camera_id}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <Button onClick={() => openLabeler(cam)}>Разметка</Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </>
  );
}

function AddCameraForm({
  onSave,
  onCancel,
  loading,
  defaultPartnerId
}: {
  onSave: (data: CreateCameraRequest) => void;
  onCancel: () => void;
  loading: boolean;
  defaultPartnerId?: number;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [imageWidth, setImageWidth] = useState('1920');
  const [imageHeight, setImageHeight] = useState('1080');
  const [sizeLoading, setSizeLoading] = useState(false);
  const [sizeMessage, setSizeMessage] = useState('Размер будет определён автоматически.');
  const [latitude, setLatitude] = useState('59.9386');
  const [longitude, setLongitude] = useState('30.3141');
  const [calib, setCalib] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function detectSourceSize(nextSource = source) {
    const trimmedSource = nextSource.trim();
    if (!trimmedSource) {
      setSizeMessage('Размер будет определён автоматически.');
      return;
    }

    setSizeLoading(true);
    setSizeMessage('Определяем размер источника...');
    try {
      const size = await detectMediaSize(trimmedSource);
      setImageWidth(String(size.width));
      setImageHeight(String(size.height));
      setSizeMessage(`Определено автоматически: ${size.width} x ${size.height}.`);
    } catch {
      setImageWidth('1920');
      setImageHeight('1080');
      setSizeMessage('Не удалось прочитать размер в браузере. Используем 1920 x 1080.');
    } finally {
      setSizeLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      detectSourceSize(source);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [source]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    let calibParsed: any = null;
    if (calib.trim()) {
      try {
        calibParsed = JSON.parse(calib);
      } catch {
        setError('Ошибка парсинга JSON в calib.');
        return;
      }
    }
    if (!Number.isFinite(parseInt(imageWidth, 10)) || !Number.isFinite(parseInt(imageHeight, 10))) {
      await detectSourceSize(source);
    }
    onSave({
      title: title.trim(),
      source: source.trim(),
      image_width: parseInt(imageWidth, 10),
      image_height: parseInt(imageHeight, 10),
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      calib: calibParsed,
      partner_id: defaultPartnerId
    });
  }

  return (
    <div className="section-panel" style={{ marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Добавить камеру</h4>
      <form onSubmit={handleSubmit}>
        {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}
        <Field label="Title *">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Название камеры"
            required
          />
        </Field>
        <Field label="Source (видеопоток) *">
          <Input
            value={source}
            onChange={e => {
              setSource(e.target.value);
              setError(undefined);
            }}
            onBlur={() => detectSourceSize(source)}
            placeholder="https://... или rtsp://..."
            required
          />
        </Field>
        <div className="auto-size-panel">
          <div>
            <div className="metric-label">Размер изображения</div>
            <div className="detail-value">{imageWidth} x {imageHeight}</div>
            <div className="small">{sizeMessage}</div>
          </div>
          <Button type="button" variant="ghost" onClick={() => detectSourceSize()} disabled={!source.trim() || sizeLoading}>
            {sizeLoading ? 'Определяем...' : 'Определить заново'}
          </Button>
        </div>
        <Field label="Latitude *">
          <Input
            type="number"
            step="any"
            value={latitude}
            onChange={e => setLatitude(e.target.value)}
            required
          />
        </Field>
        <Field label="Longitude *">
          <Input
            type="number"
            step="any"
            value={longitude}
            onChange={e => setLongitude(e.target.value)}
            required
          />
        </Field>
        <Field label="Calib (JSON, опционально)">
          <textarea
            className="input"
            value={calib}
            onChange={e => setCalib(e.target.value)}
            placeholder='{"image_width": 1920, ...}'
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          />
        </Field>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <Button type="submit" disabled={loading || !title.trim() || !source.trim()}>
            {loading ? 'Создание...' : 'Создать'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Отмена</Button>
        </div>
      </form>
    </div>
  );
}
