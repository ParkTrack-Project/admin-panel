import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from './UiKit';
import { useFeedbackStore } from '@/feedback/feedbackStore';
import { fitYandexMap, yandexPoint, type YandexPoint } from '@/maps/yandex';
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

function fromYandexPoint(point: YandexPoint): MapPoint {
  return { lat: point[0], lng: point[1] };
}

function stopYandexEventPropagation(event: any) {
  if (typeof event?.stopPropagation === 'function') event.stopPropagation();
}

function YandexZoneGeometryMap({
  center,
  points,
  fitVersion,
  onMapClick,
  onPointsCommit,
  onInteractionStart
}: {
  center: YandexPoint;
  points: MapPoint[];
  fitVersion: number;
  onMapClick: (point: MapPoint) => void;
  onPointsCommit: (points: MapPoint[]) => void;
  onInteractionStart: () => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef(points);
  const { ymaps, map, loading, error } = useYandexMap(mapRef, { center, zoom: 16 });

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    if (!map || points.length > 0) return;
    map.setCenter(center, 16, { duration: 200 });
  }, [map, center, points.length]);

  useEffect(() => {
    const pointsToFit = pointsRef.current;
    if (!map || fitVersion === 0 || pointsToFit.length === 0) return;
    fitYandexMap(map, pointsToFit.map(toYandexPoint), 16);
  }, [map, fitVersion]);

  useEffect(() => {
    if (!map) return;
    const onClick = (event: any) => {
      const coords = event.get('coords') as YandexPoint | undefined;
      if (!coords) return;
      onMapClick(fromYandexPoint(coords));
    };
    map.events.add('click', onClick);
    return () => {
      map.events.remove('click', onClick);
    };
  }, [map, onMapClick]);

  useEffect(() => {
    if (!ymaps || !map) return;

    const collection = new ymaps.GeoObjectCollection();
    const isComplete = points.length === 4;
    const placemarks: any[] = [];
    let shape: any;
    let dragLine: any;

    const visibleLineCoordinates = (nextPoints: MapPoint[]) => nextPoints.map(toYandexPoint);
    const dragLineCoordinates = (nextPoints: MapPoint[]) => {
      const coordinates = visibleLineCoordinates(nextPoints);
      return isComplete && coordinates.length > 0
        ? [...coordinates, coordinates[0]]
        : coordinates;
    };

    const updateMapGeometryFromDrag = (nextPoints: MapPoint[], source?: any) => {
      const coordinates = visibleLineCoordinates(nextPoints);
      if (shape && shape !== source) {
        shape.geometry.setCoordinates(isComplete ? [coordinates] : coordinates);
      }
      if (dragLine && dragLine !== source) {
        dragLine.geometry.setCoordinates(dragLineCoordinates(nextPoints));
      }
      placemarks.forEach((placemark, index) => {
        if (placemark === source) return;
        const point = nextPoints[index];
        if (point) {
          placemark.geometry.setCoordinates(toYandexPoint(point));
        }
      });
    };

    const pointsFromDraggedGeometry = (geoObject: any) => {
      const coordinates = geoObject.geometry.getCoordinates();
      const line = Array.isArray(coordinates?.[0]?.[0])
        ? coordinates[0]
        : coordinates;
      return line
        .slice(0, points.length)
        .map((coordinate: YandexPoint) => fromYandexPoint(coordinate));
    };

    const onDragStart = (event: any) => {
      stopYandexEventPropagation(event);
      onInteractionStart();
      map.behaviors.disable(['drag']);
    };

    const onShapeDrag = (source: any) => {
      const latest = pointsFromDraggedGeometry(source);
      if (latest.length !== points.length) return;
      updateMapGeometryFromDrag(latest, source);
    };

    const onPointDrag = (pointIndex: number, placemark: any) => {
      const latest = points.map(point => ({ ...point }));
      const current = placemark.geometry.getCoordinates() as YandexPoint | undefined;
      if (!current) return;
      latest[pointIndex] = fromYandexPoint(current);
      updateMapGeometryFromDrag(latest, placemark);
    };

    const onShapeDragEnd = (source: any) => {
      const latest = pointsFromDraggedGeometry(source);
      if (latest.length === points.length) {
        updateMapGeometryFromDrag(latest, source);
        onPointsCommit(latest);
      }
      map.behaviors.enable(['drag']);
      onInteractionStart();
    };

    const onPointDragEnd = (pointIndex: number, placemark: any) => {
      const latest = points.map(point => ({ ...point }));
      const current = placemark.geometry.getCoordinates() as YandexPoint | undefined;
      if (current) {
        latest[pointIndex] = fromYandexPoint(current);
        updateMapGeometryFromDrag(latest, placemark);
        onPointsCommit(latest);
      }
      map.behaviors.enable(['drag']);
      onInteractionStart();
    };

    if (points.length >= 2) {
      const coordinates = points.map(toYandexPoint);
      shape = isComplete
        ? new ymaps.Polygon(
          [coordinates],
          {},
          {
            strokeColor: '#ff7a45',
            strokeOpacity: 0.92,
            strokeWidth: 2,
            fillColor: '#ff7a453d',
            fillOpacity: 0.24,
            zIndex: 250,
            draggable: true
          }
        )
        : new ymaps.Polyline(
          coordinates,
          {},
          {
            strokeColor: '#ff7a45',
            strokeOpacity: 0.92,
            strokeWidth: 2,
            strokeStyle: 'dash',
            zIndex: 250,
            draggable: true
          }
        );

      dragLine = new ymaps.Polyline(
        dragLineCoordinates(points),
        {},
        {
          strokeColor: '#ff7a45',
          strokeOpacity: 0.01,
          strokeWidth: 22,
          zIndex: 200,
          cursor: 'move',
          draggable: true
        }
      );

      shape.events.add('dragstart', onDragStart);
      shape.events.add('drag', () => onShapeDrag(shape));
      shape.events.add('dragend', () => onShapeDragEnd(shape));
      dragLine.events.add('dragstart', onDragStart);
      dragLine.events.add('drag', () => onShapeDrag(dragLine));
      dragLine.events.add('dragend', () => onShapeDragEnd(dragLine));
      collection.add(shape);
      collection.add(dragLine);
    }

    points.forEach((point, index) => {
      const placemark = new ymaps.Placemark(
        toYandexPoint(point),
        {
          hintContent: `Точка ${index + 1}`
        },
        {
          preset: 'islands#circleIcon',
          iconColor: '#ffd43b',
          zIndex: 1000,
          zIndexHover: 1100,
          zIndexActive: 1200,
          cursor: 'move',
          draggable: true
        }
      );

      placemark.events.add('dragstart', onDragStart);
      placemark.events.add('drag', () => onPointDrag(index, placemark));
      placemark.events.add('dragend', () => onPointDragEnd(index, placemark));
      placemarks.push(placemark);
      collection.add(placemark);
    });

    map.geoObjects.add(collection);
    return () => {
      map.behaviors.enable(['drag']);
      map.geoObjects.remove(collection);
    };
  }, [ymaps, map, points, onInteractionStart, onMapClick, onPointsCommit]);

  return (
    <div className="yandex-map-host" ref={mapRef}>
      {loading && <div className="map-status-overlay">Загрузка Яндекс.Карт...</div>}
      {error && <div className="map-status-overlay error">{error}</div>}
    </div>
  );
}

