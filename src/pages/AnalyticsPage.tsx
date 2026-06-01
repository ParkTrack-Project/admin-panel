import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api/client';
import type {
  AnalyticsConfidence,
  AnalyticsDetectorHealth,
  AnalyticsDetectorHealthItem,
  AnalyticsForecast,
  AnalyticsGranularity,
  AnalyticsHistory,
  AnalyticsObservationPoint,
  AnalyticsObservationsRate,
  AnalyticsQuery,
  AnalyticsSummary,
  AnalyticsUpdateFrequency,
  Camera
} from '@/api/client';
import type { ParkingZone } from '@/types';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { useSessionStore } from '@/auth/sessionStore';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { useYandexMap } from '@/maps/useYandexMap';
import { fitYandexMap, yandexPoint, type YandexPoint } from '@/maps/yandex';

type PeriodPreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

type AnalyticsFilters = {
  period: PeriodPreset;
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  selectedZoneIds: string[];
  selectedCameraIds: string[];
  zoneSearch: string;
  cameraSearch: string;
  autoRefresh: boolean;
};

type LoadState<T> = {
  loading: boolean;
  data?: T;
  error?: string;
};

type ChartPoint = {
  x: string;
  y: number | null;
  meta?: Record<string, unknown>;
};

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  points: ChartPoint[];
};

type AnalyticsRouteState =
  | { view: 'dashboard' }
  | { view: 'zone'; zoneId: string }
  | { view: 'camera'; cameraId: string }
  | { view: 'detection'; detectionRunId: string };

