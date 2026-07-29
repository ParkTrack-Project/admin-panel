import { ApiRequestError, buildQuery, request, requestBlob } from './http';

export type Camera = {
  camera_id: number;
  title: string;
  source: string;
  image_width: number;
  image_height: number;
  calib: any | null;
  latitude: number;
  longitude: number;
  partner_id?: number | null;
  created_by_user_id?: number | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type CameraMapItem = {
  camera_id: number;
  title: string;
  latitude: number;
  longitude: number;
  partner_id?: number | null;
  is_active: boolean;
};

export type CreateCameraRequest = {
  title: string;
  source: string;
  image_width: number;
  image_height: number;
  calib?: any | null;
  latitude: number;
  longitude: number;
  partner_id?: number;
};

export type UpdateCameraRequest = {
  title?: string;
  source?: string;
  image_width?: number;
  image_height?: number;
  calib?: any | null;
  latitude?: number;
  longitude?: number;
  partner_id?: number | null;
  is_active?: boolean;
};

export type CamerasNextResponse = {
  camera_id: number;
  source: string;
  image_width: number;
  image_height: number;
  calib?: any | null;
  partner_id?: number | null;
  is_active?: boolean;
};

export type CameraView = 'full' | 'map';

export type CameraBBox = {
  min_longitude: number;
  min_latitude: number;
  max_longitude: number;
  max_latitude: number;
};

export type CameraListFilters = {
  q?: string;
  partner_id?: number;
  is_active?: boolean;
  bbox?: CameraBBox | string;
  view?: CameraView;
};

export type CameraSnapshot = {
  image_url: string;
  captured_at?: string;
  width?: number;
  height?: number;
  variant?: 'live' | 'raw' | 'annotated';
  detection_run_id?: number | string;
};

export type CameraSnapshotMode = 'latest' | 'detection' | 'annotated';

type CameraDetectionSnapshot = {
  detection_run_id: number | string;
  started_at?: string | null;
  finished_at?: string | null;
  raw_snapshot_url?: string | null;
  annotated_snapshot_url?: string | null;
};

type CameraDetectionSnapshotList = {
  items: CameraDetectionSnapshot[];
};

async function getStoredCameraSnapshot(
  cameraId: number,
  mode: Extract<CameraSnapshotMode, 'detection' | 'annotated'>
): Promise<CameraSnapshot> {
  const response = await request<CameraDetectionSnapshotList>(
    'GET',
    `/admin/analytics/cameras/${encodeURIComponent(cameraId)}/detections?limit=1`
  );
  const detection = response.items[0];

  if (!detection) {
    throw new ApiRequestError('Для камеры пока нет сохранённых распознаваний.', 404);
  }

  const annotatedUrl = detection.annotated_snapshot_url?.trim();
  const rawUrl = detection.raw_snapshot_url?.trim();
  const imageUrl = mode === 'annotated' ? annotatedUrl || rawUrl : rawUrl;

  if (!imageUrl) {
    const message = mode === 'annotated'
      ? 'Для последнего распознавания нет размеченного или исходного снимка.'
      : 'Для последнего распознавания нет исходного снимка.';
    throw new ApiRequestError(message, 404);
  }

  return {
    image_url: imageUrl,
    captured_at: detection.started_at || detection.finished_at || undefined,
    variant: mode === 'annotated' && annotatedUrl ? 'annotated' : 'raw',
    detection_run_id: detection.detection_run_id
  };
}

function formatBBox(bbox?: CameraBBox | string) {
  if (!bbox) return undefined;
  if (typeof bbox === 'string') return bbox;
  return [
    bbox.min_longitude,
    bbox.min_latitude,
    bbox.max_longitude,
    bbox.max_latitude
  ].join(',');
}

function cameraListQuery(filters: CameraListFilters = {}) {
  return buildQuery({
    q: filters.q,
    partner_id: filters.partner_id,
    is_active: filters.is_active,
    bbox: formatBBox(filters.bbox),
    view: filters.view
  });
}

export const camerasApi = {
  async list(filters?: CameraListFilters) {
    return request<Camera[]>('GET', `/cameras${cameraListQuery(filters)}`);
  },

  async listMap(filters?: Omit<CameraListFilters, 'view'>) {
    return request<CameraMapItem[]>('GET', `/cameras${cameraListQuery({ ...filters, view: 'map' })}`);
  },

  async get(cameraId: number) {
    return request<Camera>('GET', `/cameras/${encodeURIComponent(cameraId)}`);
  },

  async create(data: CreateCameraRequest) {
    return request<Camera>('POST', '/cameras/new', data);
  },

  async update(cameraId: number, patch: UpdateCameraRequest) {
    return request<Camera>('PUT', `/cameras/${encodeURIComponent(cameraId)}`, patch);
  },

  async delete(cameraId: number) {
    await request<void>('DELETE', `/cameras/${encodeURIComponent(cameraId)}`);
  },

  async getNext() {
    return request<CamerasNextResponse>('GET', '/cameras/next');
  },

  async getSnapshot(cameraId: number, mode: CameraSnapshotMode = 'latest'): Promise<CameraSnapshot> {
    if (mode !== 'latest') {
      return getStoredCameraSnapshot(cameraId, mode);
    }

    const { blob, headers } = await requestBlob(
      `/admin/cameras/${encodeURIComponent(cameraId)}/snapshot`
    );
    return {
      image_url: URL.createObjectURL(blob),
      captured_at: headers.get('X-Snapshot-Captured-At')
        || headers.get('X-Captured-At')
        || undefined,
      variant: 'live'
    };
  }
};
