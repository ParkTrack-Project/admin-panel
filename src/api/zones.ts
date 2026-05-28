import type { GeoPoint, Id, ParkingZone, PxPoint, ZoneLocationType } from '@/types';
import { buildQuery, request } from './http';

export type { ZoneLocationType } from '@/types';

export type ZonePoint = {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
};

export type ZoneCoordinatePair = [number, number];

export type ZoneGeometry = {
  type: 'Polygon';
  coordinates: ZoneCoordinatePair[][];
};

export type ZoneImagePolygon = [PxPoint, PxPoint, PxPoint, PxPoint];

export type ZoneConfidenceLevel = 'low' | 'medium' | 'high' | string | null;

export type ZoneView = 'full' | 'map';

export type ZoneBBox = {
  min_longitude: number;
  min_latitude: number;
  max_longitude: number;
  max_latitude: number;
};

export type ZoneListFilters = {
  camera_id?: number;
  partner_id?: number;
  is_active?: boolean;
  min_free_count?: number;
  min_confidence?: number;
  max_pay?: number;
  include_private?: boolean;
  include_accessible?: boolean;
  hide_location_types?: string | string[];
  bbox?: ZoneBBox | string;
  view?: ZoneView;
};

export type ZoneMapItem = {
  zone_id: number;
  zone_type: ParkingZone['zone_type'];
  capacity: number;
  occupied?: number;
  free_count?: number;
  confidence?: number;
  confidence_level?: ZoneConfidenceLevel;
  pay: number;
  geometry: ZoneGeometry;
  location_type?: ZoneLocationType;
  is_private?: boolean | null;
  is_accessible?: boolean | null;
  occupancy_updated_at?: string;
  is_active?: boolean;
};

type ZoneApiPoint = {
  latitude?: number | null;
  longitude?: number | null;
  x?: number;
  y?: number;
};

type ZoneApiDto = {
  zone_id?: Id;
  id?: Id;
  camera_id: number;
  zone_type: ParkingZone['zone_type'];
  capacity: number;
  occupied?: number;
  free_count?: number;
  confidence?: number;
  confidence_level?: ZoneConfidenceLevel;
  pay: number;
  geometry?: ZoneGeometry | null;
  image_polygon?: Array<ZoneCoordinatePair | { x: number; y: number }> | null;
  points?: ZoneApiPoint[] | null;
  partner_id?: number | null;
  created_by_user_id?: number | null;
  is_active?: boolean;
  location_type?: ZoneLocationType;
  is_private?: boolean | null;
  is_accessible?: boolean | null;
  occupancy_updated_at?: string;
  created_at?: string;
  updated_at?: string;
};

const emptyPxPoint = (): PxPoint => ({ x: 0, y: 0 });
const emptyGeoPoint = (): GeoPoint => ({ x: 0, y: 0, longitude: null, latitude: null });

function formatBBox(bbox?: ZoneBBox | string) {
  if (!bbox) return undefined;
  if (typeof bbox === 'string') return bbox;
  return [
    bbox.min_longitude,
    bbox.min_latitude,
    bbox.max_longitude,
    bbox.max_latitude
  ].join(',');
}

function formatHiddenLocationTypes(value?: string | string[]) {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}

function zoneListQuery(filters: ZoneListFilters = {}) {
  return buildQuery({
    camera_id: filters.camera_id,
    partner_id: filters.partner_id,
    is_active: filters.is_active,
    min_free_count: filters.min_free_count,
    min_confidence: filters.min_confidence,
    max_pay: filters.max_pay,
    include_private: filters.include_private,
    include_accessible: filters.include_accessible,
    hide_location_types: formatHiddenLocationTypes(filters.hide_location_types),
    bbox: formatBBox(filters.bbox),
    view: filters.view
  });
}

