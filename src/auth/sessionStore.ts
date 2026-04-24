import { create } from 'zustand';
import type { PartnerMembership, SessionUser } from '@/types';

const STORAGE_KEY = 'parktrack.session.v1';

type SessionSnapshot = {
  accessToken?: string;
  user?: SessionUser;
};

type SessionState = SessionSnapshot & {
  hydrated: boolean;
  validating: boolean;
  setSession: (snapshot: SessionSnapshot) => void;
  setValidating: (validating: boolean) => void;
  startDemoSession: () => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  isAdmin: () => boolean;
};

function loadStoredSession(): SessionSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as SessionSnapshot : {};
  } catch {
    return {};
  }
}

function storeSession(snapshot: SessionSnapshot) {
  if (!snapshot.accessToken || !snapshot.user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

const adminPermissions = [
  'users.me.view',
  'users.me.update',
  'users.password.update',
  'map.view',
  'zones.view',
  'zones.create',
  'zones.update',
  'zones.delete',
  'cameras.view',
  'cameras.create',
  'cameras.update',
  'cameras.delete',
  'sources.view',
  'admin.users.view',
  'admin.users.manage',
  'admin.partners.view',
  'admin.partners.manage',
  'admin.system.view',
  'admin.system.manage',
  'admin.monitoring.view'
];

const demoMembership: PartnerMembership = {
  partner_id: 10,
  role: 'partner_admin',
  permissions: [
    'partner_members.view',
    'partner_members.update',
    'partner_access.manage',
    'sources.view',
    'cameras.view',
    'cameras.create',
    'cameras.update',
    'cameras.delete',
    'zones.view',
    'zones.create',
    'zones.update',
    'zones.delete'
  ],
  read_scope: 'partner_all',
  write_scope: 'partner_all',
  delete_scope: 'partner_all',
  is_active: true
};

function buildDemoUser(): SessionUser {
  return {
    user_id: 1,
    email: 'admin@parktrack.local',
    full_name: 'ParkTrack Admin',
    global_roles: ['admin'],
    permissions: adminPermissions,
    partner_memberships: [demoMembership]
  };
}

const initialSession = loadStoredSession();

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialSession,
  hydrated: true,
  validating: false,

  setSession(snapshot) {
    storeSession(snapshot);
    set(snapshot);
  },

  setValidating(validating) {
    set({ validating });
  },

  startDemoSession() {
    const snapshot = {
      accessToken: 'dev-admin-token',
      user: buildDemoUser()
    };
    storeSession(snapshot);
    set(snapshot);
  },

  logout() {
    storeSession({});
    set({ accessToken: undefined, user: undefined, validating: false });
  },

  hasPermission(permission) {
    const user = get().user;
    if (!user) return false;
    if (user.global_roles.includes('admin')) return true;
    if (user.permissions.includes(permission)) return true;
    return user.partner_memberships.some(m => m.is_active !== false && m.permissions.includes(permission));
  },

  isAdmin() {
    return get().user?.global_roles.includes('admin') ?? false;
  }
}));
