# Locale Contract Foundation Report

## Purpose

This report documents the official locale support contracts added to LDCN OS.

The goal is to make language handling a first-class platform concern across pages, wizards, templates, generation, responses, and copilot interactions.

## Files created or updated

- `packages/contracts/locale.contract.ts`
- `packages/contracts/stack.contract.ts`
- `packages/contracts/project.contract.ts`
- `packages/contracts/wizard.contract.ts`
- `packages/contracts/generation.contract.ts`
- `packages/contracts/template.contract.ts`
- `packages/contracts/ldcn.contract.ts`

## Locale contract summary

### `locale.contract.ts`

This file introduces the official locale foundation for the platform.

It defines:
- `LocaleCode`
- `LocaleDefinition`
- `TranslationDictionary`
- `TranslatableText`
- `SupportedLanguage`

Supported locales are:
- `pt-BR` - Portuguese
- `en-US` - English
- `es-ES` - Spanish
- `fr-FR` - French

Design rules captured by this contract:
- `pt-BR` is the initial default locale
- locale-aware text must be structurally representable
- translations can be organized by namespace and dictionary
- translatable content can carry fallback locale and interpolation values

### `stack.contract.ts`

Updated to include `localeSupport`.

This allows each stack to declare which locales it supports.

### `project.contract.ts`

Updated to include `projectLocale`.

This records the selected locale at the project level.

### `wizard.contract.ts`

Updated to include `locale`.

This allows the wizard flow to run in the user-selected language.

### `generation.contract.ts`

Updated to include `outputLocale`.

This ensures generated projects can be created in the chosen language.

### `template.contract.ts`

Updated to include `supportedLocales`.

This allows template definitions to clearly state locale compatibility.

### `ldcn.contract.ts`

Updated to include:
- `conversationLocale`
- `voiceLocale`

This allows the LDCN copilot session to track the active language for text and voice interactions.

## Architecture notes

- No i18n implementation was added.
- No runtime translation engine was introduced.
- No frontend or backend logic was added.
- The work is limited to typed contracts and structural locale metadata.

## Outcome

LDCN OS now has an official contract layer for locale-aware behavior.

This creates the correct foundation for future translation systems, locale-aware UI, backend payloads, generated outputs, and language-specific copilot responses.