function normalizeImageVertex(input: ZoneCoordinatePair | { x: number; y: number } | null | undefined): PxPoint | null {
  if (!input) return null;
  if (Array.isArray(input) && input.length >= 2) {
    return { x: Number(input[0]), y: Number(input[1]) };
  }
  if (typeof input === 'object' && 'x' in input && 'y' in input) {
    return { x: Number(input.x), y: Number(input.y) };
  }
  return null;
}

function normalizeImagePolygon(
  imagePolygon?: ZoneApiDto['image_polygon'],
  legacyPoints?: ZoneApiPoint[] | null
): ZoneImagePolygon {
  const fromImagePolygon = (imagePolygon || [])
    .map(normalizeImageVertex)
    .filter((point): point is PxPoint => Boolean(point))
    .slice(0, 4);

  if (fromImagePolygon.length === 4) {
    return fromImagePolygon as ZoneImagePolygon;
  }

  const fromLegacy = (legacyPoints || [])
    .filter(point => point.x !== undefined && point.y !== undefined)
    .slice(0, 4)
    .map(point => ({ x: Number(point.x), y: Number(point.y) }));

  if (fromLegacy.length === 4) {
    return fromLegacy as ZoneImagePolygon;
  }

  return [emptyPxPoint(), emptyPxPoint(), emptyPxPoint(), emptyPxPoint()];
}

function normalizeGeometryPoints(
  geometry?: ZoneGeometry | null,
  legacyPoints?: ZoneApiPoint[] | null
) {
  const ring = geometry?.coordinates?.[0] || [];
  const openRing = ring.length > 1 ? ring.slice(0, -1) : ring;
  const fromGeometry = openRing
    .slice(0, 4)
    .map(pair => ({
      longitude: Number(pair[0]),
      latitude: Number(pair[1])
    }));

  if (fromGeometry.length === 4) {
    return fromGeometry;
  }

  const fromLegacy = (legacyPoints || [])
    .slice(0, 4)
    .map(point => ({
      longitude: point.longitude ?? null,
      latitude: point.latitude ?? null
    }));

  if (fromLegacy.length === 4) {
    return fromLegacy;
  }

  return [
    { longitude: null, latitude: null },
    { longitude: null, latitude: null },
    { longitude: null, latitude: null },
    { longitude: null, latitude: null }
  ];
}

function mergeZonePoints(imagePolygon: ZoneImagePolygon, geometryPoints: Array<{ longitude: number | null; latitude: number | null }>) {
  return imagePolygon.map((pixelPoint, index) => ({
    x: pixelPoint.x,
    y: pixelPoint.y,
    longitude: geometryPoints[index]?.longitude ?? null,
    latitude: geometryPoints[index]?.latitude ?? null
  })) as [GeoPoint, GeoPoint, GeoPoint, GeoPoint];
}

function buildZoneGeometry(points: GeoPoint[]): ZoneGeometry {
  const coordinates = points.slice(0, 4).map((point, index) => {
    if (point.longitude === null || point.latitude === null) {
      throw new Error(`Point ${index + 1} is missing coordinates (latitude/longitude). Please set coordinates on the map first.`);
    }
    return [point.longitude, point.latitude] as ZoneCoordinatePair;
  });

  return {
    type: 'Polygon',
    coordinates: [[...coordinates, coordinates[0]]]
  };
}

function buildImagePolygon(points: GeoPoint[] | PxPoint[]): ZoneImagePolygon {
  const imagePolygon = points.slice(0, 4).map(point => ({
    x: Math.round(point.x),
    y: Math.round(point.y)
  }));

  if (imagePolygon.length !== 4) {
    throw new Error('Zone image polygon must contain exactly 4 vertices.');
  }

  return imagePolygon as ZoneImagePolygon;
}

