import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/UiKit';
import { navigate } from '@/router/routes';
import { useSessionStore } from '@/auth/sessionStore';
import type { Camera, HealthResponse, VersionResponse } from '@/api/client';
import type { ParkingZone } from '@/types';

type DashboardState = {
  loading: boolean;
  health?: HealthResponse;
  version?: VersionResponse;
  cameras: Camera[];
  zones: ParkingZone[];
  error?: string;
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('ru-RU');
  } catch {
    return dateStr;
  }
}

function formatConfidence(value?: number) {
  if (typeof value !== 'number') return '—';
  return `${(value * 100).toFixed(0)}%`;
}

export default function DashboardPage() {
  const session = useSessionStore();
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const [state, setState] = useState<DashboardState>({
    loading: false,
    cameras: [],
    zones: []
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState(prev => ({ ...prev, loading: true, error: undefined }));
      try {
        const [health, version, cameras, zones] = await Promise.allSettled([
          api.health(),
          api.version(),
          api.listCameras({ partner_id: currentPartnerId }),
          api.listZones({ partner_id: currentPartnerId })
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          health: health.status === 'fulfilled' ? health.value : undefined,
          version: version.status === 'fulfilled' ? version.value : undefined,
          cameras: cameras.status === 'fulfilled' ? cameras.value : [],
          zones: zones.status === 'fulfilled' ? zones.value : [],
          error: [health, version, cameras, zones].some(result => result.status === 'rejected')
            ? 'Часть данных временно недоступна'
            : undefined
        });
      } catch (error: any) {
        if (!cancelled) {
          setState({
            loading: false,
            cameras: [],
            zones: [],
            error: String(error?.message || error)
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [currentPartnerId]);

  const metrics = useMemo(() => {
    const activeCameras = state.cameras.filter(camera => camera.is_active !== false);
    const inactiveCameras = state.cameras.length - activeCameras.length;
    const paidZones = state.zones.filter(zone => zone.pay > 0);
    const activeZones = state.zones.filter(zone => zone.is_active !== false);
    const freePlaces = state.zones.reduce((sum, zone) => {
      if (typeof zone.free_count === 'number') return sum + zone.free_count;
      if (typeof zone.occupied === 'number') return sum + Math.max(0, zone.capacity - zone.occupied);
      return sum;
    }, 0);
    const avgConfidenceZones = state.zones.filter(zone => typeof zone.confidence === 'number');
    const avgConfidence = avgConfidenceZones.length
      ? avgConfidenceZones.reduce((sum, zone) => sum + (zone.confidence ?? 0), 0) / avgConfidenceZones.length
      : undefined;

    return {
      activeCameras: activeCameras.length,
      inactiveCameras,
      paidZones: paidZones.length,
      activeZones: activeZones.length,
      freePlaces,
      avgConfidence
    };
  }, [state.cameras, state.zones]);

  const staleCameras = useMemo(
    () =>
      [...state.cameras]
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
        .slice(0, 5),
    [state.cameras]
  );

  const zoneWatchlist = useMemo(
    () =>
      [...state.zones]
        .sort((a, b) => {
          const aFree = typeof a.free_count === 'number' ? a.free_count : (typeof a.occupied === 'number' ? Math.max(0, a.capacity - a.occupied) : Number.MAX_SAFE_INTEGER);
          const bFree = typeof b.free_count === 'number' ? b.free_count : (typeof b.occupied === 'number' ? Math.max(0, b.capacity - b.occupied) : Number.MAX_SAFE_INTEGER);
          return aFree - bFree;
        })
        .slice(0, 5),
    [state.zones]
  );

  const camerasWithoutMap = useMemo(
    () => state.cameras.filter(camera => camera.latitude === null || camera.latitude === undefined || camera.longitude === null || camera.longitude === undefined).slice(0, 4),
    [state.cameras]
  );

  const zonesWithoutGeometry = useMemo(
    () =>
      state.zones
        .filter(zone => {
          const hasImageGeometry = (zone.image_polygon ?? zone.image_quad)?.length === 4;
          const hasMapGeometry = Boolean(zone.geometry?.coordinates?.[0]?.length) || zone.points.some(point => point.latitude !== null && point.longitude !== null);
          return !hasImageGeometry || !hasMapGeometry;
        })
        .slice(0, 4),
    [state.zones]
  );

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>Обзор</h1>
          <p>Операционный контур ParkTrack и быстрый срез по камерам и зонам</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => navigate('zones')}>К зонам</Button>
          <Button onClick={() => navigate('cameras')}>К камерам</Button>
        </div>
      </div>

      {state.error && <div className="notice warning">{state.error}</div>}

      <div className="metric-grid dashboard-metric-grid">
        <MetricCard label="API" value={state.loading ? '...' : state.health?.status ?? 'unknown'} />
        <MetricCard label="Версия" value={state.version?.api_version ?? state.version?.version ?? 'unknown'} />
        <MetricCard label="Камеры" value={state.cameras.length} hint={`${metrics.activeCameras} active / ${metrics.inactiveCameras} inactive`} />
        <MetricCard label="Зоны" value={state.zones.length} hint={`${metrics.activeZones} active / ${metrics.paidZones} paid`} />
        <MetricCard label="Свободные места" value={metrics.freePlaces} />
        <MetricCard label="Средняя confidence" value={formatConfidence(metrics.avgConfidence)} />
      </div>

      <div className="details-grid dashboard-summary-grid">
        <div className="section-panel">
          <h2>Сессия</h2>
          <div className="dashboard-summary-list">
            <div className="dashboard-summary-row">
              <span className="metric-label">Пользователь</span>
              <strong>{session.user?.full_name || session.user?.email || '—'}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">Глобальная роль</span>
              <strong>{session.user?.global_role || '—'}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">Партнёры</span>
              <strong>{session.user?.partner_memberships.filter(m => m.is_active !== false).length ?? 0}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">Permissions</span>
              <strong>{session.user?.permissions.length ?? 0}</strong>
            </div>
          </div>
        </div>

        <div className="section-panel">
          <h2>Система</h2>
          <div className="dashboard-summary-list">
            <div className="dashboard-summary-row">
              <span className="metric-label">API status</span>
              <strong>{state.health?.status ?? 'unknown'}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">Database</span>
              <strong>{state.health?.database ?? 'unknown'}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">API version</span>
              <strong>{state.version?.api_version ?? state.version?.version ?? 'unknown'}</strong>
            </div>
            <div className="dashboard-summary-row">
              <span className="metric-label">Текущий partner</span>
              <strong>{currentPartnerId ?? (session.isAdmin() ? 'Все партнёры' : '—')}</strong>
            </div>
          </div>
        </div>

        <div className="section-panel">
          <h2>Быстрые действия</h2>
          <div className="dashboard-action-grid">
            <button type="button" className="dashboard-action-card" onClick={() => navigate('cameras')}>
              <strong>Проверить камеры</strong>
              <span className="small">Редактирование настроек, snapshot и позиции на карте.</span>
            </button>
            <button type="button" className="dashboard-action-card" onClick={() => navigate('zones')}>
              <strong>Проверить зоны</strong>
              <span className="small">Список зон, geometry entrypoint’ы и правка свойств.</span>
            </button>
            <button type="button" className="dashboard-action-card" onClick={() => navigate('profile')}>
              <strong>Открыть профиль</strong>
              <span className="small">Посмотреть текущую сессию и роль администратора.</span>
            </button>
            <button type="button" className="dashboard-action-card" onClick={() => navigate('users')}>
              <strong>Подготовить пользователей</strong>
              <span className="small">Контрактный раздел для следующего этапа admin-панели.</span>
            </button>
          </div>
        </div>
      </div>

      <div className="details-grid dashboard-summary-grid">
        <div className="section-panel">
          <h2>Камеры без координат</h2>
          <div className="dashboard-list">
            {camerasWithoutMap.map(camera => (
              <button
                type="button"
                key={camera.camera_id}
                className="dashboard-list-item"
                onClick={() => navigate('cameras')}
              >
                <div>
                  <strong>{camera.title}</strong>
                  <div className="small">#{camera.camera_id}</div>
                </div>
                <div className="dashboard-item-meta">
                  <span className="small">lat: {camera.latitude ?? '—'}</span>
                  <span className="small">lng: {camera.longitude ?? '—'}</span>
                </div>
              </button>
            ))}
            {!camerasWithoutMap.length && <div className="empty-state">Все камеры уже привязаны к карте.</div>}
          </div>
        </div>

        <div className="section-panel">
          <h2>Зоны с неполной геометрией</h2>
          <div className="dashboard-list">
            {zonesWithoutGeometry.map(zone => (
              <button
                type="button"
                key={String(zone.id)}
                className="dashboard-list-item"
                onClick={() => navigate('zones')}
              >
                <div>
                  <strong>Зона #{String(zone.id)}</strong>
                  <div className="small">Camera #{zone.camera_id}</div>
                </div>
                <div className="dashboard-item-meta">
                  <span className="small">image: {(zone.image_polygon ?? zone.image_quad)?.length ?? 0}/4</span>
                  <span className="small">map: {zone.points.filter(point => point.latitude !== null && point.longitude !== null).length}/4</span>
                </div>
              </button>
            ))}
            {!zonesWithoutGeometry.length && <div className="empty-state">У зон есть базовая геометрия на изображении и на карте.</div>}
          </div>
        </div>

        <div className="section-panel">
          <h2>Камеры под рукой</h2>
          <div className="dashboard-list">
            {staleCameras.map(camera => (
              <button
                type="button"
                key={camera.camera_id}
                className="dashboard-list-item"
                onClick={() => navigate('cameras')}
              >
                <div>
                  <strong>{camera.title}</strong>
                  <div className="small">#{camera.camera_id} • {camera.source}</div>
                </div>
                <div className="dashboard-item-meta">
                  <span className={`status-pill ${camera.is_active === false ? 'paused' : 'active'}`}>
                    {camera.is_active === false ? 'paused' : 'active'}
                  </span>
                  <span className="small">{formatDate(camera.updated_at)}</span>
                </div>
              </button>
            ))}
            {!staleCameras.length && <div className="empty-state">Камеры пока не загружены.</div>}
          </div>
        </div>

        <div className="section-panel">
          <h2>Зоны внимания</h2>
          <div className="dashboard-list">
            {zoneWatchlist.map(zone => {
              const freeCount = typeof zone.free_count === 'number'
                ? zone.free_count
                : typeof zone.occupied === 'number'
                  ? Math.max(0, zone.capacity - zone.occupied)
                  : '—';

              return (
                <button
                  type="button"
                  key={String(zone.id)}
                  className="dashboard-list-item"
                  onClick={() => navigate('zones')}
                >
                  <div>
                    <strong>Зона #{String(zone.id)}</strong>
                    <div className="small">Camera #{zone.camera_id} • {zone.zone_type}</div>
                  </div>
                  <div className="dashboard-item-meta">
                    <span className="small">free: {freeCount}</span>
                    <span className="small">confidence: {formatConfidence(zone.confidence)}</span>
                  </div>
                </button>
              );
            })}
            {!zoneWatchlist.length && <div className="empty-state">Зоны пока не загружены.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="small" style={{ marginTop: 8 }}>{hint}</div>}
    </div>
  );
}
