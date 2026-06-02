# Quickstart

## Backend

From the repository root:

```powershell
python -m pip install -r apps\api\requirements.txt
cd apps\api
python -m uvicorn app.main:app --reload --port 8001
```

Open `http://127.0.0.1:8001/api/health`.

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

- Backend offline in the frontend: confirm the API is running on `http://127.0.0.1:8001` or set `NEXT_PUBLIC_API_URL`.
- Port already in use: run Uvicorn or Next.js on another port and update the frontend API URL if the backend port changes.
- Pytest cache warnings on Windows: cache write warnings do not affect test results if tests pass.
- Placeholder endpoints return `501`: this is expected for User Key Boost, Git Export, and PDF Contract Input in V1 Foundation.
- Generated project path errors: local generation requires output paths inside the LDCN OS workspace and will not overwrite existing directories.
