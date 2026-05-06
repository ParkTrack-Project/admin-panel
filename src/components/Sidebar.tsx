import { useStore } from '@/store/useStore';
import { Button, Field, Input, Select, Textarea } from './UiKit';
import { useState, useEffect } from 'react';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

export default function Sidebar() {
  const s = useStore();
  const zone = s.zones.find(z => String(z.id) === String(s.activeZoneId));
  const camera = s.cameraMeta;
  
  const [cameraTitle, setCameraTitle] = useState(camera?.title || '');
  const [cameraSource, setCameraSource] = useState(camera?.source || '');
  const [cameraCalib, setCameraCalib] = useState('');
  const [cameraIsActive, setCameraIsActive] = useState(camera?.is_active !== false);

  useEffect(() => {
    if (s.cameraId && !s.cameraMeta) {
      const id = parseInt(s.cameraId, 10);
      if (!isNaN(id)) {
        s.loadCameraMeta(id);
      }
    }
    if (s.cameraId && s.zones.length === 0) {
      s.loadZones();
    }
  }, [s.cameraId]);

  useEffect(() => {
    if (camera) {
      setCameraTitle(camera.title || '');
      setCameraSource(camera.source || '');
      setCameraCalib(camera.calib ? JSON.stringify(camera.calib, null, 2) : '');
      setCameraIsActive(camera.is_active !== false);
    }
  }, [camera]);

  async function saveCamera() {
    if (!camera) return;
    let calibParsed: any = null;
    if (cameraCalib.trim()) {
      try {
        calibParsed = JSON.parse(cameraCalib);
      } catch (e) {
        s.error = 'Ошибка парсинга JSON в calib';
        return;
      }
    }
    await s.saveCamera(camera.camera_id, {
      title: cameraTitle,
      source: cameraSource,
      calib: calibParsed,
      is_active: cameraIsActive
    });
  }

  function startDrawZone() {
    s.addZone();
  }
  function finishEditing() {
    s.setTool('select');
  }

  function openCameraOnMap() {
    s.setViewMode('cameraMapSelector');
  }

  function openZoneOnMap() {
    if (!zone) return;
    s.setViewMode('zoneMapSelector');
  }

  return (
    <div className="sidebar">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="badge">
          Camera: {s.cameraMeta ? `${s.cameraMeta.camera_id} — ${s.cameraMeta.title}` : (s.cameraId || '—')}
        </div>
        <div className="small">Tool: {s.tool}</div>
      </div>

      <hr/>

      {camera && (
        <>
          <h4>Настройки камеры</h4>
          <Field label="Title">
            <Input 
              value={cameraTitle}
              onChange={e => setCameraTitle(e.target.value)}
              placeholder="Название камеры"
            />
          </Field>
          <Field label="Source (видеопоток)">
            <Input 
              value={cameraSource}
              onChange={e => setCameraSource(e.target.value)}
              placeholder="https://... или rtsp://..."
            />
          </Field>
          <Field label="Calib (JSON)">
            <Textarea 
              value={cameraCalib}
              onChange={e => setCameraCalib(e.target.value)}
              placeholder='{"image_width": 1920, ...}'
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
          </Field>
          <Field label="Is Active">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input 
                type="checkbox"
                checked={cameraIsActive}
                onChange={e => setCameraIsActive(e.target.checked)}
              />
              <span className="small">Активна</span>
            </label>
          </Field>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button onClick={saveCamera}>Сохранить камеру</Button>
          </div>
          <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>
            <div>Создано: {formatDate(camera.created_at)}</div>
            <div>Обновлено: {formatDate(camera.updated_at)}</div>
          </div>
          <hr/>
        </>
      )}

      <div className="col">
        <Button onClick={startDrawZone}>+ Добавить зону</Button>
        <Button variant="ghost" onClick={openCameraOnMap}>
          Отметить камеру на карте
        </Button>
        {s.tool === 'drawZone' && s.zoneDraft && s.zoneDraft.length > 0 && (
          <Button variant="danger" onClick={()=>s.zoneDraftClear()}>Отменить рисование</Button>
        )}
        <Button variant="ghost" onClick={()=>s.loadZones()}>Обновить зоны</Button>
      </div>

      <h4>Зоны</h4>
      <div className="list">
        {s.zones.map(z => (
          <div key={String(z.id)} className={`item ${String(s.activeZoneId)===String(z.id) ? 'active':''}`} onClick={()=>s.selectZone(z.id)}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <div>{String(z.id)}</div>
              <span className="badge">{z.zone_type}</span>
            </div>
            <div className="small">
              capacity: {z.capacity} • pay: {z.pay}
            </div>
          </div>
        ))}
      </div>

      {zone && (
        <>
          <hr/>
          <h4>Свойства зоны</h4>
          <Field label="Zone Type">
            <Select value={zone.zone_type} onChange={e=>s.updateZone(zone.id,{zone_type:e.target.value as any})}>
              <option value="standard">standard</option>
              <option value="parallel">parallel</option>
              <option value="disabled">disabled</option>
            </Select>
          </Field>
          <Field label="Capacity">
            <Input type="number" min={1} value={zone.capacity}
              onChange={e=>{
                const val = parseInt(e.target.value||'1',10);
                s.updateZone(zone.id,{capacity: Math.max(1, val)});
              }}/>
          </Field>
          <Field label="Pay">
            <Input type="number" min={0} value={zone.pay}
              onChange={e=>s.updateZone(zone.id,{pay: parseInt(e.target.value||'0',10)})}/>
          </Field>
          <div className="small" style={{ marginTop: 4, opacity: 0.7 }}>
            <div>Создано: {formatDate(zone.created_at)}</div>
            <div>Обновлено: {formatDate(zone.updated_at)}</div>
          </div>

          <div className="row" style={{gap:8}}>
            <Button onClick={()=>s.setTool('editZone')}>Редактировать вершины</Button>
            <Button variant="ghost" onClick={finishEditing}>Готово</Button>
          </div>
          <div className="row" style={{gap:8}}>
            <Button onClick={()=>s.saveZone(zone.id)}>Сохранить зону</Button>
            <Button variant="danger" onClick={()=>s.removeZone(zone.id)}>Удалить зону</Button>
          </div>
          <div className="row" style={{gap:8}}>
            <Button variant="ghost" onClick={openZoneOnMap}>
              Отметить зону на карте
            </Button>
          </div>
        </>
      )}

      {s.tool === 'drawZone' && (
        <>
          <hr/>
          <div className="small" style={{opacity:0.8}}>
            Режим рисования зоны: кликните 4 точки на изображении, чтобы замкнуть четырёхугольник.
          </div>
        </>
      )}
    </div>
  );
}
