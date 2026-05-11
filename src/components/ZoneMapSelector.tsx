import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from './UiKit';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMapEvents, useMap } from 'react-leaflet';
import L, { LatLng, LatLngExpression } from 'leaflet';

type LatLngTuple = [number, number];

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

export default function ZoneMapSelector() {
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

  function onReset() {
    setPoints([]);
    if (zone) {
      const resetPoints = zone.points.map((pt, i) => {
        return { ...pt, latitude: null, longitude: null };
      }) as any;
      updateZone(zone.id, { points: resetPoints });
    }
  }

  async function onSave() {
    if (!zone) return;
    if (points.length !== 4) {
      setError('Необходимо отметить все 4 точки на карте перед сохранением.');
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
      await saveZone(zone.id);

      setViewMode('labeler');
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function onCancel() {
    setViewMode('labeler');
  }

  const polygon: LatLngTuple[] = points.map(p => [p.lat, p.lng]);

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
          Кликните 4 точки на карте по часовой стрелке, чтобы задать геометку зоны.
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
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
            <>
              {points.length === 4 ? (
                <Polygon 
                  key={`polygon-${points.map(p => `${p.lat},${p.lng}`).join(';')}`}
                  positions={polygon} 
                  pathOptions={{ color: '#ff7a45', fillOpacity: 0.2, weight: 2 }} 
                />
              ) : (
                <Polyline 
                  key={`polyline-${points.map(p => `${p.lat},${p.lng}`).join(';')}`}
                  positions={polygon} 
                  pathOptions={{ color: '#ff7a45', dashArray: '10, 5', weight: 2 }} 
                />
              )}
            </>
          )}
          {points.map((p, idx) => (
            <Marker
              key={`marker-${idx}`}
              position={p}
              icon={L.divIcon({
                className: 'zone-point-marker',
                html: '<div style="width:24px;height:24px;display:grid;place-items:center;"><div style="width:14px;height:14px;border-radius:50%;background:#ffd666;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
              draggable
              autoPan
              riseOnHover
              zIndexOffset={1000}
              eventHandlers={{
                drag: (e) => {
                  const newPos = e.target.getLatLng();
                  setPoints(prev => prev.map((pt, i) => i === idx ? new L.LatLng(newPos.lat, newPos.lng) : pt));
                },
                dragend: (e) => {
                  const newPos = e.target.getLatLng();
                  setPoints(prev => {
                    const updatedPoints = prev.map((pt, i) => i === idx ? new L.LatLng(newPos.lat, newPos.lng) : pt);

                    if (zone && updatedPoints.length === 4) {
                      const updatedZonePoints = zone.points.map((pt, i) => {
                        if (i < 4) {
                          const p = updatedPoints[i];
                          return { ...pt, latitude: p.lat, longitude: p.lng };
                        }
                        return pt;
                      }) as any;
                      updateZone(zone.id, { points: updatedZonePoints });
                    }

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
