import { ParkingZone, GeoPoint, PxPoint, Id, SessionUser } from '@/types';
import { useRequestLog } from './requestLog';

type Config = { baseUrl: string; token?: string };
let cfg: Config = { baseUrl: 'https://api.parktrack.live' };

// --- types (according to Swagger schema) ---

export type ErrorResponse = {
  error_description: string;
};

export type Camera = {
  camera_id: number;
  title: string;
  source: string;
  image_width: number;
  image_height: number;
  calib: any | null;
  latitude: number;
  longitude: number;
  is_active?: boolean;
  created_at: string; // ISO 8601 format with Z (UTC)
  updated_at: string; // ISO 8601 format with Z (UTC)
};

export type CreateCameraRequest = {
  title: string; // minLength: 1, maxLength: 200
  source: string;
  image_width: number; // minimum: 1
  image_height: number; // minimum: 1
  calib?: any | null;
  latitude: number; // -90 to 90
  longitude: number; // -180 to 180
};

export type UpdateCameraRequest = {
  title?: string; // minLength: 1, maxLength: 200
  source?: string;
  image_width?: number; // minimum: 1
  image_height?: number; // minimum: 1
  calib?: any | null;
  latitude?: number; // -90 to 90
  longitude?: number; // -180 to 180
  is_active?: boolean;
};

export type CamerasNextResponse = {
  camera_id: number;
  source: string;
  image_width: number;
  image_height: number;
  calib?: any | null;
};

export type ZonePoint = {
  latitude: number; // -90 to 90
  longitude: number; // -180 to 180
  x: number; // minimum: 0
  y: number; // minimum: 0
};

export type HealthResponse = {
  status?: string;
  database?: string;
};

export type VersionResponse = {
  api_version?: string;
  version?: string;
};

export type AuthUserResponse = {
  user_id: number;
  email: string;
  full_name: string | null;
  global_roles: string[];
  permissions?: string[];
  partner_memberships?: SessionUser['partner_memberships'];
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUserResponse;
};

export type LoginRequest = {
  login: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
};

export const apiConfig = {
  set(baseUrl: string, token?: string) { cfg = { baseUrl, token }; },
  get() { return cfg; }
};

async function request<T>(method: 'GET'|'POST'|'PUT'|'DELETE', path: string, body?: any): Promise<T> {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const id = crypto.randomUUID();
  useRequestLog.getState().add({ id, ts: Date.now(), method, url, headers, body });

  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });

  const ct = res.headers.get('content-type') || '';
  let data: any = undefined;
  if (ct.includes('application/json')) { try { data = await res.json(); } catch {} }
  else { try { data = await res.text(); } catch {} }

  useRequestLog.getState().add({ id: id + '-resp', ts: Date.now(), method, url, status: res.status, response: data });

  if (!res.ok) {
    // Handle error according to Swagger Error schema
    const errorMessage = data?.error_description || data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(errorMessage);
  }
  return data as T;
}

// --- helpers & mappers ---
const gp = (x:number, y:number, longitude:number|null=null, latitude:number|null=null): GeoPoint => ({ x,y,longitude,latitude });
const px = (p: GeoPoint): PxPoint => ({ x: p.x, y: p.y });

function mapZoneFromAPI(z: any): ParkingZone {
  const pts = (z.points || []).map((p: any) => gp(+p.x, +p.y, p.longitude ?? null, p.latitude ?? null)) as GeoPoint[];
  const quad = pts.slice(0,4).map(px) as [PxPoint, PxPoint, PxPoint, PxPoint];

  return {
    id: z.zone_id as Id,
    camera_id: +z.camera_id,
    zone_type: z.zone_type,
    capacity: +z.capacity,
    pay: +z.pay,
    image_quad: quad,
    points: pts.slice(0,4) as any, // Preserve clockwise order
    created_at: z.created_at,
    updated_at: z.updated_at,
    occupied: z.occupied !== undefined ? +z.occupied : undefined,
    confidence: z.confidence !== undefined ? +z.confidence : undefined
  };
}

function buildCreateZoneBody(z: ParkingZone) {
  const points = z.points.slice(0, 4).map((p, idx) => {
    if (p.latitude === null || p.longitude === null) {
      throw new Error(`Point ${idx + 1} is missing coordinates (latitude/longitude). Please set coordinates on the map first.`);
    }
    return {
      latitude: p.latitude,
      longitude: p.longitude,
      // API requires integer coordinates, not floats
      x: Math.round(p.x),
      y: Math.round(p.y)
    } as ZonePoint;
  });

  return {
    camera_id: z.camera_id,
    zone_type: z.zone_type,
    capacity: z.capacity,
    pay: z.pay,
    points
  };
}