const AUTO_REFRESH_MS = 60_000;
const MAX_VISIBLE_SERIES = 10;
const STALE_THRESHOLD_MINUTES = Number(import.meta.env.VITE_ANALYTICS_STALE_MINUTES ?? 10);
const CHART_COLORS = ['#128a45', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#be123c', '#4d7c0f', '#9333ea', '#0f766e'];

function emptyState<T>(): LoadState<T> {
  return { loading: false };
}

function parseAnalyticsRoute(): AnalyticsRouteState {
  const query = window.location.hash.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const view = params.get('view');
  if (view === 'zone' && params.get('zoneId')) return { view, zoneId: params.get('zoneId')! };
  if (view === 'camera' && params.get('cameraId')) return { view, cameraId: params.get('cameraId')! };
  if (view === 'detection' && params.get('detectionRunId')) return { view, detectionRunId: params.get('detectionRunId')! };
  return { view: 'dashboard' };
}

function setAnalyticsRoute(route: AnalyticsRouteState) {
  const params = new URLSearchParams();
  if (route.view !== 'dashboard') params.set('view', route.view);
  if (route.view === 'zone') params.set('zoneId', route.zoneId);
  if (route.view === 'camera') params.set('cameraId', route.cameraId);
  if (route.view === 'detection') params.set('detectionRunId', route.detectionRunId);
  const suffix = params.toString();
  window.location.hash = suffix ? `#/analytics?${suffix}` : '#/analytics';
}

function useAnalyticsRoute() {
  const [route, setRoute] = useState<AnalyticsRouteState>(() => parseAnalyticsRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(parseAnalyticsRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function toDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function defaultFilters(): AnalyticsFilters {
  const now = new Date();
  return {
    period: 'today',
    from: toDateInputValue(startOfDay(now)),
    to: toDateInputValue(endOfDay(now)),
    granularity: '15m',
    selectedZoneIds: [],
    selectedCameraIds: [],
    zoneSearch: '',
    cameraSearch: '',
    autoRefresh: true
  };
}

function rangeForFilters(filters: AnalyticsFilters) {
  const now = new Date();
  if (filters.period === 'today') {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (filters.period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: startOfDay(yesterday).toISOString(), to: endOfDay(yesterday).toISOString() };
  }
  if (filters.period === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (filters.period === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return {
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined
  };
}

function normalizePercent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value > 1 ? value : value * 100;
}

function formatPercent(value?: number | null) {
  const percent = normalizePercent(value);
  return percent === null ? '—' : `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

function formatNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)} сек`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`;
  return `${(seconds / 3600).toFixed(1)} ч`;
}

function getPointTime(point: { ts?: string; timestamp?: string }) {
  return point.ts ?? point.timestamp ?? '';
}

function getZoneLabel(zoneId: number | string | undefined, zones: ParkingZone[]) {
  if (zoneId === undefined) return 'Среднее';
  const zone = zones.find(item => String(item.id) === String(zoneId));
  return zone ? `Зона #${zone.id} · камера #${zone.camera_id}` : `Зона #${String(zoneId)}`;
}

function getCameraLabel(cameraId: number | undefined | null, cameras: Camera[]) {
  if (!cameraId) return 'Камера';
  const camera = cameras.find(item => item.camera_id === cameraId);
  return camera ? `#${camera.camera_id} · ${camera.title}` : `Камера #${cameraId}`;
}

function asItems<T>(input?: { items?: T[]; points?: T[] }) {
  return input?.items ?? input?.points ?? [];
}

function averageSeries(points: ChartPoint[], label = 'Среднее по выбранным зонам'): ChartSeries[] {
  const grouped = new Map<string, number[]>();
  points.forEach(point => {
    if (point.y === null) return;
    const values = grouped.get(point.x) ?? [];
    values.push(point.y);
    grouped.set(point.x, values);
  });
  return [{
    key: 'average',
    label,
    color: CHART_COLORS[0],
    points: [...grouped.entries()].map(([x, values]) => ({
      x,
      y: values.reduce((sum, value) => sum + value, 0) / values.length
    }))
  }];
}

function historyToOccupancySeries(history: AnalyticsHistory | undefined, zones: ParkingZone[]): ChartSeries[] {
  const rawSeries = history?.series?.length
    ? history.series.map((series, index) => ({
      key: String(series.id ?? series.zone_id ?? index),
      label: series.label ?? getZoneLabel(series.zone_id ?? series.id, zones),
      color: CHART_COLORS[index % CHART_COLORS.length],
      points: series.points.map(point => ({
        x: getPointTime(point),
        y: normalizePercent(point.occupancy_percent) ?? (
          typeof point.occupied === 'number' && typeof (point.total ?? point.capacity) === 'number' && (point.total ?? point.capacity)! > 0
            ? (point.occupied / (point.total ?? point.capacity)!) * 100
            : null
        ),
        meta: point as Record<string, unknown>
      }))
    }))
    : groupHistoryPoints(asItems(history), zones);

  if (rawSeries.length <= MAX_VISIBLE_SERIES) return rawSeries;
  return averageSeries(rawSeries.flatMap(series => series.points));
}

function groupHistoryPoints(points: NonNullable<AnalyticsHistory['points']>, zones: ParkingZone[]): ChartSeries[] {
  const grouped = new Map<string, ChartPoint[]>();
  points.forEach(point => {
    const key = String(point.zone_id ?? 'average');
    const total = point.total ?? point.capacity;
    const occupancy = normalizePercent(point.occupancy_percent) ?? (
      typeof point.occupied === 'number' && typeof total === 'number' && total > 0
        ? (point.occupied / total) * 100
        : null
    );
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      { x: getPointTime(point), y: occupancy, meta: point as Record<string, unknown> }
    ]);
  });
  return [...grouped.entries()].map(([key, seriesPoints], index) => ({
    key,
    label: key === 'average' ? 'Среднее' : getZoneLabel(key, zones),
    color: CHART_COLORS[index % CHART_COLORS.length],
    points: seriesPoints
  }));
}

function forecastToSeries(history: AnalyticsHistory | undefined, forecast: AnalyticsForecast | undefined, zones: ParkingZone[]): ChartSeries[] {
  const fact = historyToOccupancySeries(history, zones).slice(0, 3).map(series => ({
    ...series,
    label: `${series.label} · факт`
  }));
  const forecastPoints = forecast?.series?.length
    ? forecast.series.map((series, index) => ({
      key: `forecast-${String(series.id ?? series.zone_id ?? index)}`,
      label: `${series.label ?? getZoneLabel(series.zone_id ?? series.id, zones)} · прогноз`,
      color: fact[index]?.color ?? CHART_COLORS[index % CHART_COLORS.length],
      dashed: true,
      points: series.points.map(point => ({
        x: getPointTime(point),
        y: normalizePercent((point as any).predicted_occupancy_percent ?? point.occupancy_percent),
        meta: point as Record<string, unknown>
      }))
    }))
    : groupForecastPoints(asItems(forecast), zones);
  return [...fact, ...forecastPoints];
}

function groupForecastPoints(points: NonNullable<AnalyticsForecast['points']>, zones: ParkingZone[]): ChartSeries[] {
  const grouped = new Map<string, ChartPoint[]>();
  points.forEach(point => {
    const key = String(point.zone_id ?? 'average');
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      {
        x: getPointTime(point),
        y: normalizePercent(point.predicted_occupancy_percent ?? point.occupancy_percent),
        meta: point as Record<string, unknown>
      }
    ]);
  });
  return [...grouped.entries()].map(([key, seriesPoints], index) => ({
    key: `forecast-${key}`,
    label: `${key === 'average' ? 'Среднее' : getZoneLabel(key, zones)} · прогноз`,
    color: CHART_COLORS[index % CHART_COLORS.length],
    dashed: true,
    points: seriesPoints
  }));
}

function observationsToBars(data?: AnalyticsObservationsRate): ChartPoint[] {
  return asItems<AnalyticsObservationPoint>(data).map(point => ({
    x: getPointTime(point),
    y: point.observations ?? point.count ?? null,
    meta: point as Record<string, unknown>
  }));
}

function confidenceToSeries(data?: AnalyticsConfidence): ChartSeries[] {
  return [{
    key: 'confidence',
    label: 'Уверенность модели',
    color: CHART_COLORS[0],
    points: asItems(data).map(point => ({
      x: getPointTime(point),
      y: normalizePercent(point.average_confidence ?? point.confidence),
      meta: point as Record<string, unknown>
    }))
  }];
}

function makeAnalyticsQuery(filters: AnalyticsFilters, partnerId?: number): AnalyticsQuery {
  return {
    partner_id: partnerId,
    ...rangeForFilters(filters),
    granularity: filters.granularity,
    zone_ids: filters.selectedZoneIds,
    camera_ids: filters.selectedCameraIds
  };
}

function blockError(error: unknown) {
  return String((error as any)?.message || error);
}

function hasCoordinates(latitude?: number | null, longitude?: number | null): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && typeof longitude === 'number'
    && Number.isFinite(longitude);
}

