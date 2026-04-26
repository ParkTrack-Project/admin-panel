export type Id = number | string;

export type PxPoint = { x: number; y: number };

export type GeoPoint = {
  x: number;
  y: number;
  longitude: number | null;
  latitude: number | null;
};

export type ParkingZone = {
  id: Id;                        // zone_id
  camera_id: number;
  zone_type: 'parallel' | 'standard' | 'disabled';
  capacity: number;
  pay: number;
  occupied?: number;
  free_count?: number;
  confidence?: number;
  confidence_level?: 'low' | 'medium' | 'high' | string | null;
  image_quad: [PxPoint, PxPoint, PxPoint, PxPoint];
  image_polygon?: [PxPoint, PxPoint, PxPoint, PxPoint];
  geometry?: {
    type: 'Polygon';
    coordinates: Array<Array<[number, number]>>;
  };
  points: [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
  partner_id?: number | null;
  created_by_user_id?: number | null;
  is_active?: boolean;
  location_type?: 'street' | 'yard' | 'parking_lot' | 'garage' | string | null;
  is_private?: boolean | null;
  is_accessible?: boolean | null;
  occupancy_updated_at?: string;

  created_at?: string;           // ISO 8601 format with Z (UTC)
  updated_at?: string;           // ISO 8601 format with Z (UTC)
};

export type ToolMode = 'select' | 'drawZone' | 'editZone';

export type ViewMode = 'labeler' | 'cameras' | 'cameraMapSelector' | 'zoneMapSelector';

export type ImageMeta = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};

export type GlobalRole = 'user' | 'admin';

export type PartnerRole =
  | 'partner_owner'
  | 'partner_admin'
  | 'partner_manager'
  | 'partner_analyst'
  | 'partner_viewer';

export type AccessScope =
  | 'none'
  | 'own'
  | 'assigned'
  | 'own_or_assigned'
  | 'partner_all'
  | 'global_all';

export type PartnerMembership = {
  partner_id: number;
  user_id?: number;
  role: PartnerRole | string;
  permissions: string[];
  read_scope: AccessScope | string;
  write_scope: AccessScope | string;
  delete_scope: AccessScope | string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SessionUser = {
  user_id: number;
  email: string;
  full_name: string | null;
  phone?: string | null;
  global_roles: Array<GlobalRole | string>;
  permissions: string[];
  partner_memberships: PartnerMembership[];
  is_active?: boolean;
  is_email_verified?: boolean;
  created_at?: string;
  updated_at?: string;
};
