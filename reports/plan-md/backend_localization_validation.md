# Backend Localization Validation

- Added `GET /api/localization/locales`.
- Added `GET /api/localization/dictionary/{locale}`.
- Added `POST /api/localization/preview`.
- Added `POST /api/localization/validate`.
- Unsupported locale and unknown-key behavior returns explicit HTTP errors.
- Dictionary fallback is deterministic and defaults to `en-US`.
- Python compile validation: passed.
- Full backend pytest suite: 158 passed.
