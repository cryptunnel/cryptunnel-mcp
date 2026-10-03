# cryptunnel-mcp

[![Test](https://github.com/cryptunnel/cryptunnel-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/cryptunnel/cryptunnel-mcp/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An MCP server that lets a coding agent - Claude Code, Cursor, anything speaking the Model Context
Protocol - create and look up [Cryptunnel](https://cryptunnel.io) crypto payments. Build a payment
integration by prompting: "create a sandbox payment for 10 USD and give me the checkout link".

It runs on your machine over stdio, wraps the [`cryptunnel`](https://www.npmjs.com/package/cryptunnel)
client, and talks to nothing but `api.cryptunnel.io`. No hosted service, no OAuth.

## Setup

You need your merchant id and an API key, both from the merchant page in the
[cabinet](https://contragent.cryptunnel.io). Node 20+.

### Claude Code

```bash
claude mcp add cryptunnel \
  --env CRYPTUNNEL_MERCHANT_ID=<merchant id> \
  --env CRYPTUNNEL_API_KEY=<api key> \
  -- npx -y cryptunnel-mcp
```

Or, to share it with a project, in `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "cryptunnel": {
      "command": "npx",
      "args": ["-y", "cryptunnel-mcp"],
      "env": {
        "CRYPTUNNEL_MERCHANT_ID": "<merchant id>",
        "CRYPTUNNEL_API_KEY": "<api key>"
      }
    }
  }
}
```

### Cursor

In `.cursor/mcp.json` (per project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "cryptunnel": {
      "command": "npx",
      "args": ["-y", "cryptunnel-mcp"],
      "env": {
        "CRYPTUNNEL_MERCHANT_ID": "<merchant id>",
        "CRYPTUNNEL_API_KEY": "<api key>"
      }
    }
  }
}
```

### Try it

> Create a sandbox payment for 10 USD for order `test-1` and give me the checkout link.

The agent calls `create_payment`, and the link opens the checkout page listing testnet coins. If the
list is empty, attach a testnet wallet to the merchant in the cabinet first - see
[Sandbox and faucets](https://docs.cryptunnel.io/docs/sandbox).

## Environment

| Variable | Meaning |
| --- | --- |
| `CRYPTUNNEL_MERCHANT_ID` | Your public merchant id. Required - the server exits naming it when missing |
| `CRYPTUNNEL_API_KEY` | Your API key. Required |
| `CRYPTUNNEL_ALLOW_LIVE` | Set to `1` to allow real payments. Unset by default - see below |
| `CRYPTUNNEL_BASE_URL` | Point the server at another API host, for a local backend |

## The live-mode gate

An agent holding a live key must not be one prompt away from a real invoice. So by default every
payment this server creates is a sandbox payment: the buyer is offered testnet coins only, nothing
is charged, and the payment stays out of your stats. Asking for `is_test: false` is refused with a
message that names the variable - the payment is not silently downgraded, the agent is told why.

Set `CRYPTUNNEL_ALLOW_LIVE=1` to let the agent create real payments. Even then a payment is a
sandbox one unless the agent passes `is_test: false` explicitly.

## Tools

| Tool | What the agent gets |
| --- | --- |
| `create_payment` | A checkout url for a given amount and currency, keyed by your `external_id` |
| `get_payment` | One payment by id, with its status - deliver on `confirmed` or `confirmed_manual` |
| `list_payments` | The merchant's payments, newest first, paged |
| `list_currencies` | The currencies the merchant can receive - only those with an active wallet |

Every tool returns the API response as JSON text; an API error comes back as a tool error carrying
the API code, e.g. `ValidationError (WALLET_NOT_FOUND): Wallet not found`.

## Links

- [Setup page on the docs portal](https://docs.cryptunnel.io/docs/mcp-server)
- [`cryptunnel` client](https://github.com/cryptunnel/cryptunnel-node) the server wraps
- Support: [GitHub Issues](https://github.com/cryptunnel/cryptunnel-mcp/issues)

MIT licensed.
