# Generated Projects Reorganization

Status: completed

Final buckets:
- `generated-projects/active`: 8 directories after validation
- `generated-projects/archived`: 16 directories after validation
- `generated-projects/temp`: 5 directories after validation

Moved to active:
- `landing-project_30c39ca11e8a`
- `landing-project_37ff64840b50`
- `landing-project_c7d0a82ca702`
- `tree-project_2a16ad5aadc8`
- `tree-project_3f2a5b16fa7a`
- `tree-project_478b28496c3b`

Added by validation after reorganization:
- `landing-project_120cea054eee`
- `tree-project_df0f2421a667`

Moved to archived:
- `download-preview-project_28393a074998`
- `download-preview-project_364ef5b43bf0`
- `download-preview-project_62a192f1a708`
- `download-preview-project_6315309db2ae`
- `download-preview-project_74c40fe0e120`
- `download-preview-project_a278ac986af0`
- `download-preview-project_bf5542740b89`
- `download-preview-project_d2cb485555e7`

Added by validation after reorganization:
- `download-preview-project_02b220d4d316`
- `download-preview-project_42814d3a2ff2`
- `download-preview-project_4506070b462c`
- `download-preview-project_5addf37d6259`
- `download-preview-project_7ecb2d6fd586`
- `download-preview-project_944e4679cb67`
- `download-preview-project_d14362e13a63`
- `download-preview-project_dccd083e365d`

Moved to temp:
- `existing-project_218d7f2fe310`
- `existing-project_5f46dbbc4f61`
- `existing-project_a2e512144d85`
- `existing-project_c90ea1bea3b3`

Added by validation after reorganization:
- `existing-project_590c205c4b4e`

Path updates:
- Frontend local generation placeholder now points to `generated-projects/active/<project-id>`.
- Backend local generation tests now write valid outputs to `active`, expected conflict placeholders to `temp`, and download-preview test artifacts to `archived`.
- Frontend Playwright mocks now use `generated-projects/active/local-static`.

Deletion policy:
- No generated project was deleted.
- Existing generated directories were moved only within `generated-projects`.
