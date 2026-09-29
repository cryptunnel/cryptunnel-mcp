#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

// stdout is the protocol channel, so every human-facing line goes to stderr
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(
      `${name} is not set. cryptunnel-mcp needs CRYPTUNNEL_MERCHANT_ID and CRYPTUNNEL_API_KEY in its `
      + 'environment - both are on the merchant page in the Cryptunnel cabinet.',
    )
    process.exit(1)
  }
  return value
}

const server = createServer({
  merchantId: required('CRYPTUNNEL_MERCHANT_ID'),
  apiKey: required('CRYPTUNNEL_API_KEY'),
  allowLive: process.env.CRYPTUNNEL_ALLOW_LIVE === '1',
  baseUrl: process.env.CRYPTUNNEL_BASE_URL,
})

await server.connect(new StdioServerTransport())
