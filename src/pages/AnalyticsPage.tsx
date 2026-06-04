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
  Camera,
  DetectionFeedback,
  DetectionFeedbackErrorType,
  DetectionFeedbackRating,
  DetectionRunDetail,
  DetectionRunList,
  ForecastQualityResponse,
  LegacyForecastSeriesPoint,
  LegacyOccupancySeriesPoint
} from '@/api/client';
import type { ParkingZone } from '@/types';
import { Button, Field, Input, Select } from '@/components/UiKit';
import { useSessionStore } from '@/auth/sessionStore';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { useYandexMap } from '@/maps/useYandexMap';
import { fitYandexMap, yandexPoint, type YandexPoint } from '@/maps/yandex';
import { useStore } from '@/store/useStore';
import { navigate } from '@/router/routes';

type PeriodPreset = 'today' | 'yesterday' | '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'custom';
type AutoRefreshInterval = 'off' | '10s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h';

type AnalyticsFilters = {
  period: PeriodPreset;
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  selectedZoneIds: string[];
  selectedCameraIds: string[];
  zoneSearch: string;
  cameraSearch: string;
  forecastCreatedAt: string;
  autoRefreshInterval: AutoRefreshInterval;
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

type LegacyOccupancyDataset = {
  key: string;
  label: string;
  points: LegacyOccupancySeriesPoint[];
};

type LegacyForecastDataset = {
  key: string;
  label: string;
  points: LegacyForecastSeriesPoint[];
};

type AnalyticsRouteState =
  | { view: 'dashboard' }
  | { view: 'zone'; zoneId: string }
  | { view: 'camera'; cameraId: string }
  | { view: 'detection'; detectionRunId: string };

const AUTO_REFRESH_INTERVALS: Record<AutoRefreshInterval, number | null> = {
  off: null,
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000
};
const MAX_VISIBLE_SERIES = 10;
const MAX_CHART_POINTS = 120;
const MAX_MARKER_POINTS = 90;
const STALE_THRESHOLD_MINUTES = Number(import.meta.env.VITE_ANALYTICS_STALE_MINUTES ?? 10);
const CHART_COLORS = ['#128a45', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#be123c', '#4d7c0f', '#9333ea', '#0f766e'];
const GRANULARITY_LABELS: Record<AnalyticsGranularity, string> = {
  '5m': '5 минут',
  '15m': '15 минут',
  '1h': '1 час',
  '1d': '1 день'
};

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
    forecastCreatedAt: '',
    autoRefreshInterval: '1m'
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
  const relativePeriodMs: Partial<Record<PeriodPreset, number>> = {
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '12h': 12 * 60 * 60_000,
    '24h': 24 * 60 * 60_000
  };
  const relativeMs = relativePeriodMs[filters.period];
  if (relativeMs) {
    return { from: new Date(now.getTime() - relativeMs).toISOString(), to: now.toISOString() };
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

function formatRelativeDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const differenceMs = date.getTime() - Date.now();
  const absoluteMs = Math.abs(differenceMs);
  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; milliseconds: number }> = [
    { unit: 'year', milliseconds: 365 * 24 * 60 * 60_000 },
    { unit: 'month', milliseconds: 30 * 24 * 60 * 60_000 },
    { unit: 'day', milliseconds: 24 * 60 * 60_000 },
    { unit: 'hour', milliseconds: 60 * 60_000 },
    { unit: 'minute', milliseconds: 60_000 },
    { unit: 'second', milliseconds: 1_000 }
  ];
  const selected = units.find(item => absoluteMs >= item.milliseconds) ?? units[units.length - 1];
  const amount = Math.round(differenceMs / selected.milliseconds);

  return new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' }).format(amount, selected.unit);
}

function formatStatus(value?: string | null) {
  const labels: Record<string, string> = {
    active: 'Активна',
    inactive: 'Неактивна',
    stale: 'Данные устарели',
    error: 'Ошибка'
  };
  return labels[value ?? ''] ?? value ?? '—';
}

function detectorStatus(value?: string | null) {
  const normalized = (value ?? 'no_data').trim().toLowerCase().replaceAll(' ', '_');
  const labels: Record<string, string> = {
    online: 'Онлайн',
    stale: 'Данные устарели',
    offline: 'Офлайн',
    no_data: 'Нет данных',
    low_confidence: 'Низкая уверенность',
    error: 'Ошибка'
  };
  return {
    key: normalized,
    label: labels[normalized] ?? value ?? labels.no_data
  };
}

function parsePointTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAxisDateTime(value: string | number) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatAxisNumber(value: number, unit?: string) {
  const digits = Math.abs(value) >= 10 || value === 0 ? 0 : 1;
  return `${value.toFixed(digits)}${unit ?? ''}`;
}

function formatMetaValue(value: unknown) {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function chartTooltipLines(label: string, point: ChartPoint, value: string) {
  const meta = point.meta ?? {};
  const lines = [label, formatAxisDateTime(point.x), value];
  const zoneLabel = formatMetaValue(meta.zone_label);
  const zoneId = formatMetaValue(meta.zone_id);
  const cameraId = formatMetaValue(meta.camera_id);
  const occupied = formatMetaValue((meta as any).occupied_count ?? (meta as any).occupied ?? (meta as any).actual_occupied_count ?? (meta as any).predicted_occupied_count);
  const free = formatMetaValue((meta as any).free_count ?? (meta as any).free ?? (meta as any).predicted_free_count);
  const capacity = formatMetaValue((meta as any).capacity ?? (meta as any).total);
  const confidence = normalizePercent((meta as any).confidence_avg ?? (meta as any).average_confidence ?? (meta as any).confidence);
  const observations = formatMetaValue((meta as any).observations_count ?? (meta as any).observations ?? (meta as any).count);
  const forecastCreatedAt = formatMetaValue((meta as any).forecast_created_at);
  const modelVersion = formatMetaValue((meta as any).model_version);
  const errorPercent = normalizePercent((meta as any).absolute_error_occupancy_percent);
  const aggregatedCount = formatMetaValue((meta as any).aggregated_count);

  if (zoneLabel) lines.push(zoneLabel);
  else if (zoneId) lines.push(`Зона #${zoneId}`);
  if (cameraId) lines.push(`Камера #${cameraId}`);
  if (occupied) lines.push(`Занято: ${occupied}`);
  if (free) lines.push(`Свободно: ${free}`);
  if (capacity) lines.push(`Всего мест: ${capacity}`);
  if (confidence !== null) lines.push(`Уверенность: ${formatPercent(confidence)}`);
  if (observations) lines.push(`Наблюдений: ${observations}`);
  if (forecastCreatedAt) lines.push(`Прогноз создан: ${formatDateTime(forecastCreatedAt)}`);
  if (modelVersion) lines.push(`Модель: ${modelVersion}`);
  if (errorPercent !== null) lines.push(`Ошибка: ${formatPercent(errorPercent)}`);
  if (aggregatedCount) lines.push(`Агрегировано точек: ${aggregatedCount}`);

  return lines;
}

function wrapTooltipLines(lines: string[], maxCharacters = 26) {
  return lines.flatMap(line => {
    if (line.length <= maxCharacters) return [line];

    const wrapped: string[] = [];
    let current = '';
    line.split(/\s+/).forEach(word => {
      if (word.length > maxCharacters) {
        if (current) {
          wrapped.push(current);
          current = '';
        }
        for (let index = 0; index < word.length; index += maxCharacters) {
          wrapped.push(word.slice(index, index + maxCharacters));
        }
        return;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxCharacters) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) wrapped.push(current);
    return wrapped;
  });
}

function sortChartPoints(points: ChartPoint[]) {
  return [...points].sort((a, b) => {
    const aTime = parsePointTime(a.x);
    const bTime = parsePointTime(b.x);
    if (aTime !== null && bTime !== null) return aTime - bTime;
    return a.x.localeCompare(b.x);
  });
}

function bucketPointTime(value: string, granularity?: AnalyticsGranularity) {
  if (!granularity) return value;
  const time = parsePointTime(value);
  if (time === null) return value;

  const date = new Date(time);
  if (granularity === '1d') {
    date.setHours(0, 0, 0, 0);
  } else if (granularity === '1h') {
    date.setMinutes(0, 0, 0);
  } else {
    const stepMinutes = granularity === '5m' ? 5 : 15;
    date.setMinutes(Math.floor(date.getMinutes() / stepMinutes) * stepMinutes, 0, 0);
  }
  return date.toISOString();
}

function compactLinePoints(points: ChartPoint[], maxPoints = MAX_CHART_POINTS, granularity?: AnalyticsGranularity): ChartPoint[] {
  const grouped = new Map<string, { sum: number; count: number; meta?: Record<string, unknown> }>();
  points.forEach(point => {
    if (typeof point.y !== 'number' || !Number.isFinite(point.y)) return;
    const key = bucketPointTime(point.x, granularity);
    const bucket = grouped.get(key) ?? { sum: 0, count: 0, meta: point.meta };
    bucket.sum += point.y;
    bucket.count += 1;
    grouped.set(key, bucket);
  });

  const averaged = sortChartPoints([...grouped.entries()].map(([x, value]) => ({
    x,
    y: value.sum / value.count,
    meta: {
      ...value.meta,
      aggregated_count: value.count
    }
  })));

  if (averaged.length <= maxPoints) return averaged;

  const bucketSize = Math.ceil(averaged.length / maxPoints);
  const compacted: ChartPoint[] = [];
  for (let index = 0; index < averaged.length; index += bucketSize) {
    const bucket = averaged.slice(index, index + bucketSize);
    const values = bucket.map(point => point.y).filter((value): value is number => typeof value === 'number');
    if (!values.length) continue;
    const middle = bucket[Math.floor(bucket.length / 2)];
    compacted.push({
      x: middle.x,
      y: values.reduce((sum, value) => sum + value, 0) / values.length,
      meta: { aggregated_count: bucket.length }
    });
  }
  return compacted;
}

function compactBarPoints(points: ChartPoint[], maxPoints = MAX_CHART_POINTS, granularity?: AnalyticsGranularity): ChartPoint[] {
  const grouped = new Map<string, number>();
  points.forEach(point => {
    if (typeof point.y !== 'number' || !Number.isFinite(point.y)) return;
    const key = bucketPointTime(point.x, granularity);
    grouped.set(key, (grouped.get(key) ?? 0) + point.y);
  });

  const summed = sortChartPoints([...grouped.entries()].map(([x, y]) => ({ x, y })));
  if (summed.length <= maxPoints) return summed;

  const bucketSize = Math.ceil(summed.length / maxPoints);
  const compacted: ChartPoint[] = [];
  for (let index = 0; index < summed.length; index += bucketSize) {
    const bucket = summed.slice(index, index + bucketSize);
    const middle = bucket[Math.floor(bucket.length / 2)];
    compacted.push({
      x: middle.x,
      y: bucket.reduce((sum, point) => sum + (point.y ?? 0), 0),
      meta: { aggregated_count: bucket.length }
    });
  }
  return compacted;
}

function chartTimeDomain(series: ChartSeries[]) {
  const timestamps = series
    .flatMap(item => item.points.map(point => parsePointTime(point.x)))
    .filter((value): value is number => value !== null);
  if (!timestamps.length) return null;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return min === max ? null : { min, max };
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)} сек`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`;
  return `${(seconds / 3600).toFixed(1)} ч`;
}

function getPointTime(point: { ts?: string; timestamp?: string; predicted_for?: string | null }) {
  return point.ts ?? point.timestamp ?? point.predicted_for ?? '';
}

function pointOccupied(point: { occupied_count?: number | null; occupied?: number | null }) {
  return point.occupied_count ?? point.occupied ?? null;
}

function pointFree(point: { free_count?: number | null; free?: number | null }) {
  return point.free_count ?? point.free ?? null;
}

function pointCapacity(point: { capacity?: number | null; total?: number | null }) {
  return point.capacity ?? point.total ?? null;
}

function pointConfidence(point: { confidence_avg?: number | null; average_confidence?: number | null; confidence?: number | null }) {
  return point.confidence_avg ?? point.average_confidence ?? point.confidence ?? null;
}

function pointObservationCount(point: { observations_count?: number | null; observations?: number | null; count?: number | null }) {
  return point.observations_count ?? point.observations ?? point.count ?? null;
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
          typeof pointOccupied(point) === 'number' && typeof pointCapacity(point) === 'number' && pointCapacity(point)! > 0
            ? (pointOccupied(point)! / pointCapacity(point)!) * 100
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
    const total = pointCapacity(point);
    const occupancy = normalizePercent(point.occupancy_percent) ?? (
      typeof pointOccupied(point) === 'number' && typeof total === 'number' && total > 0
        ? (pointOccupied(point)! / total) * 100
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

function forecastQualityToSeries(data: ForecastQualityResponse | undefined, zones: ParkingZone[]): ChartSeries[] {
  const points = data?.points ?? [];
  return [
    {
      key: 'quality-actual',
      label: 'Факт',
      color: CHART_COLORS[0],
      points: points.map(point => ({
        x: getPointTime(point),
        y: normalizePercent(point.actual_occupancy_percent),
        meta: {
          ...point,
          zone_label: getZoneLabel(point.zone_id ?? undefined, zones)
        }
      }))
    },
    {
      key: 'quality-predicted',
      label: 'Прогноз',
      color: CHART_COLORS[1],
      dashed: true,
      points: points.map(point => ({
        x: getPointTime(point),
        y: normalizePercent(point.predicted_occupancy_percent),
        meta: {
          ...point,
          zone_label: getZoneLabel(point.zone_id ?? undefined, zones)
        }
      }))
    }
  ];
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
    y: pointObservationCount(point),
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
      y: normalizePercent(pointConfidence(point)),
      meta: point as Record<string, unknown>
    }))
  }];
}

