import { RefObject, useEffect, useMemo, useState } from 'react';
import { loadYandexMaps, YandexMapInstance, YandexMapsApi, YandexPoint } from './yandex';

type UseYandexMapOptions = {
  center: YandexPoint;
  zoom: number;
  controls?: string[];
};

type YandexMapState = {
  ymaps?: YandexMapsApi;
  map?: YandexMapInstance;
  loading: boolean;
  error?: string;
};

export function useYandexMap(
  containerRef: RefObject<HTMLDivElement>,
  { center, zoom, controls = ['zoomControl'] }: UseYandexMapOptions
) {
  const [state, setState] = useState<YandexMapState>({ loading: true });
  const centerKey = useMemo(() => center.join(','), [center]);

  useEffect(() => {
    let cancelled = false;
    let map: YandexMapInstance | undefined;

    setState({ loading: true });
    loadYandexMaps()
      .then(ymaps => {
        if (cancelled || !containerRef.current) return;
        map = new ymaps.Map(containerRef.current, {
          center,
          zoom,
          controls
        });
        map.behaviors.enable(['drag', 'scrollZoom', 'dblClickZoom', 'multiTouch']);
        setState({ ymaps, map, loading: false });
      })
      .catch(error => {
        if (!cancelled) {
          setState({
            loading: false,
            error: String(error?.message || error)
          });
        }
      });

    return () => {
      cancelled = true;
      if (map) {
        map.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (!state.map) return;
    state.map.setCenter(center, zoom, { duration: 200 });
  }, [state.map, centerKey, zoom]);

  return state;
}
