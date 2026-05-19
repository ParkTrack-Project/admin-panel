import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from './UiKit';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMapEvents, useMap } from 'react-leaflet';
import L, { LatLng, LatLngExpression } from 'leaflet';
import { useFeedbackStore } from '@/feedback/feedbackStore';

type LatLngTuple = [number, number];

const zonePointIcon = L.divIcon({
  className: 'zone-point-marker',
  html: '<div class="zone-point-marker-hit"><div class="zone-point-marker-dot"></div></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function hasCoordinates(latitude?: number | null, longitude?: number | null): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && typeof longitude === 'number'
    && Number.isFinite(longitude);
}

function ClickHandler({ onClick }: { onClick: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    }
  });
  return null;
}

function MapAutoFit({ points, fitVersion }: { points: LatLng[]; fitVersion: number }) {
  const map = useMap();

  useEffect(() => {
    if (fitVersion === 0) return;
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.2));
  }, [fitVersion, map]);

  return null;
}

function DraggableZoneShape({
  points,
  onMove,
  onMoveEnd
}: {
  points: LatLng[];
  onMove: (points: LatLng[]) => void;
  onMoveEnd: (points: LatLng[]) => void;
}) {
  const map = useMap();
  const line = points.map(p => [p.lat, p.lng] as LatLngTuple);
  const isComplete = points.length === 4;
  const dragLine = isComplete ? [...line, line[0]] : line;

  function onMouseDown(e: any) {
    if (points.length < 2) return;
    L.DomEvent.stop(e);
    map.dragging.disable();

    const start = e.latlng as LatLng;
    const origin = points.map(point => new L.LatLng(point.lat, point.lng));
    let latest = origin;

    const onMouseMove = (moveEvent: any) => {
      const current = moveEvent.latlng as LatLng;
      const latDelta = current.lat - start.lat;
      const lngDelta = current.lng - start.lng;
      latest = origin.map(point => new L.LatLng(point.lat + latDelta, point.lng + lngDelta));
      onMove(latest);
    };

    const onMouseUp = () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragging.enable();
      onMoveEnd(latest);
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
  }

  return (
    <>
      {isComplete ? (
        <Polygon
          key={`polygon-${points.map(p => `${p.lat},${p.lng}`).join(';')}`}
          positions={line}
          pathOptions={{ color: '#ff7a45', fillOpacity: 0.24, weight: 2, className: 'zone-map-visible-line' }}
          eventHandlers={{ mousedown: onMouseDown }}
        />
      ) : (
        <Polyline
          key={`polyline-${points.map(p => `${p.lat},${p.lng}`).join(';')}`}
          positions={line}
          pathOptions={{ color: '#ff7a45', dashArray: '10, 5', weight: 2, className: 'zone-map-visible-line' }}
          eventHandlers={{ mousedown: onMouseDown }}
        />
      )}
      <Polyline
        key={`drag-line-${points.map(p => `${p.lat},${p.lng}`).join(';')}`}
        positions={dragLine}
        pathOptions={{ color: '#ff7a45', opacity: 0.01, weight: 18, lineCap: 'round', lineJoin: 'round', className: 'zone-map-drag-line' }}
        eventHandlers={{ mousedown: onMouseDown }}
      />
    </>
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

  const [points, setPoints] = useState<LatLng[]>([]);
  const [fitVersion, setFitVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!zone) {
      setPoints([]);
      return;
    }
    // Load existing zone points, but only if they have unique coordinates
    // (ignore if all points have same coords, which happens when camera coords were used as default)
    const existing = zone.points
      .filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .slice(0, 4) as any[];
    
    const uniqueCoords = new Set(existing.map(p => `${p.latitude},${p.longitude}`));
    
    if (existing.length === 4 && uniqueCoords.size > 1) {
      setPoints(existing.map(p => new L.LatLng(p.latitude!, p.longitude!)));
      setFitVersion(version => version + 1);
    } else {
      setPoints([]);
    }
  }, [zone]);

  const center: LatLngExpression = useMemo(() => {
    if (points.length > 0) {
      const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
      return [lat, lng];
    }
    if (hasCoordinates(cameraMeta?.latitude, cameraMeta?.longitude)) {
      return [cameraMeta.latitude, cameraMeta.longitude];
    }
    return [59.9386, 30.3141];
  }, [points, cameraMeta]);

  function onMapClick(pos: LatLng) {
    if (points.length >= 4) return;
    setPoints(prev => [...prev, pos]);
    setFitVersion(version => version + 1);
  }

  function syncZonePoints(nextPoints: LatLng[]) {
    if (!zone || nextPoints.length !== 4) return;
    const updatedZonePoints = zone.points.map((pt, i) => {
      if (i < 4) {
        const p = nextPoints[i];
        return { ...pt, latitude: p.lat, longitude: p.lng };
      }
      return pt;
    }) as any;
    updateZone(zone.id, { points: updatedZonePoints });
  }

  function onReset() {
    setPoints([]);
    if (zone) {
      const resetPoints = zone.points.map((pt, i) => {
        return { ...pt, latitude: null, longitude: null };
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

      const updatedPoints = zone.points.map((pt, idx) => {
        if (idx < 4) {
          const p = points[idx];
          return { ...pt, latitude: p.lat, longitude: p.lng };
        }
        return pt;
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
        {loading && <div className="small">Сохранение…</div>}
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
        <MapContainer center={center} zoom={16} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapAutoFit points={points} fitVersion={fitVersion} />
          <ClickHandler onClick={onMapClick} />
          {points.length >= 2 && (
            <DraggableZoneShape
              points={points}
              onMove={setPoints}
              onMoveEnd={(nextPoints) => {
                setPoints(nextPoints);
                syncZonePoints(nextPoints);
              }}
            />
          )}
          {points.map((p, idx) => (
            <Marker
              key={`marker-${idx}`}
              position={p}
              icon={zonePointIcon}
              draggable
              autoPan
              riseOnHover
              zIndexOffset={1000}
              eventHandlers={{
                mousedown: (e) => {
                  L.DomEvent.stopPropagation(e.originalEvent);
                },
                dragend: (e) => {
                  const newPos = e.target.getLatLng();
                  setPoints(prev => {
                    const updatedPoints = prev.map((pt, i) => i === idx ? new L.LatLng(newPos.lat, newPos.lng) : pt);
                    syncZonePoints(updatedPoints);
                    return updatedPoints;
                  });
                }
              }}
            />
          ))}
        </MapContainer>
      </div>
    </>
  );
}