function zoneMapPoints(zone: ParkingZone): YandexPoint[] {
  if (zone.geometry?.coordinates?.[0]?.length) {
    return zone.geometry.coordinates[0]
      .slice(0, -1)
      .map(([longitude, latitude]) => yandexPoint(latitude, longitude));
  }
  return zone.points
    .filter(point => hasCoordinates(point.latitude, point.longitude))
    .map(point => yandexPoint(point.latitude!, point.longitude!));
}

function occupancyColor(value?: number | null, updatedAt?: string | null) {
  if (updatedAt) {
    const ageMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60_000;
    if (Number.isFinite(ageMinutes) && ageMinutes > STALE_THRESHOLD_MINUTES) return '#f97316';
  }
  const percent = normalizePercent(value);
  if (percent === null) return '#9ca3af';
  if (percent < 60) return '#15803d';
  if (percent <= 85) return '#d97706';
  return '#dc2626';
}

export default function AnalyticsPage() {
  const route = useAnalyticsRoute();

  if (route.view === 'zone') {
    return <AnalyticsComingSoon title={`Аналитика зоны #${route.zoneId}`} />;
  }
  if (route.view === 'camera') {
    return <AnalyticsComingSoon title={`Аналитика камеры #${route.cameraId}`} />;
  }
  if (route.view === 'detection') {
    return <AnalyticsComingSoon title={`Распознавание #${route.detectionRunId}`} />;
  }

  return <AnalyticsDashboard />;
}