export function mapZoneFromApi(zone: ZoneApiDto): ParkingZone {
  const imagePolygon = normalizeImagePolygon(zone.image_polygon, zone.points);
  const geometryPoints = normalizeGeometryPoints(zone.geometry, zone.points);
  const points = mergeZonePoints(imagePolygon, geometryPoints);

  return {
    id: (zone.zone_id ?? zone.id) as Id,
    camera_id: Number(zone.camera_id),
    zone_type: zone.zone_type,
    capacity: Number(zone.capacity),
    occupied: zone.occupied !== undefined ? Number(zone.occupied) : undefined,
    free_count: zone.free_count !== undefined ? Number(zone.free_count) : undefined,
    confidence: zone.confidence !== undefined ? Number(zone.confidence) : undefined,
    confidence_level: zone.confidence_level,
    pay: Number(zone.pay),
    image_quad: imagePolygon,
    image_polygon: imagePolygon,
    points,
    geometry: zone.geometry ?? buildZoneGeometry(points),
    partner_id: zone.partner_id ?? null,
    created_by_user_id: zone.created_by_user_id ?? null,
    is_active: zone.is_active,
    location_type: zone.location_type,
    is_private: zone.is_private ?? null,
    is_accessible: zone.is_accessible ?? null,
    occupancy_updated_at: zone.occupancy_updated_at,
    created_at: zone.created_at,
    updated_at: zone.updated_at
  };
}

function buildZoneCreateBody(zone: ParkingZone) {
  return {
    camera_id: zone.camera_id,
    zone_type: zone.zone_type,
    capacity: zone.capacity,
    pay: zone.pay,
    geometry: buildZoneGeometry(zone.points),
    image_polygon: (zone.image_polygon ?? buildImagePolygon(zone.image_quad ?? zone.points)).map(point => [point.x, point.y]),
    partner_id: zone.partner_id,
    is_active: zone.is_active,
    location_type: zone.location_type,
    is_private: zone.is_private,
    is_accessible: zone.is_accessible
  };
}

function buildZoneUpdateBody(zone: ParkingZone) {
  const body: Record<string, unknown> = {};

  if (zone.zone_type !== undefined) body.zone_type = zone.zone_type;
  if (zone.capacity !== undefined) body.capacity = zone.capacity;
  if (zone.pay !== undefined) body.pay = zone.pay;
  if (zone.occupied !== undefined) body.occupied = zone.occupied;
  if (zone.confidence !== undefined) body.confidence = zone.confidence;
  if (zone.camera_id !== undefined) body.camera_id = zone.camera_id;
  if (zone.partner_id !== undefined) body.partner_id = zone.partner_id;
  if (zone.is_active !== undefined) body.is_active = zone.is_active;
  if (zone.location_type !== undefined) body.location_type = zone.location_type;
  if (zone.is_private !== undefined) body.is_private = zone.is_private;
  if (zone.is_accessible !== undefined) body.is_accessible = zone.is_accessible;

  body.geometry = buildZoneGeometry(zone.points);
  body.image_polygon = (zone.image_polygon ?? buildImagePolygon(zone.image_quad ?? zone.points)).map(point => [point.x, point.y]);

  return body;
}

export const zonesApi = {
  async list(filters?: ZoneListFilters) {
    const zones = await request<ZoneApiDto[]>('GET', `/zones${zoneListQuery(filters)}`);
    return zones.map(mapZoneFromApi);
  },

  async listMap(filters?: Omit<ZoneListFilters, 'view'>) {
    return request<ZoneMapItem[]>('GET', `/zones${zoneListQuery({ ...filters, view: 'map' })}`);
  },

  async get(zoneId: Id) {
    const zone = await request<ZoneApiDto>('GET', `/zones/${encodeURIComponent(String(zoneId))}`);
    return mapZoneFromApi(zone);
  },

  async create(zone: ParkingZone) {
    return request<any>('POST', '/zones/new', buildZoneCreateBody(zone));
  },

  async update(zoneId: Id, zone: ParkingZone) {
    const updated = await request<ZoneApiDto>('PUT', `/zones/${encodeURIComponent(String(zoneId))}`, buildZoneUpdateBody(zone));
    return mapZoneFromApi(updated);
  },

  async delete(zoneId: Id) {
    await request<void>('DELETE', `/zones/${encodeURIComponent(String(zoneId))}`);
  }
};
