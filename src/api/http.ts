import { useRequestLog } from './requestLog';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type Config = { baseUrl: string; token?: string };

let cfg: Config = { baseUrl: 'https://api.parktrack.live' };
let unauthorizedHandler: (() => void) | undefined;

type ValidationIssue = {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
  ctx?: Record<string, any>;
};

export const apiConfig = {
  set(baseUrl: string, token?: string) {
    cfg = { baseUrl, token };
  },
  setUnauthorizedHandler(handler?: () => void) {
    unauthorizedHandler = handler;
  },
  get() {
    return cfg;
  }
};

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

function formatFieldName(loc?: Array<string | number>) {
  const field = loc?.[loc.length - 1];
  switch (field) {
    case 'email':
      return 'email';
    case 'password':
    case 'new_password':
    case 'old_password':
    case 'current_password':
      return 'пароль';
    case 'full_name':
      return 'имя';
    case 'phone':
      return 'телефон';
    case 'slug':
      return 'slug';
    default:
      return typeof field === 'string' ? field : 'поле';
  }
}

function formatValidationIssue(issue: ValidationIssue) {
  const fieldName = formatFieldName(issue.loc);
  const issueType = issue.type ?? '';

  if (issueType.includes('missing')) {
    return `Заполните поле "${fieldName}".`;
  }

  if (issueType.includes('string_too_short')) {
    const minLength = issue.ctx?.min_length;
    if (fieldName === 'пароль' && typeof minLength === 'number') {
      return `В пароле должно быть не менее ${minLength} символов.`;
    }
    if (typeof minLength === 'number') {
      return `Поле "${fieldName}" должно содержать не менее ${minLength} символов.`;
    }
  }

  if (issueType.includes('value_error') && fieldName === 'email') {
    return 'Введите корректный email.';
  }

  if (issue.msg) {
    return issue.msg;
  }

  return `Проверьте поле "${fieldName}".`;
}

function formatApiError(data: any, status: number) {
  const knownMessage = normalizeServerMessage(
    data?.detail?.error_description
      || data?.error_description
      || data?.error
      || data?.message
  );

  const detail = data?.detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = Array.from(new Set(detail.map(formatValidationIssue).filter(Boolean)));
    return messages.join(' ');
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (detail?.error_description) {
    return knownMessage || detail.error_description;
  }

  return knownMessage || `HTTP ${status}`;
}

function normalizeServerMessage(message?: string) {
  if (!message) return undefined;

  const normalized = message.trim();

  const exactMap: Record<string, string> = {
    'User with this email already exists': 'Пользователь с таким email уже существует.',
    'Invalid login or password': 'Неверный логин или пароль.',
    'Account is disabled': 'Аккаунт отключён.',
    'Old password is incorrect': 'Старый пароль указан неверно.',
    'Email already in use': 'Этот email уже используется.',
    'Missing or invalid access token': 'Сессия недействительна. Войдите снова.',
    'Token has expired': 'Срок действия сессии истёк. Войдите снова.',
    'User not found': 'Пользователь не найден.',
    'Partner not found': 'Партнёр не найден.',
    'Membership not found': 'Участник не найден.',
    'Source not found': 'Источник не найден.',
    'Camera not found': 'Камера не найдена.',
    'Zone not found': 'Зона не найдена.',
    'Observation not found': 'Наблюдение не найдено.',
    'Forecast not found': 'Прогноз не найден.'
  };

  if (exactMap[normalized]) {
    return exactMap[normalized];
  }

  if (normalized.startsWith('Missing permissions:')) {
    return 'Недостаточно прав для выполнения этого действия.';
  }

  if (normalized.startsWith('Unknown role:')) {
    return 'Передана неизвестная роль пользователя.';
  }

  return normalized;
}

export async function request<T>(method: HttpMethod, path: string, body?: any): Promise<T> {
  const url = `${cfg.baseUrl}${path}`;
  const isDemoToken = cfg.token === 'dev-admin-token';
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (cfg.token && !isDemoToken) headers.Authorization = `Bearer ${cfg.token}`;

  const id = crypto.randomUUID();
  useRequestLog.getState().add({ id, ts: Date.now(), method, url, headers, body });

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Не удалось подключиться к API. Проверьте доступность сервера.');
  }

  const ct = res.headers.get('content-type') || '';
  let data: any = undefined;
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch {}
  } else {
    try { data = await res.text(); } catch {}
  }

  useRequestLog.getState().add({ id: id + '-resp', ts: Date.now(), method, url, status: res.status, response: data });

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler && !path.startsWith('/auth/') && !isDemoToken) {
      unauthorizedHandler();
    }
    const errorMessage = formatApiError(data, res.status);
    throw new Error(errorMessage);
  }

  return data as T;
}

export async function requestBlob(path: string): Promise<{ blob: Blob; headers: Headers }> {
  const url = `${cfg.baseUrl}${path}`;
  const isDemoToken = cfg.token === 'dev-admin-token';
  const headers: Record<string, string> = {};
  if (cfg.token && !isDemoToken) headers.Authorization = `Bearer ${cfg.token}`;

  const id = crypto.randomUUID();
  useRequestLog.getState().add({ id, ts: Date.now(), method: 'GET', url, headers });

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch {
    throw new Error('Не удалось подключиться к API. Проверьте доступность сервера.');
  }

  useRequestLog.getState().add({
    id: id + '-resp',
    ts: Date.now(),
    method: 'GET',
    url,
    status: res.status,
    response: `[Binary data, ${res.headers.get('content-length') || 'unknown'} bytes]`
  });

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler && !path.startsWith('/auth/') && !isDemoToken) {
      unauthorizedHandler();
    }
    let data: any = undefined;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => undefined);
    } else {
      data = await res.text().catch(() => undefined);
    }
    throw new Error(typeof data === 'string' ? data : formatApiError(data, res.status));
  }

  return {
    blob: await res.blob(),
    headers: res.headers
  };
}
