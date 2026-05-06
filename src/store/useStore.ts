import { create } from 'zustand';
import {
  ImageMeta,
  ParkingZone,
  PxPoint,
  ToolMode,
  ViewMode,
  GeoPoint,
  Id
} from '@/types';
import { clockwiseSort } from '@/geometry/poly';
import { api, Camera } from '@/api/client';

let tmpZoneId = -1;

function detectDefaultApiBase() {
  const configuredBase = import.meta.env.VITE_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000/api/v1';
    }
  }

  return 'https://api.parktrack.live';
}

const toGeo = (p: PxPoint): GeoPoint => ({ x: p.x, y: p.y, longitude: null, latitude: null });
const hasCoordinates = (latitude?: number | null, longitude?: number | null) => (
  typeof latitude === 'number'
  && Number.isFinite(latitude)
  && typeof longitude === 'number'
  && Number.isFinite(longitude)
);

type State = {
  apiBase: string;
  token?: string;
  cameraId: string;
  labelerReturnRoute?: 'cameras' | 'zones';
  image?: ImageMeta;
  cameraMeta?: Camera;

  viewMode: ViewMode;
  tool: ToolMode;
  zones: ParkingZone[];
  activeZoneId?: Id;

  zoneDraft: PxPoint[] | null;

  scale: number;
  offsetX: number;
  offsetY: number;

  loading: boolean;
  error?: string;
  info?: string;

  setViewMode(mode: ViewMode): void;
  setCamera(id: string): void;
  setLabelerReturnRoute(route?: 'cameras' | 'zones'): void;
  setImage(img: ImageMeta | undefined): void;

  loadCameraMeta(id: number): Promise<void>;
  saveCamera(id: number, patch: Partial<Camera>): Promise<void>;

  setTool(t: ToolMode): void;
  setView(scale: number, offsetX: number, offsetY: number): void;

  selectZone(id?: Id): void;

  loadZones(): Promise<void>;

  addZone(): void;
  createZoneFromDraft(): void;

  updateZone(id: Id, patch: Partial<ParkingZone>): void;
  ensureZoneClockwise(id: Id): void;
  removeZone(id: Id): Promise<void>;
  saveZone(id: Id): Promise<void>;

  zoneDraftAddPoint(p: PxPoint): void;
  zoneDraftClear(): void;
};

