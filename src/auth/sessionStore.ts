import { create } from 'zustand';
import type { PartnerMembership, SessionUser } from '@/types';

const STORAGE_KEY = 'parktrack.session.v1';

type SessionSnapshot = {
  accessToken?: string;
  user?: SessionUser;
  currentPartnerId?: number;
};

type SessionState = SessionSnapshot & {
  hydrated: boolean;
  validating: boolean;
  setSession: (snapshot: SessionSnapshot) => void;
  setCurrentPartnerId: (partnerId?: number) => void;
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

function activeMembershipsOf(user?: SessionUser) {
  return (user?.partner_memberships ?? []).filter(membership => membership.is_active !== false);
}

function normalizeCurrentPartnerId(snapshot: SessionSnapshot) {
  if (!snapshot.user) return undefined;

  const memberships = activeMembershipsOf(snapshot.user);
  const isAdmin = snapshot.user.global_roles.includes('admin');

  if (snapshot.currentPartnerId !== undefined) {
    const hasMembership = memberships.some(membership => membership.partner_id === snapshot.currentPartnerId);
    if (hasMembership || isAdmin) {
      return snapshot.currentPartnerId;
    }
  }

  if (isAdmin) {
    return undefined;
  }

  return memberships[0]?.partner_id;
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
  currentPartnerId: normalizeCurrentPartnerId(initialSession),
  hydrated: true,
  validating: false,

  setSession(snapshot) {
    const nextSnapshot = {
      accessToken: snapshot.accessToken,
      user: snapshot.user,
      currentPartnerId: normalizeCurrentPartnerId({
        ...snapshot,
        currentPartnerId: snapshot.currentPartnerId ?? get().currentPartnerId
      })
    };
    storeSession(nextSnapshot);
    set(nextSnapshot);
  },

  setCurrentPartnerId(partnerId) {
    const user = get().user;
    const nextSnapshot = {
      accessToken: get().accessToken,
      user,
      currentPartnerId: normalizeCurrentPartnerId({
        accessToken: get().accessToken,
        user,
        currentPartnerId: partnerId
      })
    };
    storeSession(nextSnapshot);
    set({ currentPartnerId: nextSnapshot.currentPartnerId });
  },

  setValidating(validating) {
    set({ validating });
  },

  startDemoSession() {
    const snapshot = {
      accessToken: 'dev-admin-token',
      user: buildDemoUser(),
      currentPartnerId: undefined
    };
    storeSession(snapshot);
    set(snapshot);
  },

  logout() {
    storeSession({});
    set({ accessToken: undefined, user: undefined, currentPartnerId: undefined, validating: false });
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
