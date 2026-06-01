import { buildQuery, request } from './http';

export type AnalyticsGranularity = '5m' | '15m' | '1h' | '1d';

export type AnalyticsRange = {
  from?: string;
  to?: string;
};

export type AnalyticsQuery = AnalyticsRange & {
  partner_id?: number;
  zone_ids?: Array<number | string>;
  camera_ids?: Array<number | string>;
  granularity?: AnalyticsGranularity;
  forecast_created_at?: string;
  top?: number;
  offset?: number;
};

export type AnalyticsSummary = {
  active_zones?: number | null;
  total_capacity?: number | null;
  occupied_now?: number | null;
  free_now?: number | null;
  average_occupancy_percent?: number | null;
  newest_update_at?: string | null;
  oldest_update_at?: string | null;
  average_confidence?: number | null;
  zones?: AnalyticsZoneSummary[];
  cameras?: AnalyticsCameraSummary[];
};

export type AnalyticsZoneSummary = {
  zone_id: number | string;
  camera_id?: number | null;
  capacity?: number | null;
  occupied?: number | null;
  free?: number | null;
  occupancy_percent?: number | null;
  confidence?: number | null;
  last_update_at?: string | null;
  status?: AnalyticsDetectorStatus | string | null;
};

export type AnalyticsCameraSummary = {
  camera_id: number;
  title?: string | null;
  status?: string | null;
  last_update_at?: string | null;
  confidence?: number | null;
};

export type AnalyticsUpdateFrequency = {
  average_interval_seconds?: number | null;
  max_interval_seconds?: number | null;
  newest_update_at?: string | null;
  oldest_update_at?: string | null;
  items?: AnalyticsUpdateFrequencyItem[];
};

export type AnalyticsUpdateFrequencyItem = {
  zone_id?: number | string | null;
  camera_id?: number | null;
  average_interval_seconds?: number | null;
  max_interval_seconds?: number | null;
  newest_update_at?: string | null;
  oldest_update_at?: string | null;
};

export type AnalyticsConfidence = {
  average_confidence?: number | null;
  points?: AnalyticsConfidencePoint[];
  items?: AnalyticsConfidencePoint[];
};

export type AnalyticsConfidencePoint = {
  ts?: string;
  timestamp?: string;
  zone_id?: number | string | null;
  camera_id?: number | null;
  confidence?: number | null;
  average_confidence?: number | null;
  observations?: number | null;
};

export type AnalyticsHistory = {
  series?: AnalyticsSeries[];
  points?: AnalyticsHistoryPoint[];
  items?: AnalyticsHistoryPoint[];
};

export type AnalyticsSeries = {
  id?: number | string;
  zone_id?: number | string;
  camera_id?: number;
  label?: string;
  points: AnalyticsHistoryPoint[];
};

export type AnalyticsHistoryPoint = {
  ts?: string;
  timestamp?: string;
  zone_id?: number | string | null;
  camera_id?: number | null;
  occupied?: number | null;
  free?: number | null;
  total?: number | null;
  capacity?: number | null;
  occupancy_percent?: number | null;
  confidence?: number | null;
  observations?: number | null;
};

export type AnalyticsForecast = {
  series?: AnalyticsSeries[];
  points?: AnalyticsForecastPoint[];
  items?: AnalyticsForecastPoint[];
};

export type AnalyticsForecastPoint = AnalyticsHistoryPoint & {
  forecast_created_at?: string | null;
  predicted_occupied?: number | null;
  predicted_free?: number | null;
  predicted_occupancy_percent?: number | null;
};

export type AnalyticsObservationsRate = {
  points?: AnalyticsObservationPoint[];
  items?: AnalyticsObservationPoint[];
};

export type AnalyticsObservationPoint = {
  ts?: string;
  timestamp?: string;
  zone_id?: number | string | null;
  camera_id?: number | null;
  observations?: number | null;
  count?: number | null;
};

export type AnalyticsDetectorStatus =
  | 'online'
  | 'stale'
  | 'offline'
  | 'no_data'
  | 'low_confidence';

export type AnalyticsDetectorHealth = {
  items: AnalyticsDetectorHealthItem[];
  total?: number;
};

export type AnalyticsDetectorHealthItem = {
  zone_id: number | string;
  camera_id?: number | null;
  capacity?: number | null;
  occupied?: number | null;
  free?: number | null;
  occupancy_percent?: number | null;
  confidence?: number | null;
  last_update_at?: string | null;
  stale_seconds?: number | null;
  average_interval_seconds?: number | null;
  max_interval_seconds?: number | null;
  status?: AnalyticsDetectorStatus | string | null;
};

export type DetectionRunList = {
  items: DetectionRunListItem[];
  total?: number;
};

export type DetectionRunListItem = {
  detection_run_id: number | string;
  camera_id: number;
  zone_id?: number | string | null;
  started_at?: string | null;
  finished_at?: string | null;
  status?: string | null;
  processing_time_ms?: number | null;
  cars_detected?: number | null;
  occupied?: number | null;
  free?: number | null;
  confidence?: number | null;
  has_feedback?: boolean | null;
};

export type DetectionRunDetail = DetectionRunListItem & {
  model_version?: string | null;
  total?: number | null;
  error?: string | null;
  raw_image_url?: string | null;
  annotated_image_url?: string | null;
  feedback?: DetectionFeedback | null;
};

export type DetectionFeedbackRating = 'correct' | 'partially_correct' | 'incorrect';

export type DetectionFeedbackErrorType =
  | 'extra_car'
  | 'missing_car'
  | 'wrong_zone'
  | 'bad_lighting'
  | 'bad_angle'
  | 'calibration_issue'
  | 'other';