function AnalyticsDashboard() {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const notifySuccess = useFeedbackStore(state => state.success);
  const [filters, setFilters] = useState<AnalyticsFilters>(() => defaultFilters());
  const [refreshKey, setRefreshKey] = useState(0);
  const [cameras, setCameras] = useState<LoadState<Camera[]>>(emptyState);
  const [zones, setZones] = useState<LoadState<ParkingZone[]>>(emptyState);
  const [summary, setSummary] = useState<LoadState<AnalyticsSummary>>(emptyState);
  const [frequency, setFrequency] = useState<LoadState<AnalyticsUpdateFrequency>>(emptyState);
  const [confidence, setConfidence] = useState<LoadState<AnalyticsConfidence>>(emptyState);
  const [history, setHistory] = useState<LoadState<AnalyticsHistory>>(emptyState);
  const [forecast, setForecast] = useState<LoadState<AnalyticsForecast>>(emptyState);
  const [observations, setObservations] = useState<LoadState<AnalyticsObservationsRate>>(emptyState);
  const [health, setHealth] = useState<LoadState<AnalyticsDetectorHealth>>(emptyState);

  const query = useMemo(() => makeAnalyticsQuery(filters, currentPartnerId), [filters, currentPartnerId]);
  const zoneItems = zones.data ?? [];
  const cameraItems = cameras.data ?? [];

  const loadDashboard = useCallback(async (silent = false) => {
    const nextQuery = makeAnalyticsQuery(filters, currentPartnerId);
    if (!silent) {
      setSummary({ loading: true });
      setFrequency({ loading: true });
      setConfidence({ loading: true });
      setHistory({ loading: true });
      setForecast({ loading: true });
      setObservations({ loading: true });
      setHealth({ loading: true });
    }

    const results = await Promise.allSettled([
      api.analytics.summary(nextQuery),
      api.analytics.updateFrequency(nextQuery),
      api.analytics.confidence(nextQuery),
      api.analytics.occupancyHistory(nextQuery),
      api.analytics.occupancyForecast(nextQuery),
      api.analytics.observationsRate(nextQuery),
      api.analytics.detectorHealth(nextQuery)
    ]);

    const setters = [setSummary, setFrequency, setConfidence, setHistory, setForecast, setObservations, setHealth] as const;
    results.forEach((result, index) => {
      setters[index](result.status === 'fulfilled'
        ? { loading: false, data: result.value as never }
        : { loading: false, error: blockError(result.reason) }
      );
    });
  }, [filters, currentPartnerId]);

  useEffect(() => {
    let cancelled = false;
    setCameras({ loading: true });
    setZones({ loading: true });

    Promise.allSettled([
      api.listCameras({ partner_id: currentPartnerId }),
      api.listZones({ partner_id: currentPartnerId })
    ]).then(([cameraResult, zoneResult]) => {
      if (cancelled) return;
      setCameras(cameraResult.status === 'fulfilled' ? { loading: false, data: cameraResult.value } : { loading: false, error: blockError(cameraResult.reason) });
      setZones(zoneResult.status === 'fulfilled' ? { loading: false, data: zoneResult.value } : { loading: false, error: blockError(zoneResult.reason) });
    });

    return () => {
      cancelled = true;
    };
  }, [currentPartnerId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const timer = window.setInterval(() => {
      loadDashboard(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [filters.autoRefresh, loadDashboard]);

  const occupancySeries = useMemo(() => historyToOccupancySeries(history.data, zoneItems), [history.data, zoneItems]);
  const forecastSeries = useMemo(() => forecastToSeries(history.data, forecast.data, zoneItems), [history.data, forecast.data, zoneItems]);
  const confidenceSeries = useMemo(() => confidenceToSeries(confidence.data), [confidence.data]);
  const observationBars = useMemo(() => observationsToBars(observations.data), [observations.data]);

  function refresh() {
    setRefreshKey(key => key + 1);
    notifySuccess('Аналитика обновляется.');
  }

  return (
    <section className="page-stack analytics-page">
      <div className="page-heading">
        <div>
          <h1>Аналитика</h1>
          <p>
            Текущая занятость, история, прогнозы и состояние detector-а
            {currentPartnerId !== undefined ? ` · партнёр #${currentPartnerId}` : ''}
          </p>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={refresh}>Обновить</Button>
        </div>
      </div>

      <AnalyticsFiltersPanel
        filters={filters}
        cameras={cameraItems}
        zones={zoneItems}
        loading={cameras.loading || zones.loading}
        cameraError={cameras.error}
        zoneError={zones.error}
        onChange={setFilters}
        onRefresh={refresh}
      />

      <KpiGrid
        summary={summary}
        frequency={frequency}
        confidence={confidence}
      />

      <div className="analytics-dashboard-grid">
        <Block title="Карта зон и камер" state={{ loading: zones.loading || cameras.loading, error: zones.error || cameras.error, data: true }}>
          <AnalyticsMap
            zones={zoneItems}
            cameras={cameraItems}
            summary={summary.data}
          />
        </Block>

        <Block title="Проблемные зоны" state={health}>
          <DetectorHealthTable items={health.data?.items ?? []} />
        </Block>
      </div>

      <div className="analytics-chart-grid">
        <Block title="Занятость" state={history}>
          <LineChart series={occupancySeries} unit="%" emptyMessage="Нет данных за выбранный период" />
        </Block>

        <Block title="Прогноз занятости" state={forecast}>
          <LineChart series={forecastSeries} unit="%" emptyMessage="Прогноз недоступен" />
        </Block>

        <Block title="Количество наблюдений" state={observations}>
          <BarChart points={observationBars} emptyMessage="Нет наблюдений за выбранный период" />
        </Block>

        <Block title="Уверенность модели" state={confidence}>
          <LineChart series={confidenceSeries} unit="%" emptyMessage="Нет данных по уверенности модели" />
        </Block>
      </div>
    </section>
  );
}

function AnalyticsFiltersPanel({
  filters,
  cameras,
  zones,
  loading,
  cameraError,
  zoneError,
  onChange,
  onRefresh
}: {
  filters: AnalyticsFilters;
  cameras: Camera[];
  zones: ParkingZone[];
  loading: boolean;
  cameraError?: string;
  zoneError?: string;
  onChange: React.Dispatch<React.SetStateAction<AnalyticsFilters>>;
  onRefresh: () => void;
}) {
  return (
    <div className="section-panel analytics-filters">
      <div className="analytics-filter-row">
        <Field label="Период">
          <Select
            value={filters.period}
            onChange={event => onChange(prev => ({ ...prev, period: event.target.value as PeriodPreset }))}
          >
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
            <option value="custom">Произвольный</option>
          </Select>
        </Field>

        {filters.period === 'custom' && (
          <>
            <Field label="С">
              <Input type="datetime-local" value={filters.from} onChange={event => onChange(prev => ({ ...prev, from: event.target.value }))} />
            </Field>
            <Field label="По">
              <Input type="datetime-local" value={filters.to} onChange={event => onChange(prev => ({ ...prev, to: event.target.value }))} />
            </Field>
          </>
        )}

        <Field label="Детализация">
          <Select
            value={filters.granularity}
            onChange={event => onChange(prev => ({ ...prev, granularity: event.target.value as AnalyticsGranularity }))}
          >
            <option value="5m">5 минут</option>
            <option value="15m">15 минут</option>
            <option value="1h">1 час</option>
            <option value="1d">1 день</option>
          </Select>
        </Field>

        <label className="analytics-toggle">
          <input
            type="checkbox"
            checked={filters.autoRefresh}
            onChange={event => onChange(prev => ({ ...prev, autoRefresh: event.target.checked }))}
          />
          <span>Автообновление</span>
        </label>

        <Button type="button" onClick={onRefresh} disabled={loading}>Обновить данные</Button>
      </div>

      <div className="analytics-picker-grid">
        <MultiEntityPicker
          title="Парковочные зоны"
          search={filters.zoneSearch}
          onSearch={value => onChange(prev => ({ ...prev, zoneSearch: value }))}
          selectedIds={filters.selectedZoneIds}
          onSelectedIds={ids => onChange(prev => ({ ...prev, selectedZoneIds: ids }))}
          items={zones.map(zone => ({
            id: String(zone.id),
            label: `Зона #${zone.id}`,
            meta: `камера #${zone.camera_id}`
          }))}
          emptyMessage={zoneError ?? 'Зоны не найдены'}
        />
        <MultiEntityPicker
          title="Камеры"
          search={filters.cameraSearch}
          onSearch={value => onChange(prev => ({ ...prev, cameraSearch: value }))}
          selectedIds={filters.selectedCameraIds}
          onSelectedIds={ids => onChange(prev => ({ ...prev, selectedCameraIds: ids }))}
          items={cameras.map(camera => ({
            id: String(camera.camera_id),
            label: `#${camera.camera_id} · ${camera.title}`,
            meta: camera.source
          }))}
          emptyMessage={cameraError ?? 'Камеры не найдены'}
        />
      </div>
    </div>
  );
}

function MultiEntityPicker({
  title,
  search,
  selectedIds,
  items,
  emptyMessage,
  onSearch,
  onSelectedIds
}: {
  title: string;
  search: string;
  selectedIds: string[];
  items: Array<{ id: string; label: string; meta?: string }>;
  emptyMessage: string;
  onSearch: (value: string) => void;
  onSelectedIds: (ids: string[]) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = items.filter(item => {
    if (!normalizedSearch) return true;
    return `${item.id} ${item.label} ${item.meta ?? ''}`.toLowerCase().includes(normalizedSearch);
  });
  const visibleIds = visibleItems.map(item => item.id);
  const visibleSelected = visibleIds.filter(id => selectedIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;

  function toggle(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIds([...next]);
  }

  function toggleVisible(checked: boolean) {
    const next = new Set(selectedIds);
    visibleIds.forEach(id => {
      if (checked) next.add(id);
      else next.delete(id);
    });
    onSelectedIds([...next]);
  }

  return (
    <div className="analytics-picker">
      <div className="analytics-picker-head">
        <strong>{title}</strong>
        <span className="small">выбрано: {selectedIds.length}</span>
      </div>
      <Input value={search} onChange={event => onSearch(event.target.value)} placeholder="Поиск по id или названию" />
      <label className="analytics-check-row">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          ref={input => {
            if (input) input.indeterminate = visibleSelected.length > 0 && !allVisibleSelected;
          }}
          onChange={event => toggleVisible(event.target.checked)}
        />
        <span>Все отфильтрованные</span>
      </label>
      <div className="analytics-picker-list">
        {visibleItems.map(item => (
          <label key={item.id} className="analytics-check-row">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={event => toggle(item.id, event.target.checked)}
            />
            <span>
              <strong>{item.label}</strong>
              {item.meta && <span className="small">{item.meta}</span>}
            </span>
          </label>
        ))}
        {!visibleItems.length && <div className="empty-state">{emptyMessage}</div>}
      </div>
    </div>
  );
}

function KpiGrid({
  summary,
  frequency,
  confidence
}: {
  summary: LoadState<AnalyticsSummary>;
  frequency: LoadState<AnalyticsUpdateFrequency>;
  confidence: LoadState<AnalyticsConfidence>;
}) {
  const cards = [
    { label: 'Активных зон', value: formatNumber(summary.data?.active_zones) },
    { label: 'Всего мест', value: formatNumber(summary.data?.total_capacity) },
    { label: 'Занято сейчас', value: formatNumber(summary.data?.occupied_now) },
    { label: 'Свободно сейчас', value: formatNumber(summary.data?.free_now) },
    { label: 'Средняя занятость', value: formatPercent(summary.data?.average_occupancy_percent) },
    { label: 'Самое свежее обновление', value: formatDateTime(summary.data?.newest_update_at ?? frequency.data?.newest_update_at) },
    { label: 'Самое старое обновление', value: formatDateTime(summary.data?.oldest_update_at ?? frequency.data?.oldest_update_at) },
    { label: 'Средняя частота', value: formatDuration(frequency.data?.average_interval_seconds) },
    { label: 'Макс. интервал', value: formatDuration(frequency.data?.max_interval_seconds) },
    { label: 'Уверенность модели', value: formatPercent(confidence.data?.average_confidence ?? summary.data?.average_confidence) }
  ];

  return (
    <div className="metric-grid analytics-kpi-grid">
      {cards.map(card => (
        <div className="metric-card" key={card.label}>
          <div className="metric-label">{card.label}</div>
          <div className="metric-value">{summary.loading || frequency.loading || confidence.loading ? '...' : card.value}</div>
        </div>
      ))}
    </div>
  );
}

function Block<T>({
  title,
  state,
  children
}: {
  title: string;
  state: LoadState<T>;
  children: React.ReactNode;
}) {
  return (
    <div className="section-panel analytics-block">
      <div className="analytics-block-head">
        <h2>{title}</h2>
        {state.loading && <span className="small">Загрузка...</span>}
      </div>
      {state.error ? (
        <div className="notice error">Не удалось загрузить блок: {state.error}</div>
      ) : children}
    </div>
  );
}

function LineChart({ series, unit, emptyMessage }: { series: ChartSeries[]; unit?: string; emptyMessage: string }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const visibleSeries = series.filter(item => !hidden.has(item.key));
  const values = visibleSeries.flatMap(item => item.points.map(point => point.y).filter((value): value is number => typeof value === 'number'));
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const width = 720;
  const height = 260;
  const padding = 34;

  if (!series.length || !series.some(item => item.points.length)) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const toX = (pointIndex: number, total: number) => {
    if (total <= 1) return padding;
    return padding + (pointIndex / (total - 1)) * (width - padding * 2);
  };
  const toY = (value: number | null) => {
    const safeValue = value ?? minValue;
    return height - padding - ((safeValue - minValue) / (maxValue - minValue || 1)) * (height - padding * 2);
  };

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chart-axis" />
        {visibleSeries.map(item => {
          const points = item.points
            .map((point, index) => point.y === null ? null : `${toX(index, item.points.length)},${toY(point.y)}`)
            .filter(Boolean)
            .join(' ');
          return (
            <polyline
              key={item.key}
              points={points}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeDasharray={item.dashed ? '7 7' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {visibleSeries.map(item => item.points.map((point, index) => {
          if (point.y === null) return null;
          return (
            <circle key={`${item.key}-${index}`} cx={toX(index, item.points.length)} cy={toY(point.y)} r="3.5" fill={item.color}>
              <title>{`${item.label}\n${formatDateTime(point.x)}\n${point.y.toFixed(1)}${unit ?? ''}`}</title>
            </circle>
          );
        }))}
      </svg>
      <div className="chart-legend">
        {series.map(item => (
          <button
            key={item.key}
            type="button"
            className={hidden.has(item.key) ? 'muted' : ''}
            onClick={() => setHidden(prev => {
              const next = new Set(prev);
              if (next.has(item.key)) next.delete(item.key);
              else next.add(item.key);
              return next;
            })}
          >
            <span style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BarChart({ points, emptyMessage }: { points: ChartPoint[]; emptyMessage: string }) {
  const values = points.map(point => point.y).filter((value): value is number => typeof value === 'number');
  const maxValue = Math.max(1, ...values);
  const width = 720;
  const height = 260;
  const padding = 34;

  if (!points.length || !values.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const barWidth = Math.max(4, (width - padding * 2) / points.length - 4);

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
        {points.map((point, index) => {
          const value = point.y ?? 0;
          const barHeight = (value / maxValue) * (height - padding * 2);
          const x = padding + index * ((width - padding * 2) / points.length);
          const y = height - padding - barHeight;
          return (
            <rect key={`${point.x}-${index}`} x={x} y={y} width={barWidth} height={barHeight} rx="4" fill="#128a45">
              <title>{`${formatDateTime(point.x)}\n${formatNumber(value)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function AnalyticsMap({
  zones,
  cameras,
  summary
}: {
  zones: ParkingZone[];
  cameras: Camera[];
  summary?: AnalyticsSummary;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<React.ReactNode>(null);
  const center = useMemo<YandexPoint>(() => {
    const camera = cameras.find(item => hasCoordinates(item.latitude, item.longitude));
    if (camera) return yandexPoint(camera.latitude, camera.longitude);
    const zone = zones.map(zoneMapPoints).find(points => points.length > 0);
    if (zone?.[0]) return zone[0];
    return yandexPoint(59.9386, 30.3141);
  }, [cameras, zones]);
  const { ymaps, map, loading, error } = useYandexMap(mapRef, { center, zoom: 12, syncView: false });

  useEffect(() => {
    if (!ymaps || !map) return;
    const collection = new ymaps.GeoObjectCollection();
    const boundsPoints: YandexPoint[] = [];
    const summaryByZone = new Map((summary?.zones ?? []).map(item => [String(item.zone_id), item]));

    zones.forEach(zone => {
      const points = zoneMapPoints(zone);
      if (points.length < 3) return;
      boundsPoints.push(...points);
      const zoneSummary = summaryByZone.get(String(zone.id));
      const color = occupancyColor(zoneSummary?.occupancy_percent, zoneSummary?.last_update_at ?? zone.occupancy_updated_at);
      const polygon = new ymaps.Polygon(
        [points],
        { hintContent: `Зона #${String(zone.id)}` },
        {
          strokeColor: color,
          strokeOpacity: 0.95,
          strokeWidth: 2,
          fillColor: color,
          fillOpacity: 0.2,
          zIndex: 150
        }
      );
      polygon.events.add('click', () => {
        setSelected(
          <MapDetails
            title={`Зона #${String(zone.id)}`}
            rows={[
              ['Всего мест', formatNumber(zoneSummary?.capacity ?? zone.capacity)],
              ['Занято', formatNumber(zoneSummary?.occupied ?? zone.occupied)],
              ['Свободно', formatNumber(zoneSummary?.free ?? zone.free_count)],
              ['Занятость', formatPercent(zoneSummary?.occupancy_percent)],
              ['Последнее обновление', formatDateTime(zoneSummary?.last_update_at ?? zone.occupancy_updated_at)]
            ]}
            actions={[
              ['Редактировать камеру', () => setAnalyticsRoute({ view: 'camera', cameraId: String(zone.camera_id) })],
              ['Аналитика зоны', () => setAnalyticsRoute({ view: 'zone', zoneId: String(zone.id) })]
            ]}
          />
        );
      });
      collection.add(polygon);
    });

    cameras.forEach(camera => {
      if (!hasCoordinates(camera.latitude, camera.longitude)) return;
      const point = yandexPoint(camera.latitude, camera.longitude);
      boundsPoints.push(point);
      const placemark = new ymaps.Placemark(
        point,
        { hintContent: `Камера #${camera.camera_id}` },
        {
          preset: 'islands#circleDotIcon',
          iconColor: camera.is_active === false ? '#9ca3af' : '#128a45'
        }
      );
      placemark.events.add('click', () => {
        setSelected(
          <MapDetails
            title={`Камера #${camera.camera_id}`}
            rows={[
              ['Название', camera.title],
              ['Статус', camera.is_active === false ? 'Неактивна' : 'Активна'],
              ['Последнее обновление', formatDateTime(camera.updated_at)]
            ]}
            actions={[
              ['Аналитика камеры', () => setAnalyticsRoute({ view: 'camera', cameraId: String(camera.camera_id) })]
            ]}
          />
        );
      });
      collection.add(placemark);
    });

    map.geoObjects.add(collection);
    if (boundsPoints.length) fitYandexMap(map, boundsPoints, 12);
    return () => {
      map.geoObjects.remove(collection);
    };
  }, [ymaps, map, zones, cameras, summary]);

  return (
    <div className="analytics-map-layout">
      <div className="analytics-map-host" ref={mapRef}>
        {loading && <div className="map-status-overlay">Загрузка Яндекс.Карт...</div>}
        {error && <div className="map-status-overlay error">{error}</div>}
      </div>
      <div className="analytics-map-details">
        {selected ?? <div className="empty-state">Выберите зону или камеру на карте.</div>}
      </div>
    </div>
  );
}

function MapDetails({
  title,
  rows,
  actions
}: {
  title: string;
  rows: Array<[string, React.ReactNode]>;
  actions: Array<[string, () => void]>;
}) {
  return (
    <div className="analytics-map-card">
      <h3>{title}</h3>
      <div className="analytics-detail-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span className="metric-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
        {actions.map(([label, action]) => (
          <Button key={label} variant="ghost" onClick={action}>{label}</Button>
        ))}
      </div>
    </div>
  );
}

function DetectorHealthTable({ items }: { items: AnalyticsDetectorHealthItem[] }) {
  if (!items.length) {
    return <div className="empty-state">У зоны нет свежих наблюдений.</div>;
  }

  return (
    <div className="table-scroll analytics-health-table-wrap">
      <div className="table-header analytics-health-table">
        <span>Зона</span>
        <span>Камера</span>
        <span>Всего</span>
        <span>Занято</span>
        <span>Свободно</span>
        <span>Занятость</span>
        <span>Уверенность модели</span>
        <span>Последнее обновление</span>
        <span>Возраст</span>
        <span>Средний интервал</span>
        <span>Макс. интервал</span>
        <span>Статус</span>
      </div>
      <div className="table-list">
        {items.map(item => (
          <button
            type="button"
            key={String(item.zone_id)}
            className="table-row analytics-health-table contract-row-button"
            onClick={() => setAnalyticsRoute({ view: 'zone', zoneId: String(item.zone_id) })}
          >
            <span>#{String(item.zone_id)}</span>
            <span>{item.camera_id ? `#${item.camera_id}` : '—'}</span>
            <span>{formatNumber(item.capacity)}</span>
            <span>{formatNumber(item.occupied)}</span>
            <span>{formatNumber(item.free)}</span>
            <span>{formatPercent(item.occupancy_percent)}</span>
            <span>{formatPercent(item.confidence)}</span>
            <span>{formatDateTime(item.last_update_at)}</span>
            <span>{formatDuration(item.stale_seconds)}</span>
            <span>{formatDuration(item.average_interval_seconds)}</span>
            <span>{formatDuration(item.max_interval_seconds)}</span>
            <span className={`status-pill analytics-status-${item.status ?? 'no_data'}`}>{item.status ?? 'no_data'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalyticsComingSoon({ title }: { title: string }) {
  return (
    <section className="page-stack analytics-page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>Детальная страница будет добавлена следующим коммитом.</p>
        </div>
        <Button variant="ghost" onClick={() => setAnalyticsRoute({ view: 'dashboard' })}>Назад к аналитике</Button>
      </div>
      <div className="section-panel">
        <div className="empty-state">Контейнер детализации подключён.</div>
      </div>
    </section>
  );
}
