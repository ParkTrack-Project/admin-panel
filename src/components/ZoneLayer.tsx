import { useStore } from '@/store/useStore';
import { Group, Line, Circle, Rect } from 'react-konva';

export default function ZoneLayer() {
  const {
    zones, image, activeZoneId, selectZone, updateZone, tool,
    zoneDraft, zoneDraftAddPoint
  } = useStore();

  const W = image?.naturalWidth ?? 0;
  const H = image?.naturalHeight ?? 0;
  const activeZone = zones.find(z => String(z.id) === String(activeZoneId));
  const orderedZones = [
    ...zones.filter(z => String(z.id) !== String(activeZoneId)),
    ...zones.filter(z => String(z.id) === String(activeZoneId))
  ];

  function onCanvasClick(e: any) {
    if (tool !== 'drawZone') return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const imagePos = {
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleY()
    };
    zoneDraftAddPoint(imagePos);
  }

  return (
    <Group>
      {orderedZones.map(z => {
        const active = String(z.id) === String(activeZoneId);
        const pts = z.image_quad.flatMap(p => [p.x, p.y]);
        const canSelect = tool === 'select';

        return (
          <Group
            key={String(z.id)}
            listening={canSelect}
            onClick={(e) => {
              if (!canSelect) return;
              e.cancelBubble = true;
              selectZone(z.id);
            }}
            onTap={(e) => {
              if (!canSelect) return;
              e.cancelBubble = true;
              selectZone(z.id);
            }}
          >
            <Line
              listening={canSelect}
              points={pts}
              closed
              stroke={active ? '#ff7a45' : '#6aa0ff'}
              strokeWidth={active ? 4 : 2}
              shadowColor={active ? '#ff7a45' : undefined}
              shadowBlur={active ? 12 : 0}
              shadowOpacity={active ? 0.5 : 0}
              fill={active ? 'rgba(255,122,69,0.12)' : 'rgba(106,160,255,0.10)'}
            />
          </Group>
        );
      })}

      {activeZone && tool === 'editZone' && (
        <Group listening>
          {activeZone.image_quad.map((p,i)=>(
            <Circle
              key={i}
              x={p.x}
              y={p.y}
              radius={7}
              stroke="#ff7a45"
              fill="#0b1020"
              strokeWidth={3}
              hitStrokeWidth={18}
              draggable
              onMouseDown={(e:any)=>{ e.cancelBubble = true; }}
              onTouchStart={(e:any)=>{ e.cancelBubble = true; }}
              onDragStart={(e:any)=>{
                e.cancelBubble = true;
                e.target.moveToTop();
                e.target.getLayer()?.batchDraw();
              }}
              onDragMove={(e)=>{
                e.cancelBubble = true;
                const {x,y} = e.target.position();
                // Update both image_quad (for display) and points.x/y (for API)
                const next = activeZone.image_quad.map((pp,ii)=> ii===i ? {x,y} : pp) as any;
                const nextPoints = activeZone.points.map((pt,ii)=> ii===i ? { ...pt, x, y } : pt) as any;
                updateZone(activeZone.id, { image_quad: next, points: nextPoints });
              }}
              onDragEnd={(e:any)=>{ e.cancelBubble = true; }}
            />
          ))}
        </Group>
      )}

      {/* Keep this above existing zones so new points can be placed inside them. */}
      {tool === 'drawZone' && W>0 && H>0 && (
        <Rect
          x={0} y={0} width={W} height={H}
          fill="rgba(0,0,0,0.001)"
          onClick={onCanvasClick}
          onTap={onCanvasClick}
        />
      )}

      {tool === 'drawZone' && zoneDraft && zoneDraft.length>0 && (
        <Group listening={false}>
          <Line
            points={zoneDraft.flatMap(p=>[p.x,p.y])}
            closed={false}
            stroke="#cbbdff"
            strokeWidth={2}
            dash={[6,6]}
          />
          {zoneDraft.map((p,i)=>(
            <Circle key={i} x={p.x} y={p.y} radius={4} fill="#cbbdff"/>
          ))}
        </Group>
      )}
    </Group>
  );
}
