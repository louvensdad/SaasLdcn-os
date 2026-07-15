# Quickstart

## Backend

From the repository root:

```powershell
python -m pip install -r apps\api\requirements.txt
cd apps\api
python -m uvicorn app.main:app --reload --port 8001
```

Open `http://localhost:8001/api/health`.

> The frontend defaults to `NEXT_PUBLIC_API_URL=http://localhost:8001`. Keep the
> backend reachable via `localhost` (not `127.0.0.1`) in dev — browsers treat
> them as different sites, so a `127.0.0.1` API origin would not receive the
> `SameSite=Lax` refresh-token cookie set for `localhost:3000`.

## Frontend

In a second terminal:

```powershell
cd apps\web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Tests

Backend:

```powershell
python -m pytest apps/api/tests
```

Frontend type checks:

```powershell
cd apps\web
npm run typecheck
npx tsc --noEmit
```

## Build

```powershell
cd apps\web
npm run build
```

## Troubleshooting

- Backend offline in the frontend: confirm the API is running on `http://localhost:8001` or set `NEXT_PUBLIC_API_URL`.
- Port already in use: run Uvicorn or Next.js on another port and update the frontend API URL if the backend port changes.
- Pytest cache warnings on Windows: cache write warnings do not affect test results if tests pass.
- PDF Contract Input remains a `501` placeholder. User Key Boost and Git Export are active authenticated features.
- Generated project path errors: local generation requires output paths inside the LDCN OS workspace and will not overwrite existing directories.
