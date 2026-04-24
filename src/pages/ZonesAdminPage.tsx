import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { useStore } from '@/store/useStore';
import { navigate } from '@/router/routes';
import type { ParkingZone } from '@/types';

type ZoneFilters = {
  cameraId: string;
  partnerId: string;
  status: 'all' | 'active' | 'inactive';
  maxPay: string;
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

export default function ZonesAdminPage() {
  const store = useStore();
  const [zones, setZones] = useState<ParkingZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedZoneId, setSelectedZoneId] = useState<string | undefined>();
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

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const nextZones = await api.listZones({
        camera_id: filters.cameraId ? Number(filters.cameraId) : undefined,
        partner_id: filters.partnerId ? Number(filters.partnerId) : undefined,
        is_active: filters.status === 'all' ? undefined : filters.status === 'active',
        max_pay: filters.maxPay ? Number(filters.maxPay) : undefined
      });
      setZones(nextZones);
      setSelectedZoneId(current =>
        current && nextZones.some(zone => String(zone.id) === current)
          ? current
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
  }, []);

  function openZoneInLabeler(zone: ParkingZone) {
    store.setCamera(String(zone.camera_id));
    store.selectZone(zone.id);
    store.loadCameraMeta(zone.camera_id);
    store.loadZones();
    store.setViewMode('labeler');
    navigate('labeler');
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Зоны</h1>
          <p>Парковочные зоны, фильтры мониторинга и геометрия разметки</p>
        </div>
        <Button onClick={load} disabled={loading}>{loading ? 'Загрузка...' : 'Обновить'}</Button>
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
            value={filters.partnerId}
            onChange={e => setFilters(prev => ({ ...prev, partnerId: e.target.value }))}
            placeholder="Все партнёры"
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
                  onClick={() => setSelectedZoneId(String(zone.id))}
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

              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => openZoneInLabeler(selectedZone)}>Открыть в разметке</Button>
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
