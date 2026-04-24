import { buildQuery, request, requestBlob } from './http';

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
};

export type CameraSnapshotOptions = {
  annotated?: boolean;
  fallback_to_raw?: boolean;
};

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

  async getSnapshot(cameraId: number, options?: CameraSnapshotOptions): Promise<CameraSnapshot> {
    const query = buildQuery({
      annotated: options?.annotated,
      fallback_to_raw: options?.fallback_to_raw
    });
    const { blob, headers } = await requestBlob(`/cameras/${encodeURIComponent(cameraId)}/snapshot${query}`);
    return {
      image_url: URL.createObjectURL(blob),
      captured_at: headers.get('X-Captured-At') || undefined
    };
  }
};
