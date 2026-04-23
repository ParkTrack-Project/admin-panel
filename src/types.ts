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
  confidence?: number;
  image_quad: [PxPoint, PxPoint, PxPoint, PxPoint];
  points: [GeoPoint, GeoPoint, GeoPoint, GeoPoint];

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
};