export type DetectionFeedback = {
  feedback_id?: number | string;
  created_at?: string | null;
  updated_at?: string | null;
  user_id?: number | null;
  user_email?: string | null;
  rating?: DetectionFeedbackRating | string | null;
  correct_occupied?: number | null;
  correct_free?: number | null;
  error_type?: DetectionFeedbackErrorType | string | null;
  comment?: string | null;
  history?: unknown[];
};

export type DetectionFeedbackRequest = {
  rating: DetectionFeedbackRating;
  correct_occupied?: number | null;
  correct_free?: number | null;
  error_type?: DetectionFeedbackErrorType | null;
  comment?: string | null;
};

export type DetectionFeedbackList = {
  items: DetectionFeedback[];
  total?: number;
};

export type LegacyOccupancySeriesPoint = {
  observed_at: string;
  occupied: number;
  free_count: number;
  capacity: number;
  confidence: number;
  confidence_level?: string | null;
  source_type?: string | null;
};

export type LegacyForecastSeriesPoint = {
  predicted_for: string;
  predicted_occupied: number;
  predicted_free_count: number;
  capacity: number;
  probability_free_space: number;
  confidence: number;
  confidence_level?: string | null;
  model_type?: string | null;
  generated_at?: string | null;
};

export type LegacySeriesQuery = AnalyticsRange & {
  partner_id?: number;
  zone_id?: number | string;
  camera_id?: number | string;
};

function analyticsQuery(query: AnalyticsQuery = {}) {
  const search = new URLSearchParams();
  const scalarQuery = buildQuery({
    partner_id: query.partner_id,
    from: query.from,
    to: query.to,
    granularity: query.granularity,
    forecast_created_at: query.forecast_created_at,
    top: query.top,
    offset: query.offset
  });

  if (scalarQuery) {
    const scalarParams = new URLSearchParams(scalarQuery.slice(1));
    scalarParams.forEach((value, key) => search.set(key, value));
  }

  query.zone_ids?.forEach(zoneId => search.append('zone_id', String(zoneId)));
  query.camera_ids?.forEach(cameraId => search.append('camera_id', String(cameraId)));

  const result = search.toString();
  return result ? `?${result}` : '';
}

function legacySeriesQuery(query: LegacySeriesQuery = {}, view: 'series') {
  return buildQuery({
    partner_id: query.partner_id,
    zone_id: query.zone_id,
    camera_id: query.camera_id,
    from: query.from,
    to: query.to,
    view
  });
}

export const analyticsApi = {
  async legacyOccupancySeries(query?: LegacySeriesQuery) {
    return request<LegacyOccupancySeriesPoint[]>('GET', `/occupancy${legacySeriesQuery(query, 'series')}`);
  },

  async legacyForecastSeries(query?: LegacySeriesQuery) {
    return request<LegacyForecastSeriesPoint[]>('GET', `/forecasts${legacySeriesQuery(query, 'series')}`);
  },

  async summary(query?: AnalyticsQuery) {
    return request<AnalyticsSummary>('GET', `/admin/analytics/summary${analyticsQuery(query)}`);
  },

  async updateFrequency(query?: AnalyticsQuery) {
    return request<AnalyticsUpdateFrequency>('GET', `/admin/analytics/update-frequency${analyticsQuery(query)}`);
  },

  async confidence(query?: AnalyticsQuery) {
    return request<AnalyticsConfidence>('GET', `/admin/analytics/confidence${analyticsQuery(query)}`);
  },

  async occupancyHistory(query?: AnalyticsQuery) {
    return request<AnalyticsHistory>('GET', `/admin/analytics/occupancy-history${analyticsQuery(query)}`);
  },

  async occupancyForecast(query?: AnalyticsQuery) {
    return request<AnalyticsForecast>('GET', `/admin/analytics/occupancy-forecast${analyticsQuery(query)}`);
  },

  async occupancyHeatmap(query?: AnalyticsQuery) {
    return request<AnalyticsHistory>('GET', `/admin/analytics/occupancy-heatmap${analyticsQuery(query)}`);
  },

  async observationsRate(query?: AnalyticsQuery) {
    return request<AnalyticsObservationsRate>('GET', `/admin/analytics/observations-rate${analyticsQuery(query)}`);
  },

  async detectorHealth(query?: AnalyticsQuery) {
    return request<AnalyticsDetectorHealth>('GET', `/admin/analytics/detector-health${analyticsQuery(query)}`);
  },

  async cameraDetections(cameraId: number, query?: AnalyticsQuery) {
    return request<DetectionRunList>('GET', `/admin/analytics/cameras/${encodeURIComponent(cameraId)}/detections${analyticsQuery(query)}`);
  },

  async detection(detectionRunId: number | string) {
    return request<DetectionRunDetail>('GET', `/admin/analytics/detections/${encodeURIComponent(detectionRunId)}`);
  },

  async createDetectionFeedback(detectionRunId: number | string, data: DetectionFeedbackRequest) {
    return request<DetectionFeedback>('POST', `/admin/analytics/detections/${encodeURIComponent(detectionRunId)}/feedback`, data);
  },

  async detectionFeedback(detectionRunId: number | string) {
    return request<DetectionFeedbackList>('GET', `/admin/analytics/detections/${encodeURIComponent(detectionRunId)}/feedback`);
  },

  async detectionFeedbackDetail(detectionRunId: number | string, feedbackId: number | string) {
    return request<DetectionFeedback>('GET', `/admin/analytics/detections/${encodeURIComponent(detectionRunId)}/feedback/${encodeURIComponent(feedbackId)}`);
  }
};
