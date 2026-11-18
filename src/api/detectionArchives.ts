import { zipSync } from 'fflate';
import { analyticsApi, type DetectionRunListItem } from './analytics';

export type DetectionArchiveKind = 'annotated' | 'labels';

export type DetectionArchiveDownload = {
  blob: Blob;
  filename: string;
};

type ArchiveDetection = Pick<DetectionRunListItem, 'detection_run_id' | 'camera_id' | 'started_at' | 'finished_at'>;

export type DetectionArchiveResult = {
  archive: DetectionArchiveDownload | null;
  includedCount: number;
  skipped: Array<{ detectionRunId: number | string; reason: string }>;
};

// The browser holds the source files and the generated ZIP in memory at once.
const MAX_ARCHIVE_CONTENT_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_FILES = 65_535;
const ARCHIVE_LIMIT_MESSAGE = 'Не помещается в ZIP (лимит 64 МБ). Выберите меньше файлов.';
const STORAGE_ERROR_MESSAGE = 'Браузер не смог прочитать файл. Возможна ошибка сети или ограничение CORS.';

function formatArchiveTimestamp(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString().replaceAll(':', '-');
  }
  return '';
}

function getArtifactUrl(value?: string | null) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url;
  } catch {
    // Only absolute storage URLs are part of the artifacts contract.
  }
  return undefined;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

function getArchiveExtension(kind: DetectionArchiveKind, contentType: string, url: URL) {
  const unspecified = !contentType || contentType === 'application/octet-stream';
  if (kind === 'labels') return unspecified || contentType === 'text/plain' ? 'txt' : undefined;
  if (!unspecified) return IMAGE_EXTENSIONS[contentType];
  return url.pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i)?.[1].toLowerCase() ?? 'jpg';
}

async function readArtifactBytes(response: Response, budget: number): Promise<Uint8Array | null> {
  if (Number(response.headers.get('content-length')) > budget) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > budget) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 1) return chunks[0];
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type ArtifactDownload = { bytes: Uint8Array; extension: string } | { reason: string };

async function readArtifact(
  url: URL,
  kind: DetectionArchiveKind,
  budget: number,
  signal?: AbortSignal
): Promise<ArtifactDownload> {
  try {
    const response = await fetch(url.href, { credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { reason: `Хранилище вернуло HTTP ${response.status}.` };
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    const extension = getArchiveExtension(kind, contentType, url);
    if (!extension) {
      await response.body?.cancel();
      return { reason: 'Хранилище вернуло файл неожиданного типа.' };
    }
    const bytes = await readArtifactBytes(response, budget);
    if (!bytes) return { reason: ARCHIVE_LIMIT_MESSAGE };
    if (kind === 'annotated' && !bytes.byteLength) return { reason: 'Хранилище вернуло пустое изображение.' };
    return { bytes, extension };
  } catch {
    signal?.throwIfAborted();
    return { reason: STORAGE_ERROR_MESSAGE };
  }
}

export async function buildDetectionArchive({ cameraId, detections, kind, signal }: {
  cameraId: number;
  detections: readonly ArchiveDetection[];
  kind: DetectionArchiveKind;
  signal?: AbortSignal;
}): Promise<DetectionArchiveResult> {
  const files: Record<string, Uint8Array> = {};
  const skipped: DetectionArchiveResult['skipped'] = [];
  const processedIds = new Set<string>();
  let budget = MAX_ARCHIVE_CONTENT_BYTES;
  let includedCount = 0;

  for (const detection of detections) {
    signal?.throwIfAborted();
    const detectionRunId = detection.detection_run_id;
    const id = String(detectionRunId);
    if (processedIds.has(id)) continue;
    processedIds.add(id);

    if (budget === 0 || includedCount === MAX_ZIP_FILES) {
      skipped.push({ detectionRunId, reason: ARCHIVE_LIMIT_MESSAGE });
      continue;
    }

    let detail;
    try {
      detail = await analyticsApi.detection(detectionRunId, signal);
    } catch {
      signal?.throwIfAborted();
      skipped.push({ detectionRunId, reason: 'Не удалось получить данные детекции.' });
      continue;
    }
    signal?.throwIfAborted();
    if (detail?.camera_id !== cameraId || String(detail.detection_run_id) !== id) {
      skipped.push({ detectionRunId, reason: 'Сервер вернул данные другого распознавания.' });
      continue;
    }

    const artifactLink = kind === 'annotated' ? detail.annotated_snapshot_url : detail.yolo_labels_url;
    const url = getArtifactUrl(artifactLink);
    if (!url) {
      skipped.push({ detectionRunId, reason: artifactLink?.trim() ? 'Некорректная ссылка на файл.' : 'Файл недоступен для этой детекции.' });
      continue;
    }

    const artifact = await readArtifact(url, kind, budget, signal);
    if ('reason' in artifact) {
      skipped.push({ detectionRunId, reason: artifact.reason });
      continue;
    }

    const timestamp = formatArchiveTimestamp(detail.started_at, detection.started_at, detail.finished_at, detection.finished_at);
    const basename = `camera-${cameraId}-detection-${encodeURIComponent(id)}`;
    files[`${basename}${timestamp ? `-${timestamp}` : ''}-${kind}.${artifact.extension}`] = artifact.bytes;
    includedCount += 1;
    budget -= artifact.bytes.byteLength;
  }

  signal?.throwIfAborted();
  const archive = includedCount > 0 ? {
    blob: new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }),
    filename: `camera-${cameraId}-detections-${kind}.zip`
  } : null;
  return { archive, includedCount, skipped };
}

export function downloadDetectionArchive({ blob, filename }: DetectionArchiveDownload) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to consume the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