function buildUpdateZoneBody(z: ParkingZone) {
  const body: any = {};
  
  if (z.zone_type !== undefined) body.zone_type = z.zone_type;
  if (z.capacity !== undefined) body.capacity = z.capacity;
  if (z.pay !== undefined) body.pay = z.pay;
  if (z.occupied !== undefined) body.occupied = z.occupied;
  if (z.confidence !== undefined) body.confidence = z.confidence;
  if (z.camera_id !== undefined) body.camera_id = z.camera_id;
  
  if (z.points && z.points.length === 4) {
    body.points = z.points.map((p, idx) => {
      if (p.latitude === null || p.longitude === null) {
        throw new Error(`Point ${idx + 1} is missing coordinates (latitude/longitude). Please set coordinates on the map first.`);
      }
      return {
        latitude: p.latitude,
        longitude: p.longitude,
        // API requires integer coordinates, not floats
        x: Math.round(p.x),
        y: Math.round(p.y)
      } as ZonePoint;
    });
  }

  return body;
}

// --- public API ---
export const api = {
  // --- Auth ---
  auth: {
    async register(data: RegisterRequest) {
      return request<AuthResponse>('POST', '/auth/register', data);
    },

    async login(data: LoginRequest) {
      return request<AuthResponse>('POST', '/auth/login', data);
    },

    async logout() {
      await request<void>('POST', '/auth/logout');
    },

    async me() {
      return request<SessionUser>('GET', '/auth/me');
    }
  },

  // --- Parking Zones ---
  async listZones(cameraId?: number) {
    const q = cameraId ? `?camera_id=${encodeURIComponent(cameraId)}` : '';
    const arr = await request<any[]>('GET', `/zones${q}`);
    return arr.map(mapZoneFromAPI);
  },
  
  async getZone(zoneId: Id) {
    const z = await request<any>('GET', `/zones/${encodeURIComponent(String(zoneId))}`);
    return mapZoneFromAPI(z);
  },
  
  async createZone(z: ParkingZone) {
    const body = buildCreateZoneBody(z);
    const resp = await request<any>('POST', `/zones/new`, body);
    return resp; // Returns { zone_id } or full zone object
  },
  
  async updateZone(zoneId: Id, z: ParkingZone) {
    const updated = await request<any>('PUT', `/zones/${encodeURIComponent(String(zoneId))}`, buildUpdateZoneBody(z));
    return mapZoneFromAPI(updated);
  },
  
  async deleteZone(zoneId: Id) {
    await request<void>('DELETE', `/zones/${encodeURIComponent(String(zoneId))}`);
  },

  // --- Cameras ---
  async listCameras() {
    return request<Camera[]>('GET', `/cameras`);
  },
  
  async getCamera(cameraId: number) {
    return request<Camera>('GET', `/cameras/${encodeURIComponent(cameraId)}`);
  },
  
  async createCamera(data: CreateCameraRequest) {
    return request<Camera>('POST', `/cameras/new`, data);
  },
  
  async updateCamera(cameraId: number, patch: UpdateCameraRequest) {
    return request<Camera>('PUT', `/cameras/${encodeURIComponent(cameraId)}`, patch);
  },
  
  async deleteCamera(cameraId: number) {
    await request<void>('DELETE', `/cameras/${encodeURIComponent(cameraId)}`);
  },
  
  async getNextCamera() {
    return request<CamerasNextResponse>('GET', `/cameras/next`);
  },
  
  async getSnapshot(cameraId: number): Promise<{ image_url: string; captured_at?: string; width?: number; height?: number }> {
    // API returns binary image data (JPEG), not JSON
    const url = `${cfg.baseUrl}/cameras/${encodeURIComponent(cameraId)}/snapshot`;
    const headers: Record<string, string> = {};
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

    const id = crypto.randomUUID();
    useRequestLog.getState().add({ id, ts: Date.now(), method: 'GET', url, headers });

    const res = await fetch(url, { method: 'GET', headers });

    useRequestLog.getState().add({ 
      id: id + '-resp', 
      ts: Date.now(), 
      method: 'GET', 
      url, 
      status: res.status, 
      response: `[Binary image data, ${res.headers.get('content-length') || 'unknown'} bytes]` 
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(errorText || `HTTP ${res.status}`);
    }

    // Convert binary response to blob URL for display
    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);

    return {
      image_url: imageUrl,
      captured_at: res.headers.get('X-Captured-At') || undefined
    };
  },

  // --- System ---
  async health() {
    return request<HealthResponse>('GET', `/health`);
  },
  
  async version() {
    return request<VersionResponse>('GET', `/version`);
  }
};
