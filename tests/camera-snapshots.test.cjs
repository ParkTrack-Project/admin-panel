const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(items = [{ detection_run_id: 42 }], detail = {}) {
  const calls = [];
  class ApiRequestError extends Error {}
  const exports = {};
  const source = ts.transpileModule(readFileSync(`${__dirname}/../src/api/cameras.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: name => name === './analytics' ? {
      analyticsApi: {
        cameraDetections: async (id, query) => {
          calls.push(['list', id, query.limit]);
          return { items };
        },
        detection: async id => {
          calls.push(['detail', id]);
          if (detail instanceof Error) throw detail;
          return { detection_run_id: 42, started_at: '2026-10-19T10:00:00Z', ...detail };
        }
      }
    } : {
      ApiRequestError,
      requestBlob: async path => {
        calls.push(['live', path]);
        return { blob: 'live-blob', headers: new Map() };
      }
    },
    URL: { createObjectURL: blob => { calls.push(['objectURL', blob]); return 'blob:live'; } }
  });
  return { api: exports.camerasApi, calls };
}

for (const [mode, field, variant] of [
  ['detection', 'raw_snapshot_url', 'raw'],
  ['annotated', 'annotated_snapshot_url', 'annotated']
]) {
  test(`${mode} uses detail URL, ignoring list artifacts`, async () => {
    const { api, calls } = setup([{ detection_run_id: 42, [field]: 'https://stale.example/image' }], {
      [field]: 'https://s3.example/image'
    });
    const result = await api.getSnapshot(7, mode);
    assert.equal(result.image_url, 'https://s3.example/image');
    assert.equal(result.variant, variant);
    assert.equal(result.captured_at, '2026-10-19T10:00:00Z');
    assert.deepEqual(calls, [['list', 7, 1], ['detail', 42]]);
  });
}

test('annotated does not fall back to raw', async () => {
  const { api } = setup(undefined, { raw_snapshot_url: 'https://s3.example/raw', annotated_snapshot_url: null });
  await assert.rejects(api.getSnapshot(7, 'annotated'), /нет размеченного снимка/);
});

test('missing and blank raw URLs produce a useful error', async () => {
  for (const raw_snapshot_url of [null, undefined, '  ']) {
    await assert.rejects(setup(undefined, { raw_snapshot_url }).api.getSnapshot(7, 'detection'), /нет исходного снимка/);
  }
});

test('empty list does not request details', async () => {
  const { api, calls } = setup([]);
  await assert.rejects(api.getSnapshot(7, 'detection'), /нет сохранённых распознаваний/);
  assert.deepEqual(calls, [['list', 7, 1]]);
});

test('detail HTTP errors propagate', async () => {
  await assert.rejects(setup(undefined, new Error('HTTP 403')).api.getSnapshot(7, 'detection'), /HTTP 403/);
});

test('live uses camera snapshot endpoint and creates only a live object URL', async () => {
  const { api, calls } = setup();
  assert.equal((await api.getSnapshot(7)).image_url, 'blob:live');
  assert.deepEqual(calls, [['live', '/admin/cameras/7/snapshot'], ['objectURL', 'live-blob']]);
});
