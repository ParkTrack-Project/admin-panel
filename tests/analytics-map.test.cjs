const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual component's effects against a small Yandex Maps double.
// No network, browser session or Maps API key is needed for viewport regressions.
function setup() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const fits = [];
  const centers = [];
  const collections = [];
  const routes = [];
  let map = { geoObjects: { add() {}, remove() {} }, setCenter: (...args) => centers.push(args) };
  class GeoObject {
    constructor(points, properties, options) {
      this.points = points;
      this.properties = properties;
      this.options = options;
      this.events = { add: (name, handler) => { this[name] = handler; } };
    }
  }
  const ymaps = {
    GeoObjectCollection: class {
      constructor() { this.items = []; collections.push(this); }
      add(item) { this.items.push(item); }
    },
    Placemark: GeoObject,
    Polygon: GeoObject
  };
  const source = readFileSync(`${__dirname}/../src/pages/AnalyticsPage.tsx`, 'utf8');
  const component = source.slice(source.indexOf('function AnalyticsMap('), source.indexOf('function MapDetails('));
  const script = ts.transpileModule(`${component}\nexports.render = AnalyticsMap;`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  const context = {
    exports,
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useRef: value => {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useMemo: factory => { cursor++; return factory(); },
    useEffect: (effect, deps) => {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    useYandexMap: () => ({ ymaps, map, loading: false }),
    fitYandexMap: (...args) => fits.push(args),
    yandexPoint: (lat, lng) => [lat, lng],
    hasCoordinates: (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng),
    zoneMapPoints: zone => zone.points,
    occupancyColor: () => '#128a45',
    formatNumber: String,
    formatPercent: String,
    formatDateTime: value => value ?? '—',
    detectorStatus: value => ({ key: value ?? 'no_data', label: value ?? 'Нет данных' }),
    setAnalyticsRoute: route => routes.push(route),
    MapDetails: 'details', Input: 'input', Button: 'button'
  };
  vm.runInNewContext(script, context);
  return {
    fits, centers, collections, routes,
    render: props => {
      cursor = 0;
      effects = [];
      const tree = exports.render({ zones: [], cameras: [], ...props });
      effects.forEach(effect => effect());
      return tree;
    },
    replaceMap: () => { map = { ...map }; }
  };
}

const cameras = [
  { camera_id: 1, title: 'Невский', latitude: 59.93, longitude: 30.31, is_active: true },
  { camera_id: 2, title: 'Петроградская', latitude: 59.96, longitude: 30.3, is_active: false }
];

test('summary/health refresh and equal camera data preserve a manually changed viewport', () => {
  const state = setup();
  state.render({ cameras });
  assert.equal(state.fits.length, 1);
  // User interaction occurs outside React; only explicit fit/center calls could reset it.
  state.render({ cameras: cameras.map(item => ({ ...item })), summary: { zones: [] }, health: { items: [] } });
  state.render({ cameras, summary: { cameras: [{ camera_id: 1, status: 'offline' }] } });
  assert.equal(state.fits.length, 1);
  assert.equal(state.centers.length, 0);
  assert.ok(state.collections.length > 1, 'overlays still receive updated metrics');
});

test('initially empty map fits when coordinates arrive, once', () => {
  const state = setup();
  state.render({});
  assert.equal(state.fits.length, 0);
  state.render({ cameras });
  state.render({ cameras: [...cameras] });
  assert.equal(state.fits.length, 1);
});

test('a newly created map receives its own initial fit', () => {
  const state = setup();
  state.render({ cameras });
  state.replaceMap();
  state.render({ cameras });
  assert.equal(state.fits.length, 2);
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.children ?? []).flat(Infinity).flatMap(nodes)];
}

function cameraButtons(tree) {
  return nodes(tree).filter(node => node.props.className === 'analytics-camera-select');
}

test('search matches camera name without case sensitivity, ID and empty results', () => {
  const state = setup();
  let tree = state.render({ cameras });
  const search = nodes(tree).find(node => node.props.type === 'search');
  search.props.onChange({ target: { value: ' НЕВСКИЙ ' } });
  tree = state.render({ cameras });
  assert.equal(cameraButtons(tree).length, 1);
  assert.equal(cameraButtons(tree)[0].children[0].children[0], 'Невский');
  search.props.onChange({ target: { value: '#2' } });
  tree = state.render({ cameras });
  assert.equal(cameraButtons(tree).length, 1);
  assert.equal(cameraButtons(tree)[0].children[0].children[0], 'Петроградская');
  search.props.onChange({ target: { value: 'Несуществующая' } });
  tree = state.render({ cameras });
  assert.equal(cameraButtons(tree).length, 0);
  assert.ok(nodes(tree).some(node => node.children.includes('Камеры не найдены. Измените поисковый запрос.')));
});

test('list selection focuses once; marker click updates selection and opens camera analytics', () => {
  const state = setup();
  let tree = state.render({ cameras });
  cameraButtons(tree)[0].props.onClick();
  tree = state.render({ cameras });
  assert.equal(state.centers.length, 1);
  assert.equal(state.centers[0][1], 16);
  assert.equal(cameraButtons(tree)[0].props['aria-pressed'], true);
  assert.equal(state.collections.at(-1).items[0].options.iconColor, '#2563eb');
  state.render({ cameras: cameras.map(camera => ({ ...camera })), health: { items: [] } });
  assert.equal(state.centers.length, 1, 'refresh must not recenter selected camera');
  state.collections.at(-1).items[1].click();
  tree = state.render({ cameras });
  assert.equal(cameraButtons(tree)[1].props['aria-pressed'], true);
  assert.equal(state.centers.length, 2);
  nodes(tree).find(node => node.props['aria-label'] === 'Открыть аналитику камеры #2').props.onClick();
  assert.equal(state.routes[0].view, 'camera');
  assert.equal(state.routes[0].cameraId, '2');
});

test('camera without coordinates remains selectable and openable without moving the map', () => {
  const state = setup();
  const camerasWithoutCoordinates = [{ ...cameras[0], latitude: null, longitude: null }];
  let tree = state.render({ cameras: camerasWithoutCoordinates });
  cameraButtons(tree)[0].props.onClick();
  tree = state.render({ cameras: camerasWithoutCoordinates });
  assert.equal(cameraButtons(tree)[0].props['aria-pressed'], true);
  assert.equal(state.centers.length, 0);
  assert.equal(state.collections.at(-1).items.length, 0);
  nodes(tree).find(node => node.props['aria-label'] === 'Открыть аналитику камеры #1').props.onClick();
  assert.equal(state.routes[0].cameraId, '1');
});

test('selected camera details reflect refreshed status without losing selection', () => {
  const state = setup();
  let tree = state.render({ cameras });
  cameraButtons(tree)[0].props.onClick();
  tree = state.render({ cameras, summary: { cameras: [{ camera_id: 1, status: 'offline', last_update_at: 'new-time' }] } });
  const details = nodes(tree).find(node => node.type === 'details');
  assert.equal(details.props.title, 'Камера #1');
  assert.equal(details.props.rows.find(row => row[0] === 'Состояние детектора')[1], 'offline');
  assert.equal(details.props.rows.find(row => row[0] === 'Последнее наблюдение')[1], 'new-time');
  assert.equal(cameraButtons(tree)[0].props['aria-pressed'], true);
});

test('zone selection fits only on selection and refreshed zone details stay current', () => {
  const state = setup();
  const zones = [{ id: 9, camera_id: 1, points: [[59.93, 30.3], [59.94, 30.31], [59.93, 30.32]], capacity: 10 }];
  state.render({ zones });
  state.collections.at(-1).items[0].click();
  state.render({ zones });
  assert.equal(state.fits.length, 2);
  const tree = state.render({ zones, summary: { zones: [{ zone_id: 9, occupied_count: 4 }] } });
  assert.equal(state.fits.length, 2);
  assert.equal(nodes(tree).find(node => node.type === 'details').props.rows.find(row => row[0] === 'Занято')[1], '4');
});
