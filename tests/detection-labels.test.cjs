const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(url, fetch) {
  const source = readFileSync(`${__dirname}/../src/pages/AnalyticsPage.tsx`, 'utf8');
  const component = source.slice(source.indexOf('function DetectionLabelsDownload('), source.indexOf('function Detail('));
  const script = ts.transpileModule(`${component}\nexports.render = DetectionLabelsDownload;`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const states = [];
  const effects = [];
  const links = [];
  const exports = {};
  vm.runInNewContext(script, {
    exports, fetch, AbortController,
    useState: initial => [initial, value => states.push(value)],
    useRef: () => ({}),
    useEffect: effect => effects.push(effect()),
    blockError: error => error.message,
    Button: 'button',
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    document: {
      createElement: () => {
        const link = { click() { link.clicked = true; }, remove() { link.removed = true; } };
        links.push(link);
        return link;
      },
      body: { appendChild() {} }
    }
  });
  const view = exports.render({ detectionRunId: 42, url });
  const button = view.children[0].children[0];
  return { button, states, links, effects };
}

test('missing labels disable download without fetching', async () => {
  const { button } = setup(null, () => assert.fail('unexpected fetch'));
  assert.equal(button.props.disabled, true);
  await button.props.onClick();
});

test('downloads labels with exact content and filename without API credentials', async () => {
  const labels = '0 0.5 0.5 0.2 0.3\n';
  const state = setup('https://s3.example/labels', async (url, options) => {
    assert.equal(url, 'https://s3.example/labels');
    assert.equal(options.credentials, 'omit');
    return { ok: true, text: async () => labels };
  });
  await state.button.props.onClick();
  assert.equal(state.links[0].download, 'detection-42-labels.txt');
  assert.equal(decodeURIComponent(state.links[0].href.split(',')[1]), labels);
  assert.equal(state.links[0].clicked, true);
  assert.equal(state.links[0].removed, true);
});

for (const failure of ['HTTP', 'network']) {
  test(`${failure} failure reports error and permits retry`, async () => {
    const state = setup('https://s3.example/labels', async () => {
      if (failure === 'network') throw new TypeError('Failed to fetch');
      return { ok: false, status: 403 };
    });
    await state.button.props.onClick();
    await state.button.props.onClick();
    assert.equal(state.links.length, 0);
    assert.equal(state.states.filter(value => typeof value === 'string' && value.includes('Не удалось скачать')).length, 2);
    assert.equal(state.states.at(-1), false);
  });
}

test('unmount aborts pending download', async () => {
  let finish;
  let signal;
  let markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  const state = setup('https://s3.example/labels', async (_, options) => {
    signal = options.signal;
    return { ok: true, text: () => new Promise(resolve => { finish = resolve; markReady(); }) };
  });
  const pending = state.button.props.onClick();
  await ready;
  state.effects[0]();
  assert.equal(signal.aborted, true);
  finish('0 0.5 0.5 0.2 0.3');
  await pending;
  assert.equal(state.links.length, 0);
});
