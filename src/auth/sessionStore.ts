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

type StoredSessionUser = SessionUser & {
  global_roles?: string[];
};

function normalizeGlobalRole(role?: string) {
  const normalized = role?.trim().toLowerCase().replace(/^globalrole\./, '');
  return normalized === 'admin' ? 'admin' : 'user';
}

function normalizeStoredUser(user?: StoredSessionUser): SessionUser | undefined {
  if (!user) return undefined;
  return {
    ...user,
    global_role: normalizeGlobalRole(user.global_role ?? user.global_roles?.[0]),
    permissions: user.permissions ?? [],
    partner_memberships: user.partner_memberships ?? []
  };
}

function loadStoredSession(): SessionSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionSnapshot & { user?: StoredSessionUser };
    return {
      ...parsed,
      user: normalizeStoredUser(parsed.user)
    };
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

function hasAdminRole(user?: SessionUser) {
  return normalizeGlobalRole(user?.global_role) === 'admin';
}

function normalizeCurrentPartnerId(snapshot: SessionSnapshot) {
  if (!snapshot.user) return undefined;

  const memberships = activeMembershipsOf(snapshot.user);
  const isAdmin = hasAdminRole(snapshot.user);

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
    global_role: 'admin',
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
    const normalizedUser = normalizeStoredUser(snapshot.user);
    const nextSnapshot = {
      accessToken: snapshot.accessToken,
      user: normalizedUser,
      currentPartnerId: normalizeCurrentPartnerId({
        ...snapshot,
        user: normalizedUser,
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
    if (hasAdminRole(user)) return true;
    if (user.permissions.includes(permission)) return true;
    return user.partner_memberships.some(m => m.is_active !== false && m.permissions.includes(permission));
  },

  isAdmin() {
    return hasAdminRole(get().user);
  }
}));
