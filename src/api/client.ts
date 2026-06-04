import { ParkingZone, Id, SessionUser } from '@/types';
import { apiConfig, request } from './http';
import { camerasApi, CameraListFilters } from './cameras';
import { zonesApi, ZoneListFilters } from './zones';
import { analyticsApi } from './analytics';

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
export type {
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
  AnalyticsZoneSummary,
  DetectionFeedback,
  DetectionFeedbackErrorType,
  DetectionFeedbackList,
  DetectionFeedbackRating,
  DetectionFeedbackRequest,
  DetectionRunDetail,
  DetectionRunList,
  DetectionRunListItem,
  ForecastQualityResponse,
  LegacyForecastSeriesPoint,
  LegacyOccupancySeriesPoint,
  LegacySeriesQuery
} from './analytics';

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
  global_role?: string;
  global_roles?: string[];
  permissions?: string[];
  partner_memberships?: SessionUser['partner_memberships'];
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: SessionUser;
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

export type PasswordResetRequest = {
  email: string;
};

export type PasswordResetRequestResponse = {
  ok: boolean;
  reset_token?: string | null;
};

export type PasswordResetConfirmRequest = {
  token: string;
  new_password: string;
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

type RawUserProfileEnvelope = {
  user: UserProfileResponse;
  partner_memberships?: SessionUser['partner_memberships'];
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

export type AdminCreateUserRequest = {
  email: string;
  password: string;
  full_name?: string | null;
  phone?: string | null;
  global_role?: string;
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

type RawPartnerResponse = Omit<PartnerResponse, 'legal_name'> & {
  legal_name?: string;
  name?: string;
};

export type PartnerListResponse = {
  items: PartnerResponse[];
  total: number;
  top: number;
  offset: number;
};

export type PartnerListFilters = {
  q?: string;
  is_active?: boolean;
  top?: number;
  offset?: number;
};

export type CreatePartnerRequest = {
  legal_name: string;
  slug: string;
  contact_email?: string | null;
  contact_phone?: string | null;
};

export type UpdatePartnerRequest = {
  legal_name?: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
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

export type InvitePartnerMemberRequest = {
  user_id: number;
  user_role: string;
  read_scope: string;
  write_scope: string;
  delete_scope: string;
};

export type UpdatePartnerMemberRequest = {
  user_role?: string;
  read_scope?: string;
  write_scope?: string;
  delete_scope?: string;
};

export type DataSource = {
  source_id: number;
  partner_id: number | null;
  entity_type: string;
  entity_id: number;
  source_type: string;
  title: string;
  status: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SourceListResponse = {
  items: DataSource[];
  total: number;
  top: number;
  offset: number;
};

export type SourceListFilters = {
  partner_id?: number;
  is_active?: boolean;
  top?: number;
  offset?: number;
};

export { apiConfig } from './http';

function normalizeGlobalRole(input: { global_role?: string; global_roles?: string[] }) {
  return input.global_role ?? input.global_roles?.[0] ?? 'user';
}

function normalizeSessionUser(input: AuthUserResponse): SessionUser {
  return {
    user_id: input.user_id,
    email: input.email,
    full_name: input.full_name,
    global_role: normalizeGlobalRole(input),
    permissions: input.permissions ?? [],
    partner_memberships: input.partner_memberships ?? []
  };
}

function normalizeUserProfileResponse(input: UserProfileResponse | RawUserProfileEnvelope): UserProfileResponse {
  if ('user' in input) {
    return input.user;
  }
  return input;
}

function normalizePartnerResponse(input: RawPartnerResponse): PartnerResponse {
  return {
    partner_id: input.partner_id,
    legal_name: input.legal_name ?? input.name ?? '',
    slug: input.slug,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    is_active: input.is_active,
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

// --- public API ---
export const api = {
  // --- Auth ---
  auth: {
    async register(data: RegisterRequest) {
      const response = await request<{
        access_token: string;
        token_type: string;
        expires_in: number;
        user: AuthUserResponse;
      }>('POST', '/auth/register', data);

      return {
        ...response,
        user: normalizeSessionUser(response.user)
      } satisfies AuthResponse;
    },

    async login(data: LoginRequest) {
      const response = await request<{
        access_token: string;
        token_type: string;
        expires_in: number;
        user: AuthUserResponse;
      }>('POST', '/auth/login', data);

      return {
        ...response,
        user: normalizeSessionUser(response.user)
      } satisfies AuthResponse;
    },

    async requestPasswordReset(data: PasswordResetRequest) {
      return request<PasswordResetRequestResponse>('POST', '/auth/password-reset/request', data);
    },

    async confirmPasswordReset(data: PasswordResetConfirmRequest) {
      return request<{ ok: boolean }>('POST', '/auth/password-reset/confirm', data);
    },

    async logout() {
      await request<void>('POST', '/auth/logout');
    },

    async me() {
      const response = await request<AuthUserResponse>('GET', '/auth/me');
      return normalizeSessionUser(response);
    }
  },

  users: {
    async me() {
      const response = await request<UserProfileResponse | RawUserProfileEnvelope>('GET', '/users/me');
      return normalizeUserProfileResponse(response);
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

    async create(data: AdminCreateUserRequest) {
      return request<UserProfileResponse>('POST', '/users', data);
    },

    async remove(userId: number) {
      await request<void>('DELETE', `/users/${encodeURIComponent(userId)}`);
    }
  },

  partners: {
    async list(filters: PartnerListFilters = {}) {
      const query = new URLSearchParams();
      if (filters.q) query.set('q', filters.q);
      if (filters.is_active !== undefined) query.set('is_active', String(filters.is_active));
      if (filters.top !== undefined) query.set('top', String(filters.top));
      if (filters.offset !== undefined) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      const response = await request<{ items: RawPartnerResponse[]; total: number; top: number; offset: number }>('GET', `/partners${suffix}`);
      return {
        ...response,
        items: response.items.map(normalizePartnerResponse)
      } satisfies PartnerListResponse;
    },

    async get(partnerId: number) {
      const response = await request<RawPartnerResponse>('GET', `/partners/${encodeURIComponent(partnerId)}`);
      return normalizePartnerResponse(response);
    },

    async create(data: CreatePartnerRequest) {
      return request<{ partner_id: number }>('POST', '/partners/new', data);
    },

    async update(partnerId: number, data: UpdatePartnerRequest) {
      const response = await request<RawPartnerResponse>('PUT', `/partners/${encodeURIComponent(partnerId)}`, data);
      return normalizePartnerResponse(response);
    },

    async remove(partnerId: number) {
      await request<void>('DELETE', `/partners/${encodeURIComponent(partnerId)}`);
    },

    async listMembers(partnerId: number) {
      return request<PartnerMemberListResponse>('GET', `/partners/${encodeURIComponent(partnerId)}/members`);
    },

    async inviteMember(partnerId: number, data: InvitePartnerMemberRequest) {
      return request<{ partner_membership_id: number }>('POST', `/partners/${encodeURIComponent(partnerId)}/members`, data);
    },

    async updateMember(partnerId: number, userId: number, data: UpdatePartnerMemberRequest) {
      return request<PartnerMemberResponse>('PUT', `/partners/${encodeURIComponent(partnerId)}/members/${encodeURIComponent(userId)}`, data);
    },

    async removeMember(partnerId: number, userId: number) {
      await request<void>('DELETE', `/partners/${encodeURIComponent(partnerId)}/members/${encodeURIComponent(userId)}`);
    }
  },

  sources: {
    async list(filters: SourceListFilters = {}) {
      const query = new URLSearchParams();
      if (filters.partner_id !== undefined) query.set('partner_id', String(filters.partner_id));
      if (filters.is_active !== undefined) query.set('is_active', String(filters.is_active));
      if (filters.top !== undefined) query.set('top', String(filters.top));
      if (filters.offset !== undefined) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      return request<SourceListResponse>('GET', `/sources${suffix}`);
    },

    async get(sourceId: number) {
      return request<DataSource>('GET', `/sources/${encodeURIComponent(sourceId)}`);
    }
  },

  analytics: analyticsApi,

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
