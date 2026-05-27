export type YandexMapsApi = any;
export type YandexMapInstance = any;
export type YandexGeoObject = any;
export type YandexPoint = [number, number];

declare global {
  interface Window {
    ymaps?: YandexMapsApi;
    __parktrackYandexMapsPromise?: Promise<YandexMapsApi>;
  }
}

const SCRIPT_ID = 'parktrack-yandex-maps-api';

function getYandexMapsApiKey() {
  return import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim()
    || import.meta.env.VITE_YMAPS_API_KEY?.trim()
    || '';
}

function buildYandexMapsUrl() {
  const params = new URLSearchParams({
    lang: 'ru_RU',
    load: 'package.full'
  });
  const apiKey = getYandexMapsApiKey();
  if (apiKey) {
    params.set('apikey', apiKey);
  }
  return `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
}

function waitYandexReady() {
  return new Promise<YandexMapsApi>((resolve, reject) => {
    if (!window.ymaps) {
      reject(new Error('Yandex Maps API script loaded, but ymaps is unavailable.'));
      return;
    }
    window.ymaps.ready(() => resolve(window.ymaps));
  });
}

export function loadYandexMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Yandex Maps API can be loaded only in browser.'));
  }

  if (window.ymaps) {
    return waitYandexReady();
  }

  if (window.__parktrackYandexMapsPromise) {
    return window.__parktrackYandexMapsPromise;
  }

  window.__parktrackYandexMapsPromise = new Promise<YandexMapsApi>((resolve, reject) => {
    const resolveReady = () => {
      waitYandexReady().then(resolve).catch(reject);
    };

    const rejectLoad = () => {
      reject(new Error('Не удалось загрузить Яндекс.Карты. Проверьте сеть и VITE_YANDEX_MAPS_API_KEY.'));
    };

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', resolveReady, { once: true });
      existingScript.addEventListener('error', rejectLoad, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = buildYandexMapsUrl();
    script.addEventListener('load', resolveReady, { once: true });
    script.addEventListener('error', rejectLoad, { once: true });
    document.head.appendChild(script);
  });

  return window.__parktrackYandexMapsPromise;
}

export function yandexPoint(latitude: number, longitude: number): YandexPoint {
  return [latitude, longitude];
}

export function hasYandexPoint(value?: YandexPoint | null): value is YandexPoint {
  return Boolean(
    value
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
  );
}

export function yandexBounds(points: YandexPoint[]): [YandexPoint, YandexPoint] | null {
  if (!points.length) return null;

  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];

  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  return [[minLat, minLng], [maxLat, maxLng]];
}

export function fitYandexMap(map: YandexMapInstance, points: YandexPoint[], fallbackZoom = 16) {
  if (!points.length) return;

  if (points.length === 1) {
    map.setCenter(points[0], fallbackZoom, { duration: 200 });
    return;
  }

  const bounds = yandexBounds(points);
  if (!bounds) return;
  map.setBounds(bounds, {
    checkZoomRange: true,
    duration: 200,
    zoomMargin: 42
  });
}
