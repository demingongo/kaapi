# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.44] - 2026-05-08

### Changed

- removed `overrideResponses` from docs modifiers, now responses are always overridden by default. It makes sense as there are no other way to provide responses anyway, and it simplifies the API.

## [0.0.43] - 2026-05-08

### Added

- `options.id` in route settings to set operationId in OpenAPI spec
- `overrideResponses` in route modifiers to allow overriding responses instead of merging them
- `applyModifiers` function to apply modifiers to a server route

## [0.0.42] - 2026-01-24

### Added

- `publish()` method in request for publishing from http handler

## [0.0.1] - 2025-XX-XX

### Added

- Initial release

[Unreleased]: https://github.com/demingongo/kaapi/compare/v0.0.43...HEAD
[0.0.43]: https://github.com/demingongo/kaapi/compare/v0.0.42...v0.0.43
[0.0.42]: https://github.com/demingongo/kaapi/commits/v0.0.42
