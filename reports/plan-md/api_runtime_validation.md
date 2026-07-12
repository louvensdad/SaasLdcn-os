# API Runtime Validation

Date: 2026-05-19

## Validation summary

- `python -m compileall apps/api`: passed
- `pytest` in `apps/api`: passed with 6 tests
- `uvicorn` runtime check: passed
- `/docs`: responded with HTTP 200
- `/openapi.json`: responded with HTTP 200
- `/api/health`: responded with status payload `ok`

## Commands used

```powershell
python -m compileall apps/api
pytest
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
Invoke-WebRequest http://127.0.0.1:8010/api/health
Invoke-WebRequest http://127.0.0.1:8010/docs
Invoke-WebRequest http://127.0.0.1:8010/openapi.json
```

## Notes

- `pytest` was executed with escalated permissions because the Windows sandbox blocked its default temp handling.
- Test database files were redirected to `apps/api/tests/.tmp` and are ignored by `apps/api/.gitignore`.
- The local `uvicorn` process on port `8010` was stopped after validation.
