# ParkTrack Admin

[Русский](README.md) | [English](README.en.md)

ParkTrack frontend for parking system administration, analytics, and parking zone labeling on camera snapshots and maps.

The application works with the `api-server` backend, uses role-based access control, and brings users, partners, cameras, zones, data sources, analytics, and parking geometry together in one interface.

## Features

### Authentication and profile

- registration and login through the ParkTrack API;
- session persistence and validation after a page refresh;
- automatic logout when the backend session becomes invalid;
- dedicated email password recovery flow;
- profile data viewing and editing;
- password changes;
- partner roles and permissions displayed without internal technical details.

### Overview

- summary metrics for cameras, zones, available parking spaces, and model confidence;
- attention-required zones visible on the first screen;
- quick navigation to cameras, zones, users, and profile;
- recently updated cameras;
- cameras without coordinates and zones with incomplete geometry;
- responsive cards without internal API, database, or permission metrics.

### Analytics

- summary analytics for accessible parking zones and cameras;
- time range and granularity selection;
- forecast snapshot selection through `forecast_created_at`;
- manual refresh and configurable automatic refresh;
- sticky control panel while scrolling;
- mutually exclusive zone or camera selection for an unambiguous analytics scope;
- actual and forecast occupancy charts;
- observation count and model confidence charts;
- clickable data points with detailed tooltips;
- relative data freshness timestamps;
- forecast quality metrics;
- scrollable status table for all zones with camera names and color-coded statuses;
- zone and camera map;
- dedicated analytics pages for zones, cameras, and detection runs;
- recognition quality assessment and feedback review;
- independent caching of the latest snapshot, last detection snapshot, and annotated snapshot until the page is refreshed;
- snapshot switching and refresh controls in fullscreen view.

### Users

- user list, search, and filtering;
- user creation;
- profile, global role, and activity status viewing and editing;
- adding a found user to a partner;
- partner membership and permission viewing;
- horizontal scrolling for wide tables;
- bulk activation, deactivation, and deletion of selected users.

### Partners

- partner listing, creation, editing, and deletion;
- optional `contact_email` and `contact_phone`;
- partner employee management;
- partner role and `read / write / delete` scope configuration;
- bulk activation, deactivation, and deletion of selected partners.

### Cameras

- camera list, search, and filtering;
- creation, editing, and deletion;
- automatic image dimension detection;
- vertically scrollable camera list;
- Yandex Map for camera selection and positioning;
- caching of the latest snapshot, last detection snapshot, and annotated snapshot;
- switching between the latest snapshot, last detection, and recognition visualization;
- fullscreen snapshot viewing;
- navigation to the settings and labeling workspace of a specific camera;
- bulk activation, deactivation, and deletion of selected cameras.

### Parking zones

- zone list and advanced filtering;
- zone type, capacity, price, location, and flag editing;
- supported locations: `street`, `yard`, `open_lot`, `underground`, `multilevel`;
- active, private parking, and accessible parking flags;
- zone creation through camera snapshot labeling;
- geometry editing on camera images and Yandex Maps;
- polygon vertex and edge movement;
- display of other camera zones while labeling;
- bulk activation, deactivation, and deletion of selected zones.

### Data sources

- data source registry;
- filters and horizontal table scrolling;
- source detail view;
- navigation to the related entity.

### Labeling workspace

- opened from a specific camera or zone;
- polygon creation and editing over a snapshot;
- point editing over overlapping zones;
- image panning with the middle or right mouse button;
- two-finger panning on touch devices;
- mouse-wheel zoom;
- snapshot caching until the user leaves the camera;
- fullscreen workspace;
- automatic image fitting and centering when entering fullscreen;
- dedicated image recentering control;
- navigation to camera and zone geometry on Yandex Maps;
- camera settings and zone property saving;
- consistent feedback after actions.

Labeling workspace shortcuts:

| Key | Action |
| --- | --- |
| `N` | start creating a zone |
| `E` | edit the selected polygon |
| `S` | save the selected zone |
| `M` | open zone geometry on the map |
| `Esc` | cancel drawing or return to selection |

Shortcuts are disabled while typing in form fields.

### Feedback and error handling

- unified success, warning, info, and error notifications;
- confirmation of destructive actions;
- understandable messages for API `4xx` errors;
- dedicated loading, empty, and partially unavailable states;
- Error Boundary protection against blank screens.

## Navigation and permissions

The application uses hash routing:

| Route | Purpose |
| --- | --- |
| `#/` | overview |
| `#/login` | login |
| `#/register` | registration |
| `#/password-reset` | password recovery |
| `#/profile` | profile |
| `#/analytics` | analytics |
| `#/users` | users |
| `#/partners` | partners |
| `#/cameras` | cameras |
| `#/zones` | zones |
| `#/sources` | data sources |
| `#/labeler` | selected camera labeling workspace |

Sidebar sections and direct routes verify the current session permissions. For example:

- cameras: `cameras.view`;
- zones: `zones.view`;
- data sources: `sources.view`;
- users: `admin.users.view` or `partner_members.view`;
- partners: `admin.partners.view`;
- analytics: admin, `admin.analytics.view`, `analytics.view`, or an active partner membership.

`#/labeler` is not a standalone primary section. If no camera is selected, the application redirects the user to the camera list.

Administrators can view data for all partners. Users with a membership work within the context of an accessible partner.

## Technology stack

- React 18;
- TypeScript;
- Vite;
- Zustand;
- Konva and React Konva;
- Yandex Maps JS API 2.1;
- nginx for the production container.

## Project structure

```text
src/
  api/          API clients and contracts
  auth/         backend session state
  components/   cameras, labeler, maps, and UI components
  feedback/     notifications and confirmations
  geometry/     polygon transformations and operations
  layout/       admin panel shell
  maps/         Yandex Maps loader and helpers
  pages/        administration section pages
  router/       hash routing
  store/        camera, zone, and labeling state
```

## Requirements

- Node.js 18+;
- npm;
- a running `api-server` backend;
- PostgreSQL accessible to the backend;
- a Yandex Maps API key for full map functionality.

The local backend is usually available at:

```text
http://127.0.0.1:8000/api/v1
```

## Environment variables

Create `.env` based on `.env.example`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_YANDEX_MAPS_API_KEY=your-yandex-maps-api-key
VITE_ANALYTICS_STALE_MINUTES=10
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | ParkTrack API base URL |
| `VITE_YANDEX_MAPS_API_KEY` | Yandex Maps JS API 2.1 key |
| `VITE_ANALYTICS_STALE_MINUTES` | threshold after which analytics data is considered stale |

The legacy `VITE_YMAPS_API_KEY` name is also supported for map compatibility, but `VITE_YANDEX_MAPS_API_KEY` should be used.

If `VITE_API_BASE_URL` is not set:

- `http://127.0.0.1:8000/api/v1` is used on `localhost`;
- the relative `/api/v1` path is used on other domains.

The API URL is configured at build time and cannot be edited by end users through the interface.

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

## Production build

Run TypeScript checks and build with Vite:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The Docker build accepts the API URL as a build argument:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 \
  -t parktrack-admin .
```

The production image builds the application with Node.js and serves the contents of `dist` through nginx.

## Backend contracts

The frontend uses the following primary ParkTrack API groups:

- `/auth`;
- `/users`;
- `/partners`;
- `/cameras`;
- `/zones`;
- `/sources`;
- `/occupancy`;
- `/forecasts`;
- `/admin/analytics`;
- `/health`;
- `/version`.

Three modes are supported for `/cameras/{camera_id}/snapshot`:

- no query parameters: a fresh snapshot from the video stream;
- `last_detection=true`: the snapshot saved at the time of the last detection;
- `annotated=true&fallback_to_raw=true`: recognition visualization with an optional fallback to a raw snapshot.

Raw snapshots and last detection snapshots require `cameras.view`. For recognition visualization, the backend additionally checks `admin.monitoring.view`.

Primary analytics endpoints:

- `/admin/analytics/summary`;
- `/admin/analytics/update-frequency`;
- `/admin/analytics/confidence`;
- `/admin/analytics/occupancy-history`;
- `/admin/analytics/occupancy-forecast`;
- `/admin/analytics/occupancy-heatmap`;
- `/admin/analytics/observations-rate`;
- `/admin/analytics/detector-health`;
- `/admin/analytics/forecast-quality`;
- `/admin/analytics/cameras/{camera_id}/detections`;
- `/admin/analytics/detections/{detection_run_id}`;
- `/admin/analytics/detections/{detection_run_id}/feedback`.

Protected requests include the bearer token of the current session. The session is stored in `localStorage`, survives page refreshes, and is validated through `/auth/me`.

## Development guidelines

- preserve existing API contracts and permission checks;
- do not add manual API URL configuration to the user interface;
- split large changes into small semantic commits;
- verify desktop and mobile layouts after interface changes;
- always run `npm run build` before pushing.
