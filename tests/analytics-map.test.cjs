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