export default function ZoneMapSelector() {
  const notifySuccess = useFeedbackStore(state => state.success);
  const notifyError = useFeedbackStore(state => state.error);
  const notifyInfo = useFeedbackStore(state => state.info);
  const zones = useStore(state => state.zones);
  const activeZoneId = useStore(state => state.activeZoneId);
  const setViewMode = useStore(state => state.setViewMode);
  const cameraMeta = useStore(state => state.cameraMeta);
  const updateZone = useStore(state => state.updateZone);
  const saveZone = useStore(state => state.saveZone);
  const zone = zones.find(z => String(z.id) === String(activeZoneId));

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [fitVersion, setFitVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const suppressMapClickUntilRef = useRef(0);
  const lastFittedZoneIdRef = useRef<string | undefined>();

  useEffect(() => {
    if (!zone) {
      setPoints([]);
      lastFittedZoneIdRef.current = undefined;
      return;
    }
    const zoneId = String(zone.id);
    const existing = zone.points
      .filter(point => typeof point.latitude === 'number' && typeof point.longitude === 'number')
      .slice(0, 4);
    const uniqueCoords = new Set(existing.map(point => `${point.latitude},${point.longitude}`));

    if (existing.length === 4 && uniqueCoords.size > 1) {
      setPoints(existing.map(point => ({ lat: point.latitude!, lng: point.longitude! })));
      if (lastFittedZoneIdRef.current !== zoneId) {
        lastFittedZoneIdRef.current = zoneId;
        setFitVersion(version => version + 1);
      }
    } else {
      setPoints([]);
      lastFittedZoneIdRef.current = zoneId;
    }
  }, [zone]);

  const center = useMemo<YandexPoint>(() => {
    if (points.length > 0) {
      const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
      const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
      return yandexPoint(lat, lng);
    }
    if (hasCoordinates(cameraMeta?.latitude, cameraMeta?.longitude)) {
      return yandexPoint(cameraMeta.latitude, cameraMeta.longitude);
    }
    return yandexPoint(59.9386, 30.3141);
  }, [points, cameraMeta]);

  function onMapClick(pos: MapPoint) {
    if (Date.now() < suppressMapClickUntilRef.current) return;
    if (points.length >= 4) return;
    setPoints(prev => [...prev, pos]);
    setFitVersion(version => version + 1);
  }

  function suppressMapClick() {
    suppressMapClickUntilRef.current = Date.now() + 350;
  }

  function syncZonePoints(nextPoints: MapPoint[]) {
    if (!zone || nextPoints.length !== 4) return;
    const updatedZonePoints = zone.points.map((point, index) => {
      if (index < 4) {
        const nextPoint = nextPoints[index];
        return { ...point, latitude: nextPoint.lat, longitude: nextPoint.lng };
      }
      return point;
    }) as any;
    updateZone(zone.id, { points: updatedZonePoints });
  }

  function commitMapPoints(nextPoints: MapPoint[]) {
    setPoints(nextPoints);
    syncZonePoints(nextPoints);
  }

  function onReset() {
    setPoints([]);
    if (zone) {
      const resetPoints = zone.points.map(point => {
        return { ...point, latitude: null, longitude: null };
      }) as any;
      updateZone(zone.id, { points: resetPoints });
    }
    notifyInfo('Геометрия зоны на карте сброшена.');
  }

  async function onSave() {
    if (!zone) return;
    if (points.length !== 4) {
      const message = 'Необходимо отметить все 4 точки на карте перед сохранением.';
      setError(message);
      notifyError(message);
      return;
    }
    try {
      setLoading(true);
      setError(undefined);

      const updatedPoints = zone.points.map((point, index) => {
        if (index < 4) {
          const nextPoint = points[index];
          return { ...point, latitude: nextPoint.lat, longitude: nextPoint.lng };
        }
        return point;
      }) as any;

      updateZone(zone.id, { points: updatedPoints });
      const ok = await saveZone(zone.id);
      if (!ok) {
        const message = useStore.getState().error || 'Не удалось сохранить геометрию зоны.';
        setError(message);
        notifyError(message);
        return;
      }

      notifySuccess('Геометрия зоны сохранена.');
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
        <h4>Отметить зону на карте</h4>
        {!zone && <div className="small">Сначала выберите зону в списке.</div>}
        {zone && (
          <div className="small" style={{ marginBottom: 8 }}>
            <div>Zone ID: {String(zone.id)}</div>
            <div>Тип: {zone.zone_type}</div>
            <div>Вместимость: {zone.capacity}</div>
          </div>
        )}
        {loading && <div className="small">Сохранение...</div>}
        {error && <div className="small" style={{ color: '#ff6b6b' }}>{error}</div>}

        <div className="small" style={{ marginTop: 8 }}>
          Кликните 4 точки на карте по часовой стрелке. После этого можно двигать точки, линии или перетащить всю зону.
        </div>

        <div className="labeler-action-grid compact">
          <Button onClick={onSave} disabled={!zone || loading}>Сохранить</Button>
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
          <Button variant="ghost" onClick={onReset} disabled={!zone}>Сбросить</Button>
        </div>
      </div>

      <div className="canvas">
        <YandexZoneGeometryMap
          center={center}
          points={points}
          fitVersion={fitVersion}
          onMapClick={onMapClick}
          onPointsCommit={commitMapPoints}
          onInteractionStart={suppressMapClick}
        />
      </div>
    </>
  );
}
