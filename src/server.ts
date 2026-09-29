import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Cryptunnel, CryptunnelError } from 'cryptunnel'
import { z } from 'zod'

const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

export interface ServerOptions {
  merchantId: string
  apiKey: string
  /** Without it every payment the server creates is a test payment, whatever the prompt asked. */
  allowLive: boolean
  baseUrl?: string
}

const LIVE_GATE_MESSAGE
  = 'Live payments are disabled on this server: every payment it creates is a sandbox payment. '
    + 'To let an agent create real invoices, set CRYPTUNNEL_ALLOW_LIVE=1 in the server environment '
    + 'and call create_payment with is_test: false again.'

/** Build the server. Kept apart from the stdio entry point so tests can drive it over an in-memory transport. */
export function createServer(options: ServerOptions): McpServer {
  const { merchantId, apiKey, allowLive, baseUrl } = options
  // The client fixes is_test per instance, so one client per family and the tool picks
  const clients = {
    test: new Cryptunnel({ merchantId, apiKey, sandbox: true, baseUrl }),
    live: new Cryptunnel({ merchantId, apiKey, sandbox: false, baseUrl }),
  }
  const client = (isTest: boolean) => (isTest ? clients.test : clients.live)

  const server = new McpServer({ name: 'cryptunnel', version })

  server.registerTool('create_payment', {
    title: 'Create a payment',
    description:
      'Create a Cryptunnel payment and get a checkout url to send the buyer to. On that page the '
      + 'buyer picks a cryptocurrency and pays straight to the merchant\'s own wallet. Use it whenever '
      + 'someone has to be charged. Returns the payment id (keep it - get_payment needs it), the checkout '
      + 'url and the status "created". By default the payment is a sandbox payment: the buyer is offered '
      + 'testnet coins only and nothing real moves. Repeating an external_id returns the payment already '
      + 'created for it instead of a second one.',
    inputSchema: {
      amount: z.number().positive().describe('The amount to charge, in the fiat currency below, e.g. 10 or 49.99'),
      currency: z.string().min(1).describe('The fiat currency the amount is in: USD or EUR'),
      external_id: z.string().min(1).max(255).describe('Your own order or invoice id. One payment per external_id'),
      success_url: z.string().url().optional().describe('Where the buyer is sent after paying'),
      fail_url: z.string().url().optional().describe('Where the buyer is sent after a failure'),
      callback_url: z.string().url().optional().describe('Webhook url called when the payment reaches a terminal status'),
      description: z.string().min(1).max(128).optional().describe('What the buyer is paying for, shown on the checkout page'),
      is_test: z.boolean().default(true).describe(
        'true creates a sandbox payment (testnet coins, no fees, excluded from stats). '
        + 'false creates a real invoice and is only allowed when the server runs with CRYPTUNNEL_ALLOW_LIVE=1',
      ),
    },
  }, async (args) => {
    if (!args.is_test && !allowLive) {
      return failure(LIVE_GATE_MESSAGE)
    }
    return call(() => client(args.is_test).createWidgetPayment({
      amount: args.amount,
      currency: args.currency,
      externalId: args.external_id,
      successUrl: args.success_url,
      failUrl: args.fail_url,
      callbackUrl: args.callback_url,
      metadata: args.description ? { description: args.description } : undefined,
    }))
  })

  server.registerTool('get_payment', {
    title: 'Get a payment',
    description:
      'Look up one payment by the id create_payment returned. The status says where it stands: '
      + '"created" - waiting for the buyer to pick a coin; "pending" - coin picked, transfer awaited; '
      + '"confirmed" or "confirmed_manual" - paid, safe to deliver; "failed"; "expired". Only a payment '
      + 'past "created" carries a crypto amount, currency and wallet address.',
    inputSchema: {
      id: z.string().min(1).describe('The Cryptunnel payment id, e.g. n9cdFaTccYbXecVekHKW8Q'),
    },
  }, async ({ id }) => call(() => clients.test.getPayment(id)))

  server.registerTool('list_payments', {
    title: 'List payments',
    description:
      'List the merchant\'s payments, newest first, with paging. Use it to find a payment when you '
      + 'only know your own order id (external_id), or to review recent activity. Test and live '
      + 'payments are listed together - check is_test on each.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20).describe('Page size, 1 to 100'),
      offset: z.number().int().min(0).default(0).describe('How many payments to skip'),
    },
  }, async ({ limit, offset }) => call(() => clients.test.listPayments({ limit, offset })))

  server.registerTool('list_currencies', {
    title: 'List receivable currencies',
    description:
      'List the cryptocurrencies this merchant can actually receive - only currencies with an active '
      + 'wallet appear, each with its blockchain. An empty list means no wallet is attached for that '
      + 'family yet; a testnet wallet has to be attached in the cabinet before a sandbox payment can be paid.',
    inputSchema: {
      is_test: z.boolean().default(!allowLive).describe(
        'true lists the testnet family sandbox payments are paid in, false the mainnet family',
      ),
    },
  }, async ({ is_test }) => call(() => client(is_test).listCurrencies()))

  return server
}

type ToolResult = { content: { type: 'text', text: string }[], isError?: boolean }

async function call(action: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await action(), null, 2) }] }
  } catch (error) {
    if (error instanceof CryptunnelError) {
      const code = error.code ? ` (${error.code})` : ''
      return failure(`${error.name}${code}: ${error.message}`)
    }
    throw error
  }
}

function failure(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}