export const useStore = create<State>((set, get) => ({
  apiBase: detectDefaultApiBase(),
  cameraId: '',
  labelerReturnRoute: 'cameras',
  image: undefined,
  cameraMeta: undefined,
  viewMode: 'cameras',
  tool: 'select',
  zones: [],
  zoneDraft: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  loading: false,

  setViewMode(mode) { set({ viewMode: mode }); },
  setCamera(id) { set({ cameraId: id }); },
  setLabelerReturnRoute(route) { set({ labelerReturnRoute: route }); },
  setImage(img) { set({ image: img }); },

  async loadCameraMeta(id) {
    try {
      const cam = await api.getCamera(id);
      set({ cameraMeta: cam });
    } catch (e: any) {
      set({ error: String(e) });
    }
  },

  async saveCamera(id, patch) {
    set({ loading: true, error: undefined, info: undefined });
    try {
      const updated = await api.updateCamera(id, patch);
      set({ cameraMeta: updated, info: 'camera-updated' });
    } catch (e: any) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  setTool(t) { set({ tool: t }); },
  setView(scale, offsetX, offsetY) { set({ scale, offsetX, offsetY }); },

  selectZone(id) { set({ activeZoneId: id }); },

  async loadZones() {
    set({ loading: true, error: undefined });
    try {
      const cid = get().cameraId ? parseInt(get().cameraId, 10) : undefined;
      const zones = await api.listZones(cid);

      if (zones.length === 0) {
        tmpZoneId = -1;
      }

      set({ zones });
    } catch (e: any) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },


  addZone() {
    set({ tool: 'drawZone', zoneDraft: [] });
  },

  createZoneFromDraft() {
    const draft = get().zoneDraft;
    if (!draft || draft.length !== 4) return;

    const { cameraId, zones } = get();
    const cid = parseInt(cameraId || '0', 10) || 0;

    const quad = clockwiseSort(draft as [PxPoint, PxPoint, PxPoint, PxPoint]) as [PxPoint, PxPoint, PxPoint, PxPoint];

    const z: ParkingZone = {
      id: tmpZoneId--,
      camera_id: cid,
      zone_type: 'standard',
      capacity: 1,
      pay: 0,
      image_quad: quad,
      points: quad.map(toGeo) as any
    };

    set({
      zones: [...zones, z],
      activeZoneId: z.id,
      tool: 'select',
      zoneDraft: null
    });
  },

  updateZone(id, patch) {
    set((s) => ({ zones: s.zones.map(z => String(z.id) === String(id) ? { ...z, ...patch } : z) }));
  },

  ensureZoneClockwise(id) {
    const z = get().zones.find(z => String(z.id) === String(id));
    if (!z) return;
    const sorted = clockwiseSort(z.image_quad);
    if (sorted) {
      const newPoints = z.points.map((pt, i) => ({ ...pt, x: sorted[i].x, y: sorted[i].y })) as any;
      get().updateZone(id, { image_quad: sorted, points: newPoints });
    }
  },

  async removeZone(id) {
    set({ loading: true });
    try {
      const isPersisted = (typeof id === 'number' && id > 0) || typeof id === 'string';
      if (isPersisted) await api.deleteZone(id);

      set((s) => {
        const nextZones = s.zones.filter(z => String(z.id) !== String(id));

        if (nextZones.length === 0) {
          tmpZoneId = -1;
        }

        return {
          zones: nextZones,
          activeZoneId: String(s.activeZoneId) === String(id) ? undefined : s.activeZoneId
        };
      });
    } finally {
      set({ loading: false });
    }
  },

  async saveZone(id) {
    const current = get().zones.find(z => String(z.id) === String(id));
    if (!current) {
      console.warn('saveZone: zone not found', id);
      return;
    }
    
    // Validate capacity before saving
    if (current.capacity < 1) {
      set({ error: 'Capacity must be at least 1. Please set capacity before saving.' });
      return;
    }
    
    get().ensureZoneClockwise(id);

    set({ loading: true, info: undefined, error: undefined });
    try {
      // New zones have negative IDs (temporary), existing zones have positive IDs from API
      const isNewZone = typeof id === 'number' && id < 0;
      
      let zoneToSave = current;
      if (isNewZone) {
        // For new zones, use camera coordinates as default if points don't have geo coordinates
        const cameraMeta = get().cameraMeta;
        const fallbackLatitude = cameraMeta?.latitude;
        const fallbackLongitude = cameraMeta?.longitude;
        if (hasCoordinates(fallbackLatitude, fallbackLongitude)) {
          const hasMissingCoords = current.points.some(p => p.latitude === null || p.longitude === null);
          if (hasMissingCoords) {
            zoneToSave = {
              ...current,
              points: current.points.map(p => ({
                ...p,
                latitude: p.latitude ?? fallbackLatitude,
                longitude: p.longitude ?? fallbackLongitude
              })) as any
            };
          }
        } else {
          throw new Error('Camera coordinates must be set first. Go to "Mark camera on map" and set coordinates.');
        }
      }

      if (isNewZone) {
        const resp = await api.createZone(zoneToSave);
        const zone_id: Id = resp?.zone_id ?? resp?.id ?? resp;
        set((s) => ({
          zones: s.zones.map(zz => String(zz.id) === String(id) ? { ...zoneToSave, id: zone_id } : zz),
          activeZoneId: zone_id,
          info: 'zone-created'
        }));
      } else {
        const updated = await api.updateZone(id, zoneToSave);
        set((s) => ({
          zones: s.zones.map(zz => String(zz.id) === String(id) ? { ...updated } : zz),
          info: 'zone-updated'
        }));
      }
    } catch (e: any) {
      console.error('saveZone error:', e);
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  zoneDraftAddPoint(p) {
    const cur = get().zoneDraft ?? [];
    const next = [...cur, p];
    if (next.length < 4) {
      set({ zoneDraft: next });
    } else if (next.length === 4) {
      // Auto-complete zone when 4 points are added
      set({ zoneDraft: next });
      get().createZoneFromDraft();
    }
  },
  zoneDraftClear() { set({ zoneDraft: null, tool: 'select' }); }
}));
