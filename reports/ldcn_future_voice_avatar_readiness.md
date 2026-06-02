# LDCN Future Voice and Avatar Readiness

## Current State

The LDCN layer is present as a visual and structural shell only.

## Reserved Future Types

- `LdcnVoiceState`
- `LdcnAvatarState`
- `LdcnAction`
- `LdcnSuggestion`

## What Is Explicitly Not Enabled

- Voice playback.
- Voice capture.
- Avatar rendering logic.
- Agent execution.
- AI model calls.

## Readiness Notes

- The contract now has a stable place for future voice and avatar state.
- The UI exposes where those layers would live without making them functional.
- The topbar, dashboard, wizard, and project detail surfaces can carry future presence states without changing the backend contract surface.

## Implementation Constraint

Any future voice or avatar layer should remain opt-in and isolated from the current passive presence system.
