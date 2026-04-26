import { ParkingZone, Id, SessionUser } from '@/types';
import { apiConfig, request } from './http';
import { camerasApi, CameraListFilters } from './cameras';
import { zonesApi, ZoneListFilters } from './zones';

// --- types (according to Swagger schema) ---

export type ErrorResponse = {
  error_description: string;
};

export type {
  Camera,
  CameraBBox,
  CameraListFilters,
  CameraMapItem,
  CameraSnapshotOptions,
  CameraSnapshot,
  CamerasNextResponse,
  CameraView,
  CreateCameraRequest,
  UpdateCameraRequest
} from './cameras';
export type {
  ZoneBBox,
  ZoneConfidenceLevel,
  ZoneCoordinatePair,
  ZoneGeometry,
  ZoneImagePolygon,
  ZoneListFilters,
  ZoneLocationType,
  ZoneMapItem,
  ZonePoint,
  ZoneView
} from './zones';

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

export type UpdateMeRequest = {
  full_name?: string;
  phone?: string | null;
};

export type UpdatePasswordRequest = {
  old_password: string;
  new_password: string;
};

export type UserProfileResponse = {
  user_id: number;
  email: string;
  full_name: string | null;
  phone?: string | null;
  global_role?: string;
  global_roles?: string[];
  is_active?: boolean;
  is_email_verified?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type UserListResponse = {
  items: UserProfileResponse[];
  total: number;
  top: number;
  offset: number;
};

export type UserListFilters = {
  q?: string;
  is_active?: boolean;
  top?: number;
  offset?: number;
};

export type AdminUpdateUserRequest = {
  email?: string;
  full_name?: string | null;
  phone?: string | null;
  global_role?: string;
  is_active?: boolean;
};

export type PartnerResponse = {
  partner_id: number;
  legal_name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PartnerListResponse = {
  items: PartnerResponse[];
  total: number;
  top: number;
  offset: number;
};

export type PartnerMemberResponse = {
  partner_membership_id: number;
  user_id: number;
  email: string;
  full_name: string | null;
  user_role: string;
  read_scope: string;
  write_scope: string;
  delete_scope: string;
  created_at?: string;
};

export type PartnerMemberListResponse = {
  items: PartnerMemberResponse[];
  total: number;
  top: number;
  offset: number;
};

export { apiConfig } from './http';

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

  users: {
    async me() {
      return request<UserProfileResponse>('GET', '/users/me');
    },

    async updateMe(data: UpdateMeRequest) {
      return request<UserProfileResponse>('PUT', '/users/me', data);
    },

    async updatePassword(data: UpdatePasswordRequest) {
      await request<void>('PUT', '/users/me/password', data);
    },

    async list(filters: UserListFilters = {}) {
      const query = new URLSearchParams();
      if (filters.q) query.set('q', filters.q);
      if (filters.is_active !== undefined) query.set('is_active', String(filters.is_active));
      if (filters.top !== undefined) query.set('top', String(filters.top));
      if (filters.offset !== undefined) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      return request<UserListResponse>('GET', `/users${suffix}`);
    },

    async get(userId: number) {
      return request<UserProfileResponse>('GET', `/users/${encodeURIComponent(userId)}`);
    },

    async update(userId: number, data: AdminUpdateUserRequest) {
      return request<UserProfileResponse>('PUT', `/users/${encodeURIComponent(userId)}`, data);
    },

    async remove(userId: number) {
      await request<void>('DELETE', `/users/${encodeURIComponent(userId)}`);
    }
  },

  partners: {
    async list() {
      return request<PartnerListResponse>('GET', '/partners');
    },

    async listMembers(partnerId: number) {
      return request<PartnerMemberListResponse>('GET', `/partners/${encodeURIComponent(partnerId)}/members`);
    }
  },

  // --- Parking Zones ---
  async listZones(cameraIdOrFilters?: number | ZoneListFilters) {
    if (typeof cameraIdOrFilters === 'number') {
      return zonesApi.list({ camera_id: cameraIdOrFilters });
    }
    return zonesApi.list(cameraIdOrFilters);
  },
  
  async getZone(zoneId: Id) {
    return zonesApi.get(zoneId);
  },
  
  async createZone(z: ParkingZone) {
    return zonesApi.create(z);
  },
  
  async updateZone(zoneId: Id, z: ParkingZone) {
    return zonesApi.update(zoneId, z);
  },
  
  async deleteZone(zoneId: Id) {
    await zonesApi.delete(zoneId);
  },

  // --- Cameras ---
  async listCameras(filters?: CameraListFilters) {
    return camerasApi.list(filters);
  },
  
  async getCamera(cameraId: number) {
    return camerasApi.get(cameraId);
  },
  
  async createCamera(data: import('./cameras').CreateCameraRequest) {
    return camerasApi.create(data);
  },
  
  async updateCamera(cameraId: number, patch: import('./cameras').UpdateCameraRequest) {
    return camerasApi.update(cameraId, patch);
  },
  
  async deleteCamera(cameraId: number) {
    await camerasApi.delete(cameraId);
  },
  
  async getNextCamera() {
    return camerasApi.getNext();
  },
  
  async getSnapshot(cameraId: number, options?: import('./cameras').CameraSnapshotOptions) {
    return camerasApi.getSnapshot(cameraId, options);
  },

  // --- System ---
  async health() {
    return request<HealthResponse>('GET', `/health`);
  },
  
  async version() {
    return request<VersionResponse>('GET', `/version`);
  }
};
