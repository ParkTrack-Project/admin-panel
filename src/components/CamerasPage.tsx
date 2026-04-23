import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { api, Camera, CreateCameraRequest } from '@/api/client';
import { Button, Field, Input } from './UiKit';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { navigate } from '@/router/routes';

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowAnchor: [12, 41]
});
L.Marker.prototype.options.icon = defaultIcon;

function MapAutoCenter({ cameras, selectedId }: { cameras: Camera[]; selectedId?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!cameras.length) return;
    const selected = cameras.find(c => c.camera_id === selectedId && c.latitude && c.longitude);
    if (selected) {
      map.setView([selected.latitude, selected.longitude], 17);
      return;
    }
    const pts = cameras.filter(c => c.latitude && c.longitude).map(c => [c.latitude, c.longitude] as [number, number]);
    if (!pts.length) return;
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds.pad(0.2));
  }, [cameras, selectedId, map]);

  return null;
}

export default function CamerasPage() {
  const store = useStore();
  const { setViewMode, setCamera, loadCameraMeta } = store;
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [hoverId, setHoverId] = useState<number | undefined>();
  const [zoneCounts, setZoneCounts] = useState<Record<number, number>>({});
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const list = await api.listCameras();
        if (!cancelled) {
          setCameras(list);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cameras.length) return;
    let cancelled = false;
    async function loadCounts() {
      try {
        const entries = await Promise.all(
          cameras.map(async (cam) => {
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

  const center: LatLngExpression = useMemo(() => {
    const first = cameras.find(c => c.latitude && c.longitude);
    if (first) return [first.latitude, first.longitude];
    return [59.9386, 30.3141];
  }, [cameras]);

  function onEditCamera(cam: Camera) {
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
      const list = await api.listCameras();
      setCameras(list);
      if (selectedId === cameraId) {
        setSelectedId(undefined);
      }
    } catch (e: any) {
      setError(`Ошибка удаления камеры: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function onAddCamera(data: {
    title: string;
    source: string;
    image_width: number;
    image_height: number;
    latitude: number;
    longitude: number;
    calib?: any;
  }) {
    try {
      setLoading(true);
      setError(undefined);
      const newCamera = await api.createCamera(data);
      const updatedList = await api.listCameras();
      setCameras(updatedList);
      setShowAddCamera(false);
    } catch (e: any) {
      setError(`Ошибка создания камеры: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="sidebar">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h4>Камеры</h4>
          <Button className="ghost" onClick={() => navigate('labeler')}>К разметке</Button>
        </div>

        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <Button onClick={() => setShowAddCamera(true)}>+ Добавить камеру</Button>
        </div>

        {loading && <div className="small">Загрузка камер…</div>}
        {error && <div className="small" style={{ color: '#ff6b6b' }}>{error}</div>}

        <div className="list">
          {cameras.map(cam => {
            const isActive = cam.camera_id === selectedId;
            const isHover = cam.camera_id === hoverId;
            const zonesCount = zoneCounts[cam.camera_id];
            return (
              <div
                key={cam.camera_id}
                className={`item ${isActive ? 'active' : ''} ${isHover ? 'hover' : ''} ${cam.is_active === false ? 'inactive' : ''}`}
                onMouseEnter={() => setHoverId(cam.camera_id)}
                onMouseLeave={() => setHoverId(id => (id === cam.camera_id ? undefined : id))}
                onClick={() => setSelectedId(cam.camera_id)}
                style={cam.is_active === false ? { borderLeft: '3px solid #ff4d4f' } : undefined}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>{cam.title}</div>
                  {cam.is_active === false && <span className="badge" style={{ background: '#ff4d4f', color: 'white' }}>Неактивна</span>}
                </div>
                <div className="small">ID: {cam.camera_id}</div>
                <div className="small">Зон: {typeof zonesCount === 'number' ? zonesCount : '—'}</div>
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <Button onClick={() => onEditCamera(cam)}>Редактировать</Button>
                  <Button 
                    className="danger" 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Удалить камеру "${cam.title}"? Это действие нельзя отменить.`)) {
                        await onDeleteCamera(cam.camera_id);
                      }
                    }}
                    disabled={deletingId === cam.camera_id}
                  >
                    {deletingId === cam.camera_id ? 'Удаление...' : 'Удалить'}
                  </Button>
                </div>
                {isHover && <div className="small">Наведи на метку на карте, чтобы увидеть камеру</div>}
              </div>
            );
          })}
          {!loading && !cameras.length && !error && (
            <div className="small">Камеры не найдены</div>
          )}
        </div>

        {showAddCamera && (
          <AddCameraForm 
            onSave={onAddCamera} 
            onCancel={() => setShowAddCamera(false)} 
            loading={loading}
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
          {cameras.filter(c => c.latitude && c.longitude).map(cam => {
            const isActive = cam.camera_id === selectedId;
            const isHover = cam.camera_id === hoverId;
            const isCameraActive = cam.is_active !== false;
            let color: string;
            if (!isCameraActive) {
              color = '#ff4d4f';
            } else if (isActive) {
              color = '#ff7a45';
            } else if (isHover) {
              color = '#ffd666';
            } else {
              color = '#2f54eb';
            }
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
                    <div style={{ marginTop: 6 }}>
                      <Button onClick={() => onEditCamera(cam)}>Редактировать</Button>
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
  loading 
}: { 
  onSave: (data: CreateCameraRequest) => void; 
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [imageWidth, setImageWidth] = useState('1920');
  const [imageHeight, setImageHeight] = useState('1080');
  const [latitude, setLatitude] = useState('59.9386');
  const [longitude, setLongitude] = useState('30.3141');
  const [calib, setCalib] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let calibParsed: any = null;
    if (calib.trim()) {
      try {
        calibParsed = JSON.parse(calib);
      } catch {
        alert('Ошибка парсинга JSON в calib');
        return;
      }
    }
    onSave({
      title: title.trim(),
      source: source.trim(),
      image_width: parseInt(imageWidth, 10),
      image_height: parseInt(imageHeight, 10),
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      calib: calibParsed
    });
  }

  return (
    <div style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4 }}>
      <h4 style={{ marginTop: 0 }}>Добавить камеру</h4>
      <form onSubmit={handleSubmit}>
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
            onChange={e => setSource(e.target.value)}
            placeholder="https://... или rtsp://..."
            required
          />
        </Field>
        <Field label="Image Width *">
          <Input 
            type="number"
            min={1}
            value={imageWidth}
            onChange={e => setImageWidth(e.target.value)}
            required
          />
        </Field>
        <Field label="Image Height *">
          <Input 
            type="number"
            min={1}
            value={imageHeight}
            onChange={e => setImageHeight(e.target.value)}
            required
          />
        </Field>
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
          <Button type="button" className="ghost" onClick={onCancel}>Отмена</Button>
        </div>
      </form>
    </div>
  );
}
