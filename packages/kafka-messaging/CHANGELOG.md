# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.40] - 2026-01-17

### Added
- `publishBatch()` method for efficient multi-message publishing
- `onError` callback in `subscribe()` for custom error handling
- `groupId` and `groupIdPrefix` options in `subscribe()` for custom consumer group IDs
- `logOffsets` option in `subscribe()` (opt-in, avoids admin overhead)
- `fetchTopicOffsets()` public method
- Lazy initialization for shared admin client
- Race condition protection in `getProducer()` and `getSharedAdmin()`
- Comprehensive JSDoc documentation
- Mock test suite (no Kafka broker required)
- Integration test suite
- Support for Buffer, string, and null message values in `publish()` and `publishBatch()`

### Changed
- Default group ID separator changed from `---` to `.` (e.g., `my-service.topic`)
- Offset logging now disabled by default for performance
- Test scripts reorganized: `test` (mock), `test:integration`, `test:all`

### Fixed
- Potential race condition when `getProducer()` called concurrently
- Added try/catch in `publish()` to properly handle and re-throw errors
- Graceful handling of non-JSON message payloads in `subscribe()`

## [0.0.1] - 2025-XX-XX

### Added
- Initial release
- `KafkaMessaging` class implementing `IMessaging` interface
- `publish()` and `subscribe()` methods
- `createProducer()`, `createConsumer()`, `createAdmin()` methods
- `createTopic()` and `waitForTopicReady()` utilities
- `shutdown()` for graceful disconnection
- `safeDisconnect()` with timeout protection
- Integration with Kaapi's `ILogger`

[Unreleased]: https://github.com/demingongo/kaapi/compare/e659e2f...HEAD
