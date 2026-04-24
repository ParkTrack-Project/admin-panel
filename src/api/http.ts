import { useRequestLog } from './requestLog';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type Config = { baseUrl: string; token?: string };

let cfg: Config = { baseUrl: 'https://api.parktrack.live' };
let unauthorizedHandler: (() => void) | undefined;

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

export async function request<T>(method: HttpMethod, path: string, body?: any): Promise<T> {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const id = crypto.randomUUID();
  useRequestLog.getState().add({ id, ts: Date.now(), method, url, headers, body });

  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });

  const ct = res.headers.get('content-type') || '';
  let data: any = undefined;
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch {}
  } else {
    try { data = await res.text(); } catch {}
  }

  useRequestLog.getState().add({ id: id + '-resp', ts: Date.now(), method, url, status: res.status, response: data });

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler && !path.startsWith('/auth/')) {
      unauthorizedHandler();
    }
    const errorMessage = data?.error_description || data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

export async function requestBlob(path: string): Promise<{ blob: Blob; headers: Headers }> {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {};
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

  const id = crypto.randomUUID();
  useRequestLog.getState().add({ id, ts: Date.now(), method: 'GET', url, headers });

  const res = await fetch(url, { method: 'GET', headers });

  useRequestLog.getState().add({
    id: id + '-resp',
    ts: Date.now(),
    method: 'GET',
    url,
    status: res.status,
    response: `[Binary data, ${res.headers.get('content-length') || 'unknown'} bytes]`
  });

  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler && !path.startsWith('/auth/')) {
      unauthorizedHandler();
    }
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(errorText || `HTTP ${res.status}`);
  }

  return {
    blob: await res.blob(),
    headers: res.headers
  };
}