function makeAnalyticsQuery(filters: AnalyticsFilters, partnerId?: number): AnalyticsQuery {
  return {
    partner_id: partnerId,
    ...rangeForFilters(filters),
    granularity: filters.granularity,
    forecast_created_at: filters.forecastCreatedAt ? new Date(filters.forecastCreatedAt).toISOString() : undefined,
    zone_id: filters.selectedZoneIds[0],
    camera_id: filters.selectedZoneIds.length ? undefined : filters.selectedCameraIds[0]
  };
}

function makeLegacySeriesTargets(filters: AnalyticsFilters, zones: ParkingZone[], cameras: Camera[]) {
  if (filters.selectedZoneIds.length > 0) {
    return filters.selectedZoneIds.slice(0, MAX_VISIBLE_SERIES).map(zoneId => ({
      key: `zone-${zoneId}`,
      label: getZoneLabel(zoneId, zones),
      query: { zone_id: zoneId }
    }));
  }

  if (filters.selectedCameraIds.length > 0) {
    return filters.selectedCameraIds.slice(0, MAX_VISIBLE_SERIES).map(cameraId => ({
      key: `camera-${cameraId}`,
      label: getCameraLabel(Number(cameraId), cameras),
      query: { camera_id: cameraId }
    }));
  }

  return [{
    key: 'all',
    label: 'Все доступные зоны',
    query: {}
  }];
}

function legacyOccupancyToSeries(datasets?: LegacyOccupancyDataset[]): ChartSeries[] {
  return (datasets ?? []).map((dataset, index) => ({
    key: dataset.key,
    label: dataset.label,
    color: CHART_COLORS[index % CHART_COLORS.length],
    points: [...dataset.points].reverse().map(point => ({
      x: point.observed_at,
      y: point.capacity > 0 ? (point.occupied / point.capacity) * 100 : null,
      meta: point as unknown as Record<string, unknown>
    }))
  }));
}

function legacyForecastToSeries(occupancy?: LegacyOccupancyDataset[], forecast?: LegacyForecastDataset[]): ChartSeries[] {
  const factSeries = legacyOccupancyToSeries(occupancy).slice(0, MAX_VISIBLE_SERIES).map(series => ({
    ...series,
    label: `${series.label} · факт`
  }));

  const forecastSeries = (forecast ?? []).slice(0, MAX_VISIBLE_SERIES).map((dataset, index) => ({
    key: `forecast-${dataset.key}`,
    label: `${dataset.label} · прогноз`,
    color: CHART_COLORS[index % CHART_COLORS.length],
    dashed: true,
    points: [...dataset.points].map(point => ({
      x: point.predicted_for,
      y: point.capacity > 0 ? (point.predicted_occupied / point.capacity) * 100 : null,
      meta: point as unknown as Record<string, unknown>
    }))
  }));

  return [...factSeries, ...forecastSeries];
}

function legacyObservationsToBars(datasets?: LegacyOccupancyDataset[]): ChartPoint[] {
  const grouped = new Map<string, number>();
  (datasets ?? []).forEach(dataset => {
    dataset.points.forEach(point => {
      const bucket = point.observed_at;
      grouped.set(bucket, (grouped.get(bucket) ?? 0) + 1);
    });
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([x, y]) => ({ x, y }));
}

function legacyConfidenceToSeries(datasets?: LegacyOccupancyDataset[]): ChartSeries[] {
  return (datasets ?? []).map((dataset, index) => ({
    key: `confidence-${dataset.key}`,
    label: dataset.label,
    color: CHART_COLORS[index % CHART_COLORS.length],
    points: [...dataset.points].reverse().map(point => ({
      x: point.observed_at,
      y: normalizePercent(point.confidence),
      meta: point as unknown as Record<string, unknown>
    }))
  }));
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
    return <ZoneAnalyticsPage zoneId={route.zoneId} />;
  }
  if (route.view === 'camera') {
    return <CameraAnalyticsPage cameraId={route.cameraId} />;
  }
  if (route.view === 'detection') {
    return <DetectionAnalyticsPage detectionRunId={route.detectionRunId} />;
  }

  return <AnalyticsDashboard />;
}

