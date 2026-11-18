const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { unzipSync } = require('fflate');

const source = ts.transpileModule(readFileSync(`${__dirname}/../src/api/detectionArchives.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function setup(detection, fetch) {
  const exports = {};
  vm.runInNewContext(source, {
    exports, URL, Blob, fetch,
    require: name => name === './analytics' ? { analyticsApi: { detection } } : require(name)
  });
  return exports.buildDetectionArchive;
}

function detection(id, properties = {}) {
  return { detection_run_id: id, camera_id: 8, ...properties };
}

test('stores exact annotated bytes and reports missing, HTTP, CORS and detail failures independently', async () => {
  const contents = Uint8Array.of(255, 216, 1, 2, 255, 217);
  const seenFiles = [];
  const build = setup(async id => {
    if (id === 6) throw new Error('detail unavailable');
    return detection(id, {
      started_at: '2026-10-19T13:00:52+03:00',
      raw_snapshot_url: 'https://storage.example/raw.jpg',
      annotated_snapshot_url: id === 2 ? null : `https://storage.example/${id}/annotated.jpg`,
      yolo_labels_url: 'https://storage.example/labels.txt'
    });
  }, async (url, options) => {
    seenFiles.push(url);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.mode, 'cors');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers, undefined);
    if (url.includes('/3/')) return new Response(null, { status: 403 });
    if (url.includes('/4/')) throw new TypeError('Failed to fetch');
    if (url.includes('/5/')) return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    return new Response(contents, { headers: { 'content-type': 'image/jpeg' } });
  });
  const result = await build({ cameraId: 8, detections: [1, 2, 3, 4, 5, 6].map(id => detection(id)), kind: 'annotated' });
  assert.equal(result.includedCount, 1);
  assert.equal(result.archive.filename, 'camera-8-detections-annotated.zip');
  assert.equal(result.archive.blob.type, 'application/zip');
  const extracted = unzipSync(new Uint8Array(await result.archive.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(extracted), ['camera-8-detection-1-2026-10-19T10-00-52.000Z-annotated.jpg']);
  assert.deepEqual(Object.values(extracted)[0], contents);
  assert.deepEqual(Array.from(result.skipped, file => file.detectionRunId), [2, 3, 4, 5, 6]);
  assert.match(result.skipped[1].reason, /HTTP 403/);
  assert.match(result.skipped[2].reason, /CORS/);
  assert.ok(seenFiles.every(url => url.endsWith('/annotated.jpg')));
});

test('labels ZIP stores text without transcoding and keeps a valid empty YOLO file', async () => {
  const labels = new TextEncoder().encode('1 0.5 0.5 0.3 0.4\r\n');
  const build = setup(async id => detection(id, {
    yolo_labels_url: `https://storage.example/labels/${id}`,
    annotated_snapshot_url: 'https://storage.example/annotated.jpg'
  }), async url => new Response(url.endsWith('/1') ? labels : null, {
    headers: { 'content-type': 'text/plain; charset=UTF-8' }
  }));
  const result = await build({ cameraId: 8, detections: [detection(1, { finished_at: '2026-10-19T10:20:30Z' }), detection(2)], kind: 'labels' });
  assert.equal(result.archive.filename, 'camera-8-detections-labels.zip');
  const extracted = unzipSync(new Uint8Array(await result.archive.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(extracted), ['camera-8-detection-1-2026-10-19T10-20-30.000Z-labels.txt', 'camera-8-detection-2-labels.txt']);
  assert.deepEqual(Object.values(extracted), [labels, new Uint8Array(0)]);
  assert.equal(result.skipped.length, 0);
});

test('rejects an oversize artifact and creates no ZIP when none of the files are available', async () => {
  const build = setup(async id => detection(id, { annotated_snapshot_url: 'https://storage.example/image.jpg' }),
    async () => new Response(null, { headers: { 'content-length': '67108865', 'content-type': 'image/jpeg' } }));
  const result = await build({ cameraId: 8, detections: [detection(1)], kind: 'annotated' });
  assert.equal(result.includedCount, 0);
  assert.equal(result.archive, null);
  assert.match(result.skipped[0].reason, /лимит 64 МБ/);
});

test('aborting an archive stops before requesting more detections', async () => {
  const controller = new AbortController();
  const requestedIds = [];
  const build = setup(async id => {
    requestedIds.push(id);
    return detection(id, { yolo_labels_url: 'https://storage.example/labels.txt' });
  }, async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw controller.signal.reason;
  });
  await assert.rejects(build({ cameraId: 8, detections: [detection(1), detection(2)], kind: 'labels', signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(requestedIds, [1]);
});
