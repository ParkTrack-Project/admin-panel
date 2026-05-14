# ParkTrack Admin

## Что есть в приложении

- `Auth`
  - регистрация
  - логин / logout
  - проверка текущей сессии через API
- `Dashboard`
  - обзор системы
  - health / version
  - быстрые переходы по основным ресурсам
- `Users`
  - список пользователей
  - просмотр карточки
  - редактирование
  - управление ролью и активностью
- `Partners`
  - список партнёров
  - создание / редактирование / удаление
  - управление участниками партнёра
- `Cameras`
  - список и фильтры
  - создание / редактирование / удаление
  - snapshot preview
  - переход в разметку и привязку на карте
- `Zones`
  - список и фильтры
  - редактирование атрибутов
  - удаление
  - переход в image geometry и map geometry
- `Sources`
  - реестр источников данных
  - список, фильтры, detail panel
  - переход к профильной сущности
- `Labeler`
  - редактирование зон на изображении
  - map entrypoint для геометрии
  - возврат обратно в админский контекст

## Основные маршруты

Приложение использует hash-routing:

- `#/` — dashboard
- `#/login`
- `#/register`
- `#/profile`
- `#/users`
- `#/partners`
- `#/cameras`
- `#/zones`
- `#/sources`
- `#/labeler`

Раздел `Разметка` не открывается как отдельный главный модуль из sidebar.  
В нормальном сценарии в него попадают из конкретной камеры или зоны.

## Стек

- `React + TypeScript + Vite`
- `zustand`
- `react-konva`
- `leaflet / react-leaflet`

## Требования

- `Node.js 18+`
- запущенный backend из `api-server`
- доступный API по базовому адресу вида:

```text
http://localhost:8000/api/v1
```

## Локальный запуск

```bash
npm install
npm run dev
```

По умолчанию dev-сервер поднимается на:

```text
http://localhost:5173
```

## Как приложение работает с backend

Фронтенд ожидает backend ParkTrack API с ресурсами:

- `/auth`
- `/users`
- `/partners`
- `/cameras`
- `/zones`
- `/sources`
- `/admin`

Локально в UI можно указать `API Base`. Для разработки это удобно, чтобы быстро переключаться между локальным, staging и production API.

## Типичный сценарий проверки

1. Запустить backend из `api-server`
2. Запустить frontend `labeler`
3. Указать `API Base`
4. Зарегистрироваться или войти
5. Открыть:
   - `#/cameras`
   - `#/zones`
   - `#/sources`
   - `#/users`
   - `#/partners`
6. Перейти в labeler из камеры или зоны