function AnalyticsDashboard() {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const isAdmin = useSessionStore(state => state.isAdmin());
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
  const [forecastQuality, setForecastQuality] = useState<LoadState<ForecastQualityResponse>>(emptyState);

  const zoneItems = useMemo(() => zones.data ?? [], [zones.data]);
  const cameraItems = useMemo(() => cameras.data ?? [], [cameras.data]);
  const analyticsQuery = useMemo(
    () => makeAnalyticsQuery(filters, currentPartnerId),
    [filters, currentPartnerId]
  );

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) {
      setSummary({ loading: true });
      setFrequency({ loading: true });
      setConfidence({ loading: true });
      setHistory({ loading: true });
      setForecast({ loading: true });
      setObservations({ loading: true });
      setHealth({ loading: true });
      setForecastQuality({ loading: isAdmin });
    }

    const emptyForecast: AnalyticsForecast = {
      available: false,
      reason: 'select_zone',
      points: []
    };
    const [
      summaryResult,
      frequencyResult,
      confidenceResult,
      historyResult,
      forecastResult,
      observationsResult,
      healthResult,
      forecastQualityResult
    ] = await Promise.allSettled([
      api.analytics.summary(analyticsQuery),
      api.analytics.updateFrequency(analyticsQuery),
      api.analytics.confidence(analyticsQuery),
      api.analytics.occupancyHistory(analyticsQuery),
      analyticsQuery.zone_id ? api.analytics.occupancyForecast(analyticsQuery) : Promise.resolve(emptyForecast),
      api.analytics.observationsRate(analyticsQuery),
      api.analytics.detectorHealth(analyticsQuery),
      isAdmin ? api.analytics.forecastQuality(analyticsQuery) : Promise.resolve(undefined)
    ]);

    setSummary(summaryResult.status === 'fulfilled' ? { loading: false, data: summaryResult.value } : { loading: false, error: blockError(summaryResult.reason) });
    setFrequency(frequencyResult.status === 'fulfilled' ? { loading: false, data: frequencyResult.value } : { loading: false, error: blockError(frequencyResult.reason) });
    setConfidence(confidenceResult.status === 'fulfilled' ? { loading: false, data: confidenceResult.value } : { loading: false, error: blockError(confidenceResult.reason) });
    setHistory(historyResult.status === 'fulfilled' ? { loading: false, data: historyResult.value } : { loading: false, error: blockError(historyResult.reason) });
    setForecast(forecastResult.status === 'fulfilled' ? { loading: false, data: forecastResult.value } : { loading: false, error: blockError(forecastResult.reason) });
    setObservations(observationsResult.status === 'fulfilled' ? { loading: false, data: observationsResult.value } : { loading: false, error: blockError(observationsResult.reason) });
    setHealth(healthResult.status === 'fulfilled' ? { loading: false, data: healthResult.value } : { loading: false, error: blockError(healthResult.reason) });
    setForecastQuality(forecastQualityResult.status === 'fulfilled'
      ? { loading: false, data: forecastQualityResult.value }
      : { loading: false, error: blockError(forecastQualityResult.reason) });
  }, [analyticsQuery, isAdmin]);

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
    const intervalMs = AUTO_REFRESH_INTERVALS[filters.autoRefreshInterval];
    if (!intervalMs) return;
    const timer = window.setInterval(() => {
      loadDashboard(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [filters.autoRefreshInterval, loadDashboard]);

  const forecastSeries = useMemo(
    () => forecastToSeries(history.data, forecast.data, zoneItems),
    [history.data, forecast.data, zoneItems]
  );
  const confidenceSeries = useMemo(() => confidenceToSeries(confidence.data), [confidence.data]);
  const observationBars = useMemo(() => observationsToBars(observations.data), [observations.data]);
  const forecastQualitySeries = useMemo(() => forecastQualityToSeries(forecastQuality.data, zoneItems), [forecastQuality.data, zoneItems]);

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

      <Block title="KPI и агрегаты" state={{ loading: summary.loading || frequency.loading || confidence.loading, error: summary.error ?? frequency.error ?? confidence.error }}>
        <KpiGrid summary={summary} frequency={frequency} confidence={confidence} />
      </Block>

      <div className="analytics-dashboard-grid">
        <Block title="Карта зон и камер" state={{ loading: cameras.loading || zones.loading || health.loading, error: cameras.error ?? zones.error ?? health.error }}>
          <AnalyticsMap zones={zoneItems} cameras={cameraItems} summary={summary.data} health={health.data} />
        </Block>

        <Block title="Состояние зон" state={health}>
          <DetectorHealthTable items={health.data?.items ?? []} />
        </Block>
      </div>

      <div className="analytics-chart-grid">
        <Block title="Занятость и прогноз" state={{ loading: history.loading || forecast.loading, error: history.error ?? forecast.error }}>
          <LineChart
            series={forecastSeries}
            unit="%"
            granularity={filters.granularity}
            yLabel="Занятость, %"
            emptyMessage={analyticsQuery.zone_id ? 'Данные занятости и прогноза недоступны' : 'Нет данных занятости за выбранный период'}
          />
        </Block>

        <Block title="Количество наблюдений" state={observations}>
          <BarChart points={observationBars} granularity={filters.granularity} yLabel="Наблюдений" emptyMessage="Нет наблюдений за выбранный период" />
        </Block>

        <Block title="Уверенность модели" state={confidence}>
          <LineChart series={confidenceSeries} unit="%" granularity={filters.granularity} yLabel="Уверенность, %" emptyMessage="Нет данных по уверенности модели" />
        </Block>
      </div>

      {isAdmin && (
        <Block title="Качество прогнозов" state={forecastQuality}>
          <div className="details-grid analytics-detail-grid compact analytics-forecast-quality-metrics">
            <Detail label="MAE мест" value={formatNumber(forecastQuality.data?.metrics?.mae_occupied_count)} />
            <Detail label="MAE занятости" value={formatPercent(forecastQuality.data?.metrics?.mae_occupancy_percent)} />
            <Detail label="Bias занятости" value={formatPercent(forecastQuality.data?.metrics?.bias_occupancy_percent)} />
            <Detail label="Точек сравнения" value={formatNumber(forecastQuality.data?.metrics?.points_count)} />
          </div>
          <LineChart
            series={forecastQualitySeries}
            unit="%"
            granularity={filters.granularity}
            yLabel="Занятость, %"
            emptyMessage="Качество прогнозов недоступно за выбранный период"
          />
        </Block>
      )}
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
      <div className="analytics-toolbar">
        <div className="analytics-refresh-control">
          <Button type="button" variant="ghost" className="analytics-refresh-button" onClick={onRefresh} disabled={loading}>
            <span className="analytics-refresh-icon" aria-hidden="true">↻</span>
            <span>Обновить</span>
          </Button>
          <Select
            className="analytics-toolbar-select analytics-refresh-select"
            aria-label="Частота автообновления"
            title="Частота автообновления"
            value={filters.autoRefreshInterval}
            onChange={event => onChange(prev => ({ ...prev, autoRefreshInterval: event.target.value as AutoRefreshInterval }))}
          >
            <option value="off">Авто: выкл.</option>
            <option value="10s">Авто: 10 сек</option>
            <option value="30s">Авто: 30 сек</option>
            <option value="1m">Авто: 1 мин</option>
            <option value="5m">Авто: 5 мин</option>
            <option value="15m">Авто: 15 мин</option>
            <option value="30m">Авто: 30 мин</option>
            <option value="1h">Авто: 1 час</option>
          </Select>
        </div>

        <Select
          className="analytics-toolbar-select analytics-period-select"
          aria-label="Временной диапазон"
          title="Временной диапазон"
          value={filters.period}
          onChange={event => onChange(prev => ({ ...prev, period: event.target.value as PeriodPreset }))}
        >
          <option value="today">Период: сегодня</option>
          <option value="yesterday">Период: вчера</option>
          <option value="1h">Период: последний час</option>
          <option value="6h">Период: последние 6 часов</option>
          <option value="12h">Период: последние 12 часов</option>
          <option value="24h">Период: последние 24 часа</option>
          <option value="7d">Период: последние 7 дней</option>
          <option value="30d">Период: последние 30 дней</option>
          <option value="custom">Период: произвольный</option>
        </Select>

        <Select
          className="analytics-toolbar-select analytics-granularity-select"
          aria-label="Детализация графиков"
          title="Детализация графиков"
          value={filters.granularity}
          onChange={event => onChange(prev => ({ ...prev, granularity: event.target.value as AnalyticsGranularity }))}
        >
          <option value="5m">Детализация: 5 минут</option>
          <option value="15m">Детализация: 15 минут</option>
          <option value="1h">Детализация: 1 час</option>
          <option value="1d">Детализация: 1 день</option>
        </Select>

        <Field label="Срез прогноза">
          <Input
            className="analytics-forecast-cutoff"
            type="datetime-local"
            value={filters.forecastCreatedAt}
            onChange={event => onChange(prev => ({ ...prev, forecastCreatedAt: event.target.value }))}
            title="Пустое значение — последний доступный прогноз для каждой точки времени"
          />
        </Field>
      </div>

      {filters.period === 'custom' && (
        <div className="analytics-custom-range">
          <Field label="Начало периода">
            <Input type="datetime-local" value={filters.from} onChange={event => onChange(prev => ({ ...prev, from: event.target.value }))} />
          </Field>
          <Field label="Конец периода">
            <Input type="datetime-local" value={filters.to} onChange={event => onChange(prev => ({ ...prev, to: event.target.value }))} />
          </Field>
        </div>
      )}

      <div className="analytics-picker-grid">
        <MultiEntityPicker
          title="Парковочные зоны"
          search={filters.zoneSearch}
          onSearch={value => onChange(prev => ({ ...prev, zoneSearch: value }))}
          selectedIds={filters.selectedZoneIds}
          maxSelected={1}
          onSelectedIds={ids => onChange(prev => ({
            ...prev,
            selectedZoneIds: ids,
            selectedCameraIds: ids.length ? [] : prev.selectedCameraIds
          }))}
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
          maxSelected={1}
          onSelectedIds={ids => onChange(prev => ({
            ...prev,
            selectedZoneIds: ids.length ? [] : prev.selectedZoneIds,
            selectedCameraIds: ids
          }))}
          items={cameras.map(camera => ({
            id: String(camera.camera_id),
            label: `#${camera.camera_id} · ${camera.title}`,
            meta: camera.source
          }))}
          emptyMessage={cameraError ?? 'Камеры не найдены'}
        />
      </div>
      <div className="analytics-scope-hint">
        Фокус аналитики: все данные, одна зона или одна камера. Выбор зоны очищает камеру, выбор камеры очищает зону.
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
  maxSelected,
  onSearch,
  onSelectedIds
}: {
  title: string;
  search: string;
  selectedIds: string[];
  items: Array<{ id: string; label: string; meta?: string }>;
  emptyMessage: string;
  maxSelected?: number;
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
    if (checked && maxSelected === 1) {
      onSelectedIds([id]);
      return;
    }
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
      {maxSelected === 1 ? (
        <button type="button" className="analytics-clear-selection" onClick={() => onSelectedIds([])} disabled={!selectedIds.length}>
          Показать все
        </button>
      ) : (
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
      )}
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
  const summaryData = summary.data;
  const frequencyData = frequency.data;
  const confidenceData = confidence.data;
  const freshestUpdate = summaryData?.freshest_update_at ?? summaryData?.newest_update_at ?? frequencyData?.freshest_update_at ?? frequencyData?.newest_update_at;
  const oldestUpdate = summaryData?.oldest_update_at ?? frequencyData?.oldest_update_at;
  const cards = [
    { label: 'Активных зон', value: formatNumber(summaryData?.active_zones_count ?? summaryData?.active_zones) },
    { label: 'Всего мест', value: formatNumber(summaryData?.total_capacity) },
    { label: 'Занято сейчас', value: formatNumber(summaryData?.current_occupied_count ?? summaryData?.occupied_now) },
    { label: 'Свободно сейчас', value: formatNumber(summaryData?.current_free_count ?? summaryData?.free_now) },
    { label: 'Средняя занятость', value: formatPercent(summaryData?.avg_occupancy_percent ?? summaryData?.average_occupancy_percent) },
    { label: 'Самое свежее обновление', value: formatRelativeDateTime(freshestUpdate), exact: formatDateTime(freshestUpdate) },
    { label: 'Самое старое обновление', value: formatRelativeDateTime(oldestUpdate), exact: formatDateTime(oldestUpdate) },
    { label: 'Средняя частота', value: formatDuration(summaryData?.avg_update_interval_sec ?? frequencyData?.avg_update_interval_sec ?? frequencyData?.average_interval_seconds) },
    { label: 'Макс. интервал', value: formatDuration(summaryData?.max_update_interval_sec ?? frequencyData?.max_update_interval_sec ?? frequencyData?.max_interval_seconds) },
    { label: 'Уверенность модели', value: formatPercent(confidenceData?.avg_confidence ?? confidenceData?.average_confidence ?? summaryData?.avg_confidence ?? summaryData?.average_confidence) }
  ];

  return (
    <div className="metric-grid analytics-kpi-grid">
      {cards.map(card => (
        <div className="metric-card" key={card.label}>
          <div className="metric-label">{card.label}</div>
          <div className="metric-value">{summary.loading || frequency.loading || confidence.loading ? '...' : card.value}</div>
          {!summary.loading && !frequency.loading && !confidence.loading && card.exact && card.exact !== '—' && (
            <div className="analytics-kpi-exact">{card.exact}</div>
          )}
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

function LineChart({
  series,
  unit,
  emptyMessage,
  granularity,
  xLabel = 'Время',
  yLabel = unit ? `Значение, ${unit}` : 'Значение'
}: {
  series: ChartSeries[];
  unit?: string;
  emptyMessage: string;
  granularity?: AnalyticsGranularity;
  xLabel?: string;
  yLabel?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [tooltip, setTooltip] = useState<{
    key: string;
    x: number;
    y: number;
    boxX: number;
    boxY: number;
    width: number;
    height: number;
    lines: string[];
    color: string;
    pinned: boolean;
  } | undefined>();
  const visibleSeries = series
    .filter(item => !hidden.has(item.key))
    .map(item => ({ ...item, points: compactLinePoints(item.points, MAX_CHART_POINTS, granularity) }));
  const values = visibleSeries.flatMap(item => item.points.map(point => point.y).filter((value): value is number => typeof value === 'number'));
  const maxValue = unit === '%' ? Math.max(100, ...values) : Math.max(1, ...values);
  const minValue = unit === '%' ? 0 : Math.min(0, ...values);
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 20, bottom: 54, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const domain = chartTimeDomain(visibleSeries);
  const longestSeries = visibleSeries.reduce<ChartSeries | undefined>(
    (current, item) => !current || item.points.length > current.points.length ? item : current,
    undefined
  );
  const totalPointCount = visibleSeries.reduce((sum, item) => sum + item.points.length, 0);
  const showMarkers = totalPointCount <= MAX_MARKER_POINTS;

  useEffect(() => {
    setTooltip(undefined);
  }, [series, granularity, hidden]);

  if (!series.length || !series.some(item => item.points.length)) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const toX = (point: ChartPoint, pointIndex: number, total: number) => {
    const timestamp = parsePointTime(point.x);
    if (domain && timestamp !== null) {
      return padding.left + ((timestamp - domain.min) / (domain.max - domain.min)) * plotWidth;
    }
    if (total <= 1) return padding.left;
    return padding.left + (pointIndex / (total - 1)) * plotWidth;
  };
  const toY = (value: number | null) => {
    const safeValue = value ?? minValue;
    return height - padding.bottom - ((safeValue - minValue) / (maxValue - minValue || 1)) * plotHeight;
  };
  const yTicks = unit === '%'
    ? [0, 25, 50, 75, 100]
    : [minValue, minValue + (maxValue - minValue) / 2, maxValue];
  const xTicks = domain
    ? [
      { x: padding.left, label: formatAxisDateTime(domain.min) },
      { x: padding.left + plotWidth / 2, label: formatAxisDateTime(domain.min + (domain.max - domain.min) / 2) },
      { x: padding.left + plotWidth, label: formatAxisDateTime(domain.max) }
    ]
    : [0, 0.5, 1].map(position => {
      const points = longestSeries?.points ?? [];
      const index = points.length <= 1 ? 0 : Math.round(position * (points.length - 1));
      return {
        x: padding.left + position * plotWidth,
        label: points[index]?.x ? formatAxisDateTime(points[index].x) : ''
      };
    }).filter(tick => tick.label);
  const tooltipValue = (value: number) => {
    const digits = unit === '%' ? 1 : Math.abs(value) >= 10 ? 0 : 1;
    return `${value.toFixed(digits)}${unit ?? ''}`;
  };
  const pointTooltip = (item: ChartSeries, point: ChartPoint, index: number, pinned: boolean) => {
    if (point.y === null) return undefined;
    const pointX = toX(point, index, item.points.length);
    const pointY = toY(point.y);
    const lines = wrapTooltipLines(chartTooltipLines(item.label, point, tooltipValue(point.y)));
    const tooltipWidth = Math.min(230, Math.max(128, Math.max(...lines.map(line => line.length)) * 7.2 + 24));
    const tooltipHeight = Math.max(58, 22 + lines.length * 16);
    let boxX = pointX + 12;
    let boxY = pointY - tooltipHeight - 12;
    if (boxX + tooltipWidth > width - padding.right) boxX = pointX - tooltipWidth - 12;
    if (boxX < padding.left) boxX = padding.left;
    if (boxY < padding.top) boxY = pointY + 12;
    if (boxY + tooltipHeight > height - padding.bottom) boxY = height - padding.bottom - tooltipHeight;
    return {
      key: `${item.key}-${index}`,
      x: pointX,
      y: pointY,
      boxX,
      boxY,
      width: tooltipWidth,
      height: tooltipHeight,
      lines,
      color: item.color,
      pinned
    };
  };
  const showPointTooltip = (item: ChartSeries, point: ChartPoint, index: number, pinned = false) => {
    const next = pointTooltip(item, point, index, pinned);
    if (next) setTooltip(next);
  };

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} по оси ${xLabel}`} onClick={() => setTooltip(undefined)}>
        {yTicks.map((tick, index) => {
          const y = toY(tick);
          return (
            <g key={`y-${index}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-tick">
                {formatAxisNumber(tick, unit)}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="chart-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="chart-axis" />
        {visibleSeries.map(item => {
          const points = item.points
            .map((point, index) => point.y === null ? null : `${toX(point, index, item.points.length)},${toY(point.y)}`)
            .filter(Boolean)
            .join(' ');
          return (
            <polyline
              key={item.key}
              points={points}
              fill="none"
              stroke={item.color}
              strokeWidth="2.4"
              strokeDasharray={item.dashed ? '7 7' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {showMarkers && visibleSeries.map(item => item.points.map((point, index) => {
          if (point.y === null) return null;
          return (
            <circle key={`${item.key}-${index}`} cx={toX(point, index, item.points.length)} cy={toY(point.y)} r="3" fill={item.color} className="chart-point-marker">
              <title>{`${item.label}\n${formatDateTime(point.x)}\n${point.y.toFixed(1)}${unit ?? ''}`}</title>
            </circle>
          );
        }))}
        {visibleSeries.map(item => item.points.map((point, index) => {
          if (point.y === null) return null;
          const pointX = toX(point, index, item.points.length);
          const pointY = toY(point.y);
          return (
            <circle
              key={`hit-${item.key}-${index}`}
              cx={pointX}
              cy={pointY}
              r={showMarkers ? 9 : 7}
              fill="transparent"
              pointerEvents="all"
              tabIndex={0}
              role="button"
              aria-label={`${item.label}: ${formatAxisDateTime(point.x)}, ${tooltipValue(point.y)}`}
              className="chart-point-hit"
              onMouseEnter={() => showPointTooltip(item, point, index)}
              onFocus={() => showPointTooltip(item, point, index)}
              onClick={(event) => {
                event.stopPropagation();
                showPointTooltip(item, point, index, true);
              }}
              onMouseLeave={() => setTooltip(current => current?.pinned ? current : undefined)}
              onBlur={() => setTooltip(current => current?.pinned ? current : undefined)}
            />
          );
        }))}
        {xTicks.map((tick, index) => (
          <text key={`x-${index}`} x={tick.x} y={height - padding.bottom + 22} textAnchor="middle" className="chart-axis-tick">
            {tick.label}
          </text>
        ))}
        <text x={padding.left + plotWidth / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">
          {xLabel}
        </text>
        <text
          x={14}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${padding.top + plotHeight / 2})`}
          className="chart-axis-label"
        >
          {yLabel}
        </text>
        {tooltip && (
          <g className="chart-tooltip" pointerEvents="none">
            <line x1={tooltip.x} y1={padding.top} x2={tooltip.x} y2={height - padding.bottom} className="chart-tooltip-guide" />
            <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="#fff" stroke={tooltip.color} strokeWidth="3" />
            <g transform={`translate(${tooltip.boxX} ${tooltip.boxY})`}>
              <rect width={tooltip.width} height={tooltip.height} rx="4" />
              <text x="10" y="18">
                {tooltip.lines.map((line, index) => (
                  <tspan key={`${tooltip.key}-${index}`} x="10" dy={index === 0 ? 0 : 16} fontWeight={index === 0 ? 700 : 500}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          </g>
        )}
      </svg>
      {granularity && (
        <div className="chart-meta">Детализация: {GRANULARITY_LABELS[granularity]}</div>
      )}
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

function BarChart({
  points,
  emptyMessage,
  granularity,
  xLabel = 'Время',
  yLabel = 'Количество'
}: {
  points: ChartPoint[];
  emptyMessage: string;
  granularity?: AnalyticsGranularity;
  xLabel?: string;
  yLabel?: string;
}) {
  const chartPoints = compactBarPoints(points, MAX_CHART_POINTS, granularity);
  const values = chartPoints.map(point => point.y).filter((value): value is number => typeof value === 'number');
  const maxValue = Math.max(1, ...values);
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 20, bottom: 54, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (!points.length || !values.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  const barStep = plotWidth / chartPoints.length;
  const barWidth = Math.max(3, Math.min(18, barStep * 0.72));
  const yTicks = [0, maxValue / 2, maxValue];
  const xTicks = [0, 0.5, 1].map(position => {
    const index = chartPoints.length <= 1 ? 0 : Math.round(position * (chartPoints.length - 1));
    return {
      x: padding.left + position * plotWidth,
      label: chartPoints[index]?.x ? formatAxisDateTime(chartPoints[index].x) : ''
    };
  }).filter(tick => tick.label);

  return (
    <div className="analytics-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} по оси ${xLabel}`}>
        {yTicks.map((tick, index) => {
          const y = height - padding.bottom - (tick / maxValue) * plotHeight;
          return (
            <g key={`bar-y-${index}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-tick">
                {formatAxisNumber(tick)}
              </text>
            </g>
          );
        })}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="chart-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="chart-axis" />
        {chartPoints.map((point, index) => {
          const value = point.y ?? 0;
          const barHeight = (value / maxValue) * plotHeight;
          const x = padding.left + index * barStep + (barStep - barWidth) / 2;
          const y = height - padding.bottom - barHeight;
          return (
            <rect key={`${point.x}-${index}`} x={x} y={y} width={barWidth} height={barHeight} rx="4" fill="#128a45">
              <title>{`${formatDateTime(point.x)}\n${formatNumber(value)}`}</title>
            </rect>
          );
        })}
        {xTicks.map((tick, index) => (
          <text key={`bar-x-${index}`} x={tick.x} y={height - padding.bottom + 22} textAnchor="middle" className="chart-axis-tick">
            {tick.label}
          </text>
        ))}
        <text x={padding.left + plotWidth / 2} y={height - 8} textAnchor="middle" className="chart-axis-label">
          {xLabel}
        </text>
        <text
          x={14}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${padding.top + plotHeight / 2})`}
          className="chart-axis-label"
        >
          {yLabel}
        </text>
      </svg>
      {granularity && (
        <div className="chart-meta">Детализация: {GRANULARITY_LABELS[granularity]}</div>
      )}
    </div>
  );
}

function AnalyticsMap({
  zones,
  cameras,
  summary,
  health
}: {
  zones: ParkingZone[];
  cameras: Camera[];
  summary?: AnalyticsSummary;
  health?: AnalyticsDetectorHealth;
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
    const healthByZone = new Map((health?.items ?? []).map(item => [String(item.zone_id), item]));

    zones.forEach(zone => {
      const points = zoneMapPoints(zone);
      if (points.length < 3) return;
      boundsPoints.push(...points);
      const zoneSummary = summaryByZone.get(String(zone.id));
      const zoneHealth = healthByZone.get(String(zone.id));
      const capacity = zoneHealth?.capacity ?? zoneSummary?.capacity ?? zone.capacity;
      const occupied = zoneHealth?.occupied_count ?? zoneHealth?.occupied ?? zoneSummary?.occupied_count ?? zoneSummary?.occupied ?? zone.occupied;
      const free = zoneHealth?.free_count ?? zoneHealth?.free ?? zoneSummary?.free_count ?? zoneSummary?.free ?? zone.free_count;
      const occupancy = zoneHealth?.occupancy_percent ?? zoneSummary?.occupancy_percent ?? (
        typeof occupied === 'number' && typeof capacity === 'number' && capacity > 0 ? (occupied / capacity) * 100 : null
      );
      const lastUpdate = zoneHealth?.last_update_at ?? zoneSummary?.last_update_at ?? zone.occupancy_updated_at;
      const color = occupancyColor(occupancy, lastUpdate);
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
              ['Всего мест', formatNumber(capacity)],
              ['Занято', formatNumber(occupied)],
              ['Свободно', formatNumber(free)],
              ['Занятость', formatPercent(occupancy)],
              ['Последнее обновление', formatDateTime(lastUpdate)]
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
  }, [ymaps, map, zones, cameras, summary, health]);

  return (
    <div className="analytics-map-layout">
      <div className="analytics-map-details">
        {selected ?? <div className="empty-state">Выберите зону или камеру на карте.</div>}
      </div>
      <div className="analytics-map-host" ref={mapRef}>
        {loading && <div className="map-status-overlay">Загрузка Яндекс.Карт...</div>}
        {error && <div className="map-status-overlay error">{error}</div>}
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
    <div className="analytics-health-content">
      <div className="analytics-health-count">Показано зон: {items.length}</div>
      <div className="table-scroll analytics-health-table-wrap">
        <div className="table-header analytics-health-table">
          <span>Зона</span>
          <span>Камера</span>
          <span>Статус</span>
          <span>Всего</span>
          <span>Занято</span>
          <span>Свободно</span>
          <span>Занятость</span>
          <span>Уверенность модели</span>
          <span>Последнее обновление</span>
          <span>Возраст</span>
          <span>Средний интервал</span>
          <span>Макс. интервал</span>
        </div>
        <div className="table-list">
          {items.map(item => {
            const status = detectorStatus(item.status);
            return (
              <button
                type="button"
                key={String(item.zone_id)}
                className="table-row analytics-health-table contract-row-button"
                onClick={() => setAnalyticsRoute({ view: 'zone', zoneId: String(item.zone_id) })}
              >
                <span>#{String(item.zone_id)}</span>
                <span className="analytics-health-camera">
                  <strong>{item.camera_id ? `#${item.camera_id}` : '—'}</strong>
                  {item.camera_title && <span className="small">{item.camera_title}</span>}
                </span>
                <span><span className={`status-pill analytics-status-${status.key}`}>{status.label}</span></span>
                <span>{formatNumber(item.capacity)}</span>
                <span>{formatNumber(item.occupied_count ?? item.occupied)}</span>
                <span>{formatNumber(item.free_count ?? item.free)}</span>
                <span>{formatPercent(item.occupancy_percent)}</span>
                <span>{formatPercent(item.confidence_avg ?? item.confidence)}</span>
                <span>{formatDateTime(item.last_update_at)}</span>
                <span>{formatDuration(item.sec_ago ?? item.stale_seconds)}</span>
                <span>{formatDuration(item.avg_update_interval_sec ?? item.average_interval_seconds)}</span>
                <span>{formatDuration(item.max_update_interval_sec ?? item.max_interval_seconds)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatMs(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} мс`;
  return `${(value / 1000).toFixed(2)} сек`;
}

function zoneCapacity(zone?: ParkingZone, summary?: AnalyticsSummary) {
  if (!zone) return undefined;
  const zoneSummary = summary?.zones?.find(item => String(item.zone_id) === String(zone.id));
  return {
    capacity: zoneSummary?.capacity ?? summary?.total_capacity ?? zone.capacity,
    occupied: zoneSummary?.occupied_count ?? zoneSummary?.occupied ?? summary?.current_occupied_count ?? zone.occupied,
    free: zoneSummary?.free_count ?? zoneSummary?.free ?? summary?.current_free_count ?? zone.free_count,
    occupancy: zoneSummary?.occupancy_percent ?? summary?.avg_occupancy_percent ?? summary?.average_occupancy_percent,
    confidence: zoneSummary?.confidence_avg ?? zoneSummary?.confidence ?? summary?.avg_confidence ?? summary?.average_confidence ?? zone.confidence,
    lastUpdate: zoneSummary?.last_update_at ?? summary?.freshest_update_at ?? summary?.newest_update_at ?? zone.occupancy_updated_at,
    status: zoneSummary?.status ?? (zone.is_active === false ? 'inactive' : 'active')
  };
}

function zoneCoordinateRows(zone: ParkingZone) {
  const geometryPoints = zoneMapPoints(zone);
  if (geometryPoints.length) {
    return geometryPoints.map((point, index) => `#${index + 1}: ${point[0].toFixed(6)}, ${point[1].toFixed(6)}`);
  }
  return zone.points.map((point, index) => `#${index + 1}: ${point.latitude ?? '—'}, ${point.longitude ?? '—'}`);
}

function ZoneAnalyticsPage({ zoneId }: { zoneId: string }) {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const [zone, setZone] = useState<LoadState<ParkingZone>>(emptyState);
  const [summary, setSummary] = useState<LoadState<AnalyticsSummary>>(emptyState);
  const [history, setHistory] = useState<LoadState<AnalyticsHistory>>(emptyState);
  const [forecast, setForecast] = useState<LoadState<AnalyticsForecast>>(emptyState);
  const [confidence, setConfidence] = useState<LoadState<AnalyticsConfidence>>(emptyState);
  const [frequency, setFrequency] = useState<LoadState<AnalyticsUpdateFrequency>>(emptyState);
  const query = useMemo<AnalyticsQuery>(() => ({
    partner_id: currentPartnerId,
    zone_id: zoneId,
    ...rangeForFilters({ ...defaultFilters(), period: '7d' }),
    granularity: '1h'
  }), [currentPartnerId, zoneId]);

  useEffect(() => {
    let cancelled = false;
    setZone({ loading: true });
    setSummary({ loading: true });
    setHistory({ loading: true });
    setForecast({ loading: true });
    setConfidence({ loading: true });
    setFrequency({ loading: true });

    Promise.allSettled([
      api.getZone(zoneId),
      api.analytics.summary(query),
      api.analytics.occupancyHistory(query),
      api.analytics.occupancyForecast(query),
      api.analytics.confidence(query),
      api.analytics.updateFrequency(query)
    ]).then(results => {
      if (cancelled) return;
      const [zoneResult, summaryResult, historyResult, forecastResult, confidenceResult, frequencyResult] = results;
      setZone(zoneResult.status === 'fulfilled' ? { loading: false, data: zoneResult.value } : { loading: false, error: blockError(zoneResult.reason) });
      setSummary(summaryResult.status === 'fulfilled' ? { loading: false, data: summaryResult.value } : { loading: false, error: blockError(summaryResult.reason) });
      setHistory(historyResult.status === 'fulfilled' ? { loading: false, data: historyResult.value } : { loading: false, error: blockError(historyResult.reason) });
      setForecast(forecastResult.status === 'fulfilled' ? { loading: false, data: forecastResult.value } : { loading: false, error: blockError(forecastResult.reason) });
      setConfidence(confidenceResult.status === 'fulfilled' ? { loading: false, data: confidenceResult.value } : { loading: false, error: blockError(confidenceResult.reason) });
      setFrequency(frequencyResult.status === 'fulfilled' ? { loading: false, data: frequencyResult.value } : { loading: false, error: blockError(frequencyResult.reason) });
    });

    return () => {
      cancelled = true;
    };
  }, [zoneId, query]);

  const metrics = zoneCapacity(zone.data, summary.data);
  const zonesForLabels = zone.data ? [zone.data] : [];
  const occupancySeries = historyToOccupancySeries(history.data, zonesForLabels);
  const occupiedFreeSeries = useMemo<ChartSeries[]>(() => {
    const points = asItems(history.data).length
      ? asItems(history.data)
      : history.data?.series?.flatMap(series => series.points) ?? [];
    return [
      {
        key: 'occupied',
        label: 'Занято',
        color: '#dc2626',
        points: points.map(point => ({ x: getPointTime(point), y: pointOccupied(point), meta: point as Record<string, unknown> }))
      },
      {
        key: 'free',
        label: 'Свободно',
        color: '#128a45',
        points: points.map(point => ({ x: getPointTime(point), y: pointFree(point), meta: point as Record<string, unknown> }))
      }
    ];
  }, [history.data]);

  return (
    <section className="page-stack analytics-page">
      <div className="page-heading">
        <div>
          <h1>Аналитика зоны #{zoneId}</h1>
          <p>Занятость, прогноз, геометрия и качество данных по одной парковочной зоне</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setAnalyticsRoute({ view: 'dashboard' })}>Назад к аналитике</Button>
          {zone.data && <Button onClick={() => setAnalyticsRoute({ view: 'camera', cameraId: String(zone.data!.camera_id) })}>Открыть камеру</Button>}
        </div>
      </div>

      <Block title="Сводка зоны" state={zone}>
        {zone.data ? (
          <div className="details-grid analytics-detail-grid">
            <Detail label="ID зоны" value={`#${zone.data.id}`} />
            <Detail label="Камера" value={`#${zone.data.camera_id}`} />
            <Detail label="Всего мест" value={formatNumber(metrics?.capacity)} />
            <Detail label="Занято сейчас" value={formatNumber(metrics?.occupied)} />
            <Detail label="Свободно сейчас" value={formatNumber(metrics?.free)} />
            <Detail label="Занятость" value={formatPercent(metrics?.occupancy)} />
            <Detail label="Уверенность модели" value={formatPercent(metrics?.confidence)} />
            <Detail label="Последнее обновление" value={formatDateTime(metrics?.lastUpdate)} />
            <Detail label="Статус" value={formatStatus(metrics?.status)} />
          </div>
        ) : <div className="empty-state">Зона не найдена.</div>}
      </Block>

      <div className="analytics-dashboard-grid">
        <Block title="Карта зоны" state={zone}>
          {zone.data ? <ZoneGeometryPreview zone={zone.data} /> : <div className="empty-state">У зоны не задана геометрия.</div>}
        </Block>
        <Block title="Интервалы обновления" state={frequency}>
          <div className="details-grid analytics-detail-grid compact">
            <Detail label="Средний интервал" value={formatDuration(frequency.data?.avg_update_interval_sec ?? frequency.data?.average_interval_seconds)} />
            <Detail label="Максимальный интервал" value={formatDuration(frequency.data?.max_update_interval_sec ?? frequency.data?.max_interval_seconds)} />
            <Detail label="Самое свежее обновление" value={formatDateTime(frequency.data?.freshest_update_at ?? frequency.data?.newest_update_at)} />
            <Detail label="Самое старое обновление" value={formatDateTime(frequency.data?.oldest_update_at)} />
          </div>
        </Block>
      </div>

      <div className="analytics-chart-grid">
        <Block title="Занято / свободно" state={history}>
          <LineChart series={occupiedFreeSeries} yLabel="Мест" emptyMessage="Нет данных за выбранный период" />
        </Block>
        <Block title="Занятость, %" state={history}>
          <LineChart series={occupancySeries} unit="%" yLabel="Занятость, %" emptyMessage="Нет данных за выбранный период" />
        </Block>
        <Block title="Прогноз занятости" state={forecast}>
          <LineChart series={forecastToSeries(history.data, forecast.data, zonesForLabels)} unit="%" yLabel="Занятость, %" emptyMessage="Прогноз недоступен" />
        </Block>
        <Block title="Уверенность модели" state={confidence}>
          <LineChart series={confidenceToSeries(confidence.data)} unit="%" yLabel="Уверенность, %" emptyMessage="Нет данных по уверенности модели" />
        </Block>
      </div>
    </section>
  );
}

function ZoneGeometryPreview({ zone }: { zone: ParkingZone }) {
  const points = zoneMapPoints(zone);
  return (
    <div className="analytics-zone-geometry">
      {points.length >= 3 ? (
        <AnalyticsMap zones={[zone]} cameras={[]} summary={{ zones: [{ zone_id: zone.id, occupancy_percent: zone.occupied && zone.capacity ? zone.occupied / zone.capacity : null }] }} />
      ) : (
        <div className="empty-state">У зоны не задана геометрия.</div>
      )}
      <div className="analytics-coordinate-list">
        {zoneCoordinateRows(zone).map(row => <span key={row}>{row}</span>)}
      </div>
    </div>
  );
}

function CameraAnalyticsPage({ cameraId }: { cameraId: string }) {
  const currentPartnerId = useSessionStore(state => state.currentPartnerId);
  const setLabelerReturnRoute = useStore(state => state.setLabelerReturnRoute);
  const setLabelerCamera = useStore(state => state.setCamera);
  const loadCameraMeta = useStore(state => state.loadCameraMeta);
  const loadZones = useStore(state => state.loadZones);
  const setViewMode = useStore(state => state.setViewMode);
  const numericCameraId = Number(cameraId);
  const [camera, setCamera] = useState<LoadState<Camera>>(emptyState);
  const [zones, setZones] = useState<LoadState<ParkingZone[]>>(emptyState);
  const [health, setHealth] = useState<LoadState<AnalyticsDetectorHealth>>(emptyState);
  const [frequency, setFrequency] = useState<LoadState<AnalyticsUpdateFrequency>>(emptyState);
  const [confidence, setConfidence] = useState<LoadState<AnalyticsConfidence>>(emptyState);
  const [observations, setObservations] = useState<LoadState<AnalyticsObservationsRate>>(emptyState);
  const [detections, setDetections] = useState<LoadState<DetectionRunList>>(emptyState);
  const query = useMemo<AnalyticsQuery>(() => ({
    partner_id: currentPartnerId,
    camera_id: cameraId,
    ...rangeForFilters({ ...defaultFilters(), period: '7d' }),
    granularity: '1h',
    limit: 20
  }), [currentPartnerId, cameraId]);

  useEffect(() => {
    let cancelled = false;
    setCamera({ loading: true });
    setZones({ loading: true });
    setHealth({ loading: true });
    setFrequency({ loading: true });
    setConfidence({ loading: true });
    setObservations({ loading: true });
    setDetections({ loading: true });

    Promise.allSettled([
      api.getCamera(numericCameraId),
      api.listZones({ camera_id: numericCameraId, partner_id: currentPartnerId }),
      api.analytics.detectorHealth(query),
      api.analytics.updateFrequency(query),
      api.analytics.confidence(query),
      api.analytics.observationsRate(query),
      api.analytics.cameraDetections(numericCameraId, query)
    ]).then(results => {
      if (cancelled) return;
      const [cameraResult, zonesResult, healthResult, frequencyResult, confidenceResult, observationsResult, detectionsResult] = results;
      setCamera(cameraResult.status === 'fulfilled' ? { loading: false, data: cameraResult.value } : { loading: false, error: blockError(cameraResult.reason) });
      setZones(zonesResult.status === 'fulfilled' ? { loading: false, data: zonesResult.value } : { loading: false, error: blockError(zonesResult.reason) });
      setHealth(healthResult.status === 'fulfilled' ? { loading: false, data: healthResult.value } : { loading: false, error: blockError(healthResult.reason) });
      setFrequency(frequencyResult.status === 'fulfilled' ? { loading: false, data: frequencyResult.value } : { loading: false, error: blockError(frequencyResult.reason) });
      setConfidence(confidenceResult.status === 'fulfilled' ? { loading: false, data: confidenceResult.value } : { loading: false, error: blockError(confidenceResult.reason) });
      setObservations(observationsResult.status === 'fulfilled' ? { loading: false, data: observationsResult.value } : { loading: false, error: blockError(observationsResult.reason) });
      setDetections(detectionsResult.status === 'fulfilled' ? { loading: false, data: detectionsResult.value } : { loading: false, error: blockError(detectionsResult.reason) });
    });

    return () => {
      cancelled = true;
    };
  }, [numericCameraId, currentPartnerId, query]);

  function openCameraAdmin() {
    navigate('cameras');
  }

  function openCameraLabeler() {
    setLabelerReturnRoute('cameras');
    setLabelerCamera(String(numericCameraId));
    loadCameraMeta(numericCameraId);
    loadZones();
    setViewMode('labeler');
    navigate('labeler');
  }

  return (
    <section className="page-stack analytics-page">
      <div className="page-heading">
        <div>
          <h1>Аналитика камеры #{cameraId}</h1>
          <p>Снимки, наблюдения, интервалы обновления и здоровье связанных зон</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setAnalyticsRoute({ view: 'dashboard' })}>Назад к аналитике</Button>
          <Button variant="ghost" onClick={openCameraAdmin}>Открыть камеру</Button>
          <Button onClick={openCameraLabeler}>Открыть разметку</Button>
        </div>
      </div>

      <Block title="Сводка камеры" state={camera}>
        {camera.data ? (
          <div className="details-grid analytics-detail-grid">
            <Detail label="ID и название" value={`#${camera.data.camera_id} · ${camera.data.title}`} />
            <Detail label="Источник" value={camera.data.source} />
            <Detail label="Статус" value={camera.data.is_active === false ? 'Неактивна' : 'Активна'} />
            <Detail label="Координаты" value={hasCoordinates(camera.data.latitude, camera.data.longitude) ? `${camera.data.latitude.toFixed(6)}, ${camera.data.longitude.toFixed(6)}` : '—'} />
            <Detail label="Связанных зон" value={zones.data?.length ?? '—'} />
            <Detail label="Последнее обновление" value={formatDateTime(frequency.data?.freshest_update_at ?? frequency.data?.newest_update_at ?? camera.data.updated_at)} />
            <Detail label="Средний интервал" value={formatDuration(frequency.data?.avg_update_interval_sec ?? frequency.data?.average_interval_seconds)} />
            <Detail label="Уверенность модели" value={formatPercent(confidence.data?.avg_confidence ?? confidence.data?.average_confidence)} />
          </div>
        ) : <div className="empty-state">Камера не найдена.</div>}
      </Block>

      <Block title="Снимки камеры" state={camera}>
        <CameraSnapshots cameraId={numericCameraId} />
      </Block>

      <div className="analytics-chart-grid">
        <Block title="Количество наблюдений" state={observations}>
          <BarChart points={observationsToBars(observations.data)} yLabel="Наблюдений" emptyMessage="Нет наблюдений по камере" />
        </Block>
        <Block title="Уверенность модели" state={confidence}>
          <LineChart series={confidenceToSeries(confidence.data)} unit="%" yLabel="Уверенность, %" emptyMessage="Нет данных по уверенности модели" />
        </Block>
        <Block title="Интервалы обновлений" state={frequency}>
          <BarChart
            points={[
              { x: 'Средний', y: frequency.data?.avg_update_interval_sec ?? frequency.data?.average_interval_seconds ?? null },
              { x: 'Максимальный', y: frequency.data?.max_update_interval_sec ?? frequency.data?.max_interval_seconds ?? null }
            ]}
            xLabel="Метрика"
            yLabel="Секунды"
            emptyMessage="Интервалы обновления недоступны"
          />
        </Block>
        <Block title="Здоровье зон камеры" state={health}>
          <DetectorHealthTable items={health.data?.items ?? []} />
        </Block>
      </div>

      <Block title="Последние распознавания" state={detections}>
        <DetectionsTable detections={detections.data?.items ?? []} />
      </Block>
    </section>
  );
}

function CameraSnapshots({ cameraId }: { cameraId: number }) {
  const [tab, setTab] = useState<'snapshot' | 'raw' | 'annotated'>('snapshot');
  const [snapshot, setSnapshot] = useState<LoadState<{ image_url: string; captured_at?: string }>>(emptyState);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | undefined>();
  const options = tab === 'annotated' ? { annotated: true, fallback_to_raw: true } : { annotated: false, fallback_to_raw: true };

  const load = useCallback(async () => {
    setSnapshot({ loading: true });
    try {
      const result = await api.getSnapshot(cameraId, options);
      setSnapshot({ loading: false, data: result });
    } catch (error) {
      setSnapshot({ loading: false, error: blockError(error) });
    }
  }, [cameraId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="analytics-snapshot-block">
      <div className="segmented">
        <button type="button" className={tab === 'snapshot' ? 'active' : ''} onClick={() => setTab('snapshot')}>Последний снимок</button>
        <button type="button" className={tab === 'raw' ? 'active' : ''} onClick={() => setTab('raw')}>Последнее распознавание</button>
        <button type="button" className={tab === 'annotated' ? 'active' : ''} onClick={() => setTab('annotated')}>С разметкой</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="small">Снято: {formatDateTime(snapshot.data?.captured_at)}</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={load} disabled={snapshot.loading}>{snapshot.loading ? 'Загрузка...' : 'Обновить'}</Button>
          <Button variant="ghost" onClick={() => snapshot.data?.image_url && setFullscreenUrl(snapshot.data.image_url)} disabled={!snapshot.data?.image_url}>На весь экран</Button>
        </div>
      </div>
      {snapshot.error && <div className="notice error">Снимок недоступен: {snapshot.error}</div>}
      {snapshot.data?.image_url ? (
        <img className="analytics-snapshot" src={snapshot.data.image_url} alt="Снимок камеры" />
      ) : !snapshot.loading && !snapshot.error ? (
        <div className="empty-state">Снимок недоступен</div>
      ) : null}
      {fullscreenUrl && (
        <div className="fullscreen-preview" role="dialog">
          <button type="button" className="fullscreen-close" onClick={() => setFullscreenUrl(undefined)}>×</button>
          <img src={fullscreenUrl} alt="Снимок камеры" />
        </div>
      )}
    </div>
  );
}

function DetectionsTable({ detections }: { detections: DetectionRunList['items'] }) {
  if (!detections.length) {
    return <div className="empty-state">Распознавания не найдены.</div>;
  }

  return (
    <div className="table-scroll">
      <div className="table-header analytics-detections-table">
        <span>Время</span>
        <span>Статус</span>
        <span>Обработка</span>
        <span>Машин</span>
        <span>Занято</span>
        <span>Свободно</span>
        <span>Уверенность модели</span>
        <span>Оценка</span>
        <span></span>
      </div>
      <div className="table-list">
        {detections.map(item => (
          <button
            type="button"
            key={String(item.detection_run_id)}
            className="table-row analytics-detections-table contract-row-button"
            onClick={() => setAnalyticsRoute({ view: 'detection', detectionRunId: String(item.detection_run_id) })}
          >
            <span>{formatDateTime(item.started_at)}</span>
            <span>{item.status ?? '—'}</span>
            <span>{formatMs(item.processing_time_ms)}</span>
            <span>{formatNumber(item.detected_cars_count ?? item.cars_detected)}</span>
            <span>{formatNumber(item.occupied_count ?? item.occupied)}</span>
            <span>{formatNumber(item.free_count ?? item.free)}</span>
            <span>{formatPercent(item.confidence_avg ?? item.confidence)}</span>
            <span>{item.has_feedback ? 'Да' : 'Нет'}</span>
            <span>Открыть</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetectionAnalyticsPage({ detectionRunId }: { detectionRunId: string }) {
  const isAdmin = useSessionStore(state => state.isAdmin());
  const notifySuccess = useFeedbackStore(state => state.success);
  const [detail, setDetail] = useState<LoadState<DetectionRunDetail>>(emptyState);
  const [feedback, setFeedback] = useState<LoadState<{ items: DetectionFeedback[] }>>(emptyState);
  const [selectedFeedback, setSelectedFeedback] = useState<LoadState<DetectionFeedback>>(emptyState);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setDetail({ loading: true });
    setFeedback({ loading: isAdmin });
    try {
      const nextDetail = await api.analytics.detection(detectionRunId);
      setDetail({ loading: false, data: nextDetail });
    } catch (error) {
      setDetail({ loading: false, error: blockError(error) });
    }

    if (isAdmin) {
      try {
        const nextFeedback = await api.analytics.detectionFeedback(detectionRunId);
        setFeedback({ loading: false, data: nextFeedback });
      } catch (error) {
        setFeedback({ loading: false, error: blockError(error) });
      }
    }
  }, [detectionRunId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveFeedback(data: {
    rating: DetectionFeedbackRating;
    expected_occupied_count?: number | null;
    expected_free_count?: number | null;
    error_type?: DetectionFeedbackErrorType | null;
    comment?: string | null;
  }) {
    setSaving(true);
    try {
      await api.analytics.createDetectionFeedback(detectionRunId, data);
      notifySuccess('Оценка сохранена.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function openFeedback(feedbackId?: number | string) {
    if (!feedbackId) return;
    setSelectedFeedback({ loading: true });
    try {
      const next = await api.analytics.detectionFeedbackDetail(detectionRunId, feedbackId);
      setSelectedFeedback({ loading: false, data: next });
    } catch (error) {
      setSelectedFeedback({ loading: false, error: blockError(error) });
    }
  }

  const item = detail.data;

  return (
    <section className="page-stack analytics-page">
      <div className="page-heading">
        <div>
          <h1>Распознавание #{detectionRunId}</h1>
          <p>Просмотр запуска detector-а и оценка качества распознавания</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setAnalyticsRoute({ view: 'dashboard' })}>Назад к аналитике</Button>
          {item?.camera_id && <Button onClick={() => setAnalyticsRoute({ view: 'camera', cameraId: String(item.camera_id) })}>К камере</Button>}
        </div>
      </div>

      <Block title="Информация о распознавании" state={detail}>
        {item ? (
          <div className="details-grid analytics-detail-grid">
            <Detail label="ID распознавания" value={`#${item.detection_run_id}`} />
            <Detail label="Камера" value={`#${item.camera_id}`} />
            <Detail label="Зона" value={item.zone_id ? `#${item.zone_id}` : '—'} />
            <Detail label="Начало" value={formatDateTime(item.started_at)} />
            <Detail label="Завершение" value={formatDateTime(item.finished_at)} />
            <Detail label="Статус" value={item.status ?? '—'} />
            <Detail label="Время обработки" value={formatMs(item.processing_time_ms)} />
            <Detail label="Версия модели" value={item.model_version ?? '—'} />
            <Detail label="Машин найдено" value={formatNumber(item.detected_cars_count ?? item.cars_detected)} />
            <Detail label="Занято" value={formatNumber(item.occupied_count ?? item.occupied)} />
            <Detail label="Свободно" value={formatNumber(item.free_count ?? item.free)} />
            <Detail label="Всего мест" value={formatNumber(item.capacity ?? item.total)} />
            <Detail label="Уверенность модели" value={formatPercent(item.confidence_avg ?? item.confidence)} />
            <Detail label="Ошибка" value={item.error_message ?? item.error_code ?? item.error ?? '—'} />
          </div>
        ) : <div className="empty-state">Распознавание не найдено.</div>}
      </Block>

      {item && (
        <Block title="Сравнение изображений" state={detail}>
          <div className="analytics-image-compare">
            <DetectionImage title="Исходное изображение" url={item.raw_snapshot_url ?? item.raw_image_url} />
            <DetectionImage title="Изображение с разметкой" url={item.annotated_snapshot_url ?? item.annotated_image_url} />
          </div>
        </Block>
      )}

      {item && (
        <Block title="Оценка качества распознавания" state={detail}>
          {item.feedback && <FeedbackSummary feedback={item.feedback} />}
          <DetectionFeedbackForm saving={saving} onSubmit={saveFeedback} />
        </Block>
      )}

      {isAdmin && (
        <Block title="История оценок качества" state={feedback}>
          <FeedbackHistory
            items={feedback.data?.items ?? []}
            selected={selectedFeedback}
            onOpen={openFeedback}
          />
        </Block>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-card">
      <div className="metric-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

function DetectionImage({ title, url }: { title: string; url?: string | null }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <div className="analytics-detection-image">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3>{title}</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="ghost" disabled={!url} onClick={() => setFullscreen(true)}>На весь экран</Button>
          <Button variant="ghost" disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}>В новой вкладке</Button>
        </div>
      </div>
      {url ? <img src={url} alt={title} /> : <div className="empty-state">Изображение недоступно</div>}
      {fullscreen && url && (
        <div className="fullscreen-preview" role="dialog">
          <button type="button" className="fullscreen-close" onClick={() => setFullscreen(false)}>×</button>
          <img src={url} alt={title} />
        </div>
      )}
    </div>
  );
}

function DetectionFeedbackForm({
  saving,
  onSubmit
}: {
  saving: boolean;
  onSubmit: (data: {
    rating: DetectionFeedbackRating;
    expected_occupied_count?: number | null;
    expected_free_count?: number | null;
    error_type?: DetectionFeedbackErrorType | null;
    comment?: string | null;
  }) => Promise<void>;
}) {
  const [rating, setRating] = useState<DetectionFeedbackRating>('correct');
  const [correctOccupied, setCorrectOccupied] = useState('');
  const [correctFree, setCorrectFree] = useState('');
  const [errorType, setErrorType] = useState<DetectionFeedbackErrorType | ''>('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await onSubmit({
        rating,
        expected_occupied_count: correctOccupied ? Number(correctOccupied) : null,
        expected_free_count: correctFree ? Number(correctFree) : null,
        error_type: errorType || null,
        comment: comment.trim() || null
      });
      setComment('');
    } catch (submitError) {
      setError(blockError(submitError));
    }
  }

  return (
    <form className="analytics-feedback-form" onSubmit={submit}>
      <Field label="Оценка">
        <Select value={rating} onChange={event => setRating(event.target.value as DetectionFeedbackRating)}>
          <option value="correct">Корректно</option>
          <option value="partially_correct">Частично корректно</option>
          <option value="incorrect">Некорректно</option>
        </Select>
      </Field>
      <Field label="Правильно занято">
        <Input type="number" min={0} value={correctOccupied} onChange={event => setCorrectOccupied(event.target.value)} />
      </Field>
      <Field label="Правильно свободно">
        <Input type="number" min={0} value={correctFree} onChange={event => setCorrectFree(event.target.value)} />
      </Field>
      <Field label="Тип ошибки">
        <Select value={errorType} onChange={event => setErrorType(event.target.value as DetectionFeedbackErrorType | '')}>
          <option value="">Не задан</option>
          <option value="false_positive_car">Лишняя машина</option>
          <option value="false_negative_car">Машина не найдена</option>
          <option value="wrong_zone_assignment">Машина не в той зоне</option>
          <option value="bad_lighting">Плохое освещение</option>
          <option value="bad_camera_angle">Плохой ракурс</option>
          <option value="calibration_problem">Проблема калибровки</option>
          <option value="other">Другое</option>
        </Select>
      </Field>
      <Field label="Комментарий">
        <textarea className="input" value={comment} onChange={event => setComment(event.target.value)} rows={4} />
      </Field>
      {error && <div className="notice error">{error}</div>}
      <Button type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить оценку'}</Button>
    </form>
  );
}

function FeedbackSummary({ feedback }: { feedback: DetectionFeedback }) {
  return (
    <div className="notice">
      Уже есть оценка: {feedback.rating ?? '—'}
      {feedback.error_type ? ` · ${feedback.error_type}` : ''}
      {feedback.comment ? ` · ${feedback.comment}` : ''}
    </div>
  );
}

function FeedbackHistory({
  items,
  selected,
  onOpen
}: {
  items: DetectionFeedback[];
  selected: LoadState<DetectionFeedback>;
  onOpen: (feedbackId?: number | string) => void;
}) {
  if (!items.length) {
    return <div className="empty-state">Для данного распознавания ещё нет оценок качества.</div>;
  }

  return (
    <div className="analytics-feedback-history">
      <div className="table-scroll">
        <div className="table-header analytics-feedback-table">
          <span>Дата</span>
          <span>Пользователь</span>
          <span>Оценка</span>
          <span>Занято</span>
          <span>Свободно</span>
          <span>Ошибка</span>
          <span>Комментарий</span>
        </div>
        <div className="table-list">
          {items.map(item => (
            <button
              type="button"
              key={String(item.feedback_id)}
              className="table-row analytics-feedback-table contract-row-button"
              onClick={() => onOpen(item.feedback_id)}
            >
              <span>{formatDateTime(item.created_at)}</span>
              <span>{item.created_by_email ?? item.user_email ?? item.created_by_user_id ?? item.user_id ?? '—'}</span>
              <span>{item.rating ?? '—'}</span>
              <span>{formatNumber(item.expected_occupied_count ?? item.correct_occupied)}</span>
              <span>{formatNumber(item.expected_free_count ?? item.correct_free)}</span>
              <span>{item.error_type ?? '—'}</span>
              <span>{item.comment ?? '—'}</span>
            </button>
          ))}
        </div>
      </div>
      {selected.loading && <div className="small">Загрузка оценки...</div>}
      {selected.error && <div className="notice error">{selected.error}</div>}
      {selected.data && (
        <div className="analytics-feedback-detail">
          <h3>Подробная оценка</h3>
          <div className="details-grid analytics-detail-grid compact">
            <Detail label="Автор" value={selected.data.created_by_email ?? selected.data.user_email ?? selected.data.created_by_user_id ?? selected.data.user_id ?? '—'} />
            <Detail label="Создано" value={formatDateTime(selected.data.created_at)} />
            <Detail label="Обновлено" value={formatDateTime(selected.data.updated_at)} />
            <Detail label="Оценка" value={selected.data.rating ?? '—'} />
            <Detail label="Правильно занято" value={formatNumber(selected.data.expected_occupied_count ?? selected.data.correct_occupied)} />
            <Detail label="Правильно свободно" value={formatNumber(selected.data.expected_free_count ?? selected.data.correct_free)} />
            <Detail label="Тип ошибки" value={selected.data.error_type ?? '—'} />
            <Detail label="Комментарий" value={selected.data.comment ?? '—'} />
          </div>
        </div>
      )}
    </div>
  );
}
