import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { api, Camera } from '@/api/client';
import { Button, Field, Input } from './UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { yandexPoint, type YandexPoint } from '@/maps/yandex';
import { useYandexMap } from '@/maps/useYandexMap';

type MapPoint = {
  lat: number;
  lng: number;
};

function hasCoordinates(latitude?: number | null, longitude?: number | null): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && typeof longitude === 'number'
    && Number.isFinite(longitude);
}

function toYandexPoint(point: MapPoint): YandexPoint {
  return yandexPoint(point.lat, point.lng);
}

function CameraLocationMap({
  center,
  point,
  camera,
  onPointChange
}: {
  center: YandexPoint;
  point: MapPoint | null;
  camera: Camera | null;
  onPointChange: (point: MapPoint) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const { ymaps, map, loading, error } = useYandexMap(mapRef, { center, zoom: 15 });

  useEffect(() => {
    if (!map) return;
    if (point) {
      map.setCenter(toYandexPoint(point), 17, { duration: 200 });
      return;
    }
    if (hasCoordinates(camera?.latitude, camera?.longitude)) {
      map.setCenter(yandexPoint(camera.latitude, camera.longitude), 17, { duration: 200 });
    }
  }, [map, point, camera?.camera_id]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: any) => {
      const coords = event.get('coords') as YandexPoint;
      onPointChange({ lat: coords[0], lng: coords[1] });
    };
    map.events.add('click', onClick);
    return () => {
      map.events.remove('click', onClick);
    };
  }, [map, onPointChange]);

  useEffect(() => {
    if (!ymaps || !map || !point) return;
    const placemark = new ymaps.Placemark(
      toYandexPoint(point),
      {
        hintContent: 'Положение камеры'
      },
      {
        preset: 'islands#circleDotIcon',
        iconColor: '#ff7a45',
        draggable: true
      }
    );

    placemark.events.add('dragend', () => {
      const coords = placemark.geometry.getCoordinates() as YandexPoint;
      onPointChange({ lat: coords[0], lng: coords[1] });
    });

    map.geoObjects.add(placemark);
    return () => {
      map.geoObjects.remove(placemark);
    };
  }, [ymaps, map, point, onPointChange]);

  return (
    <div className="yandex-map-host" ref={mapRef}>
      {loading && <div className="map-status-overlay">Загрузка Яндекс.Карт...</div>}
      {error && <div className="map-status-overlay error">{error}</div>}
    </div>
  );
}

export default function CameraMapSelector() {
  const { cameraId, setViewMode } = useStore();
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!cameraId) {
        setCamera(null);
        setPoint(null);
        setLatInput('');
        setLngInput('');
        return;
      }
      setLoading(true);
      setError(undefined);
      try {
        const cam = await api.getCamera(parseInt(cameraId, 10));
        if (cancelled) return;
        setCamera(cam);
        if (hasCoordinates(cam.latitude, cam.longitude)) {
          setPoint({ lat: cam.latitude, lng: cam.longitude });
          setLatInput(cam.latitude.toString());
          setLngInput(cam.longitude.toString());
        } else {
          setPoint(null);
          setLatInput('');
          setLngInput('');
        }
    } catch (e: any) {
      if (!cancelled) {
          const message = String(e?.message || e);
          setError(message);
          notifyError(message);
      }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cameraId]);

  useEffect(() => {
    if (point) {
      setLatInput(point.lat.toString());
      setLngInput(point.lng.toString());
    }
  }, [point]);

  function handleLatInputChange(value: string) {
    setLatInput(value);
    const lat = parseFloat(value);
    if (!isNaN(lat) && lat >= -90 && lat <= 90) {
      const lng = point ? point.lng : (parseFloat(lngInput) || 30.3141);
      setPoint({ lat, lng });
    }
  }

  function handleLngInputChange(value: string) {
    setLngInput(value);
    const lng = parseFloat(value);
    if (!isNaN(lng) && lng >= -180 && lng <= 180) {
      const lat = point ? point.lat : (parseFloat(latInput) || 59.9386);
      setPoint({ lat, lng });
    }
  }

  const center = useMemo<YandexPoint>(() => {
    if (point) return toYandexPoint(point);
    if (hasCoordinates(camera?.latitude, camera?.longitude)) {
      return yandexPoint(camera.latitude, camera.longitude);
    }
    return yandexPoint(59.9386, 30.3141);
  }, [camera, point]);

  async function onSave() {
    if (!cameraId || !point) return;
    try {
      setLoading(true);
      setError(undefined);
      await api.updateCamera(parseInt(cameraId, 10), {
        latitude: point.lat,
        longitude: point.lng
      });
      notifySuccess('Положение камеры сохранено.');
      setViewMode('labeler');
    } catch (e: any) {
      const message = String(e?.message || e);
      setError(message);
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }

  function onCancel() {
    setViewMode('labeler');
  }

  return (
    <>
      <div className="sidebar">
        <h4>Отметить камеру на карте</h4>
        {!cameraId && <div className="small">Сначала выберите Camera ID.</div>}
        {camera && (
          <div className="small" style={{ marginBottom: 8 }}>
            <div>Camera ID: {camera.camera_id}</div>
            <div>Название: {camera.title}</div>
            <div>Текущие координаты: {camera.latitude?.toFixed(6)}, {camera.longitude?.toFixed(6)}</div>
          </div>
        )}
        {loading && <div className="small">Загрузка...</div>}
        {error && <div className="small" style={{ color: '#ff6b6b' }}>{error}</div>}

        <div className="small" style={{ marginTop: 8, marginBottom: 12 }}>
          Нажмите на карту, чтобы выбрать расположение камеры, или введите координаты вручную:
        </div>

        <Field label="Latitude">
          <Input
            type="number"
            step="any"
            value={latInput}
            onChange={e => handleLatInputChange(e.target.value)}
            placeholder="59.9386"
          />
        </Field>

        <Field label="Longitude">
          <Input
            type="number"
            step="any"
            value={lngInput}
            onChange={e => handleLngInputChange(e.target.value)}
            placeholder="30.3141"
          />
        </Field>

        <div className="labeler-action-grid compact">
          <Button onClick={onSave} disabled={!point || loading}>Сохранить</Button>
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        </div>
      </div>

      <div className="canvas">
        <CameraLocationMap
          center={center}
          point={point}
          camera={camera}
          onPointChange={setPoint}
        />
      </div>
    </>
  );
}
