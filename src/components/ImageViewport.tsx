import { Stage, Layer, Image as KImage } from 'react-konva';
import useImage from 'use-image';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import ZoneLayer from './ZoneLayer';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from './UiKit';

export default function ImageViewport() {
  const { image, scale, offsetX, offsetY, setView, tool } = useStore();
  const [img] = useImage(image?.url ?? '');
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ scale, offsetX, offsetY });
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number } | null>(null);
  const [size, setSize] = useState({ w: 100, h: 100 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const lastImageUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    viewRef.current = { scale, offsetX, offsetY };
  }, [scale, offsetX, offsetY]);

  useEffect(() => {
    function onResize() {
      if (!containerRef.current) return;
      setSize({
        w: containerRef.current.clientWidth,
        h: containerRef.current.clientHeight
      });
    }
    onResize();
    window.addEventListener('resize', onResize);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(onResize)
      : undefined;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
      window.setTimeout(() => {
        if (!containerRef.current) return;
        setSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight
        });
      }, 0);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
        return;
      }
      await container.requestFullscreen();
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  }

  // Auto-fit image to viewport on first load (only for new images, not on resize)
  useEffect(() => {
    if (!image) {
      lastImageUrlRef.current = undefined;
      return;
    }
    if (!img || size.w === 0 || size.h === 0) return;
    
    const isNewImage = lastImageUrlRef.current !== image.url;
    if (!isNewImage) return;
    
    lastImageUrlRef.current = image.url;
    
    const imgWidth = image.naturalWidth;
    const imgHeight = image.naturalHeight;
    
    // Calculate scale to fit image in viewport (don't upscale beyond 1:1)
    const scaleX = size.w / imgWidth;
    const scaleY = size.h / imgHeight;
    const newScale = Math.min(scaleX, scaleY, 1);
    
    // Center the scaled image
    const scaledWidth = imgWidth * newScale;
    const scaledHeight = imgHeight * newScale;
    const newOffsetX = (size.w - scaledWidth) / 2;
    const newOffsetY = (size.h - scaledHeight) / 2;
    
    setView(newScale, newOffsetX, newOffsetY);
  }, [image, img, size.w, size.h, setView]);

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;

    // Zoom towards mouse pointer position
    const oldScale = scale;
    const pointer = st.getPointerPosition();
    if (!pointer) return;

    // Calculate point in image coordinates before zoom
    const mousePointTo = {
      x: (pointer.x - st.x()) / oldScale,
      y: (pointer.y - st.y()) / oldScale
    };

    const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
    // Adjust offset so the point under mouse stays in place
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale
    };
    setView(newScale, newPos.x, newPos.y);
  };

  function setStageCursor(cursor: string) {
    const st = stageRef.current;
    if (!st) return;
    st.container().style.cursor = cursor;
  }

  function startPan(clientX: number, clientY: number) {
    const st = stageRef.current;
    st?.stopDrag();
    panRef.current = { active: true, lastX: clientX, lastY: clientY };
    setIsPanning(true);
    setStageCursor('grabbing');
  }

  function movePan(clientX: number, clientY: number) {
    const currentPan = panRef.current;
    if (!currentPan?.active) return;

    const dx = clientX - currentPan.lastX;
    const dy = clientY - currentPan.lastY;
    currentPan.lastX = clientX;
    currentPan.lastY = clientY;

    const currentView = viewRef.current;
    const nextOffsetX = currentView.offsetX + dx;
    const nextOffsetY = currentView.offsetY + dy;
    viewRef.current = { ...currentView, offsetX: nextOffsetX, offsetY: nextOffsetY };
    setView(currentView.scale, nextOffsetX, nextOffsetY);
  }

  function stopPan() {
    if (!panRef.current?.active) return;
    panRef.current = null;
    setIsPanning(false);
    setStageCursor(tool === 'select' ? 'grab' : 'default');
  }

  function touchCenter(touches: TouchList) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 1 && e.evt.button !== 2) return;
    e.evt.preventDefault();
    startPan(e.evt.clientX, e.evt.clientY);
  };

  const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!panRef.current?.active) return;
    e.evt.preventDefault();
    movePan(e.evt.clientX, e.evt.clientY);
  };

  const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!panRef.current?.active) return;
    e.evt.preventDefault();
    stopPan();
  };

  const onTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) return;
    e.evt.preventDefault();
    const center = touchCenter(e.evt.touches);
    startPan(center.x, center.y);
  };

  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    if (!panRef.current?.active || e.evt.touches.length < 2) return;
    e.evt.preventDefault();
    const center = touchCenter(e.evt.touches);
    movePan(center.x, center.y);
  };

  const onTouchEnd = () => {
    stopPan();
  };

  const onDragEnd = (_e: KonvaEventObject<DragEvent>) => {
    const st = stageRef.current;
    if (!st) return;
    setView(scale, st.x(), st.y());
  };

  return (
    <div className="canvas image-viewport" ref={containerRef}>
      {!image ? (
        <div style={{ padding: 16, color: '#7f86a8' }}>
          Загрузите изображение сверху
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="badge">scale: {scale.toFixed(2)} • tool: {tool}</div>
            <Button
              type="button"
              variant="ghost"
              className="viewport-fullscreen-button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть разметку на весь экран'}
            >
              {isFullscreen ? 'Свернуть' : 'На весь экран'}
            </Button>
          </div>
          <Stage
            ref={stageRef}
            width={size.w}
            height={size.h}
            scaleX={scale}
            scaleY={scale}
            x={offsetX}
            y={offsetY}
            onWheel={onWheel}
            draggable={tool === 'select' && !isPanning}
            onDragEnd={onDragEnd}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onContextMenu={e => e.evt.preventDefault()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <Layer>
              {img && (
                <KImage
                  image={img}
                  width={image.naturalWidth}
                  height={image.naturalHeight}
                />
              )}
              <ZoneLayer />
            </Layer>
          </Stage>
        </>
      )}
    </div>
  );
}
