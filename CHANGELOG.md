# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package follows semantic versioning.

## [1.0.0] - 2026-09-29

### Added

- stdio MCP server over `@modelcontextprotocol/sdk`, wrapping the `cryptunnel` npm client.
- Four curated tools: `create_payment`, `get_payment`, `list_payments`, `list_currencies`, with
  descriptions written for an agent reader.
- Configuration by environment: `CRYPTUNNEL_MERCHANT_ID`, `CRYPTUNNEL_API_KEY`, optional
  `CRYPTUNNEL_BASE_URL`.
- Live-mode gate: every payment is a sandbox payment unless `CRYPTUNNEL_ALLOW_LIVE=1` is set, and an
  explicit `is_test: false` without it is refused with a message naming the variable.
