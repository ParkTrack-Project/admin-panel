const globalRoleLabels: Record<string, string> = {
  admin: 'Администратор',
  user: 'Пользователь'
};

const partnerRoleLabels: Record<string, string> = {
  partner_owner: 'Владелец партнёра',
  partner_admin: 'Администратор партнёра',
  partner_manager: 'Менеджер партнёра',
  partner_analyst: 'Аналитик партнёра',
  partner_viewer: 'Наблюдатель партнёра'
};

const accessScopeLabels: Record<string, string> = {
  none: 'Нет доступа',
  own: 'Свои',
  assigned: 'Назначенные',
  own_or_assigned: 'Свои и назначенные',
  partner_all: 'Весь партнёр',
  global_all: 'Все партнёры'
};

export function formatGlobalRole(role?: string) {
  return globalRoleLabels[role ?? ''] ?? role ?? '—';
}

export function formatPartnerRole(role?: string) {
  return partnerRoleLabels[role ?? ''] ?? role ?? '—';
}

export function formatAccessScope(scope?: string) {
  return accessScopeLabels[scope ?? ''] ?? scope ?? '—';
}
