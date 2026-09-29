import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { createServer } from '../dist/server.js'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(status, payload) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), body: init.body ? JSON.parse(init.body) : undefined })
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
  }
  return calls
}

async function connect(options = {}) {
  const server = createServer({ merchantId: 'merchant-id', apiKey: 'ct_live_key', allowLive: false, ...options })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

const text = result => result.content[0].text

test('advertises the four curated tools', async () => {
  const client = await connect()

  const { tools } = await client.listTools()

  assert.deepEqual(tools.map(tool => tool.name).sort(), ['create_payment', 'get_payment', 'list_currencies', 'list_payments'])
  assert.ok(tools.every(tool => tool.description.length > 80), 'descriptions are written for an agent, not copied from the spec')
})

test('create_payment makes a sandbox payment by default', async () => {
  const calls = stubFetch(200, { id: 'pay-1', url: 'https://pay.cryptunnel.io/pay-1', status: 'created', is_test: true })
  const client = await connect()

  const result = await client.callTool({ name: 'create_payment', arguments: { amount: 10, currency: 'USD', external_id: 'order-1' } })

  assert.ok(!result.isError)
  assert.equal(calls[0].url.pathname, '/v1/payments/widget')
  assert.equal(calls[0].body.is_test, true)
  assert.equal(calls[0].body.external_id, 'order-1')
  assert.match(text(result), /https:\/\/pay\.cryptunnel\.io\/pay-1/)
})

test('create_payment forwards the optional fields as the API spells them', async () => {
  const calls = stubFetch(200, { id: 'pay-1' })
  const client = await connect()

  await client.callTool({ name: 'create_payment', arguments: {
    amount: 10, currency: 'USD', external_id: 'order-1', success_url: 'https://shop/ok', description: 'PRO plan',
  } })

  assert.equal(calls[0].body.success_url, 'https://shop/ok')
  assert.deepEqual(calls[0].body.metadata, { description: 'PRO plan' })
  assert.equal('fail_url' in calls[0].body, false)
})

test('create_payment refuses a live payment while the gate is closed, without touching the API', async () => {
  const calls = stubFetch(200, {})
  const client = await connect({ allowLive: false })

  const result = await client.callTool({ name: 'create_payment', arguments: { amount: 10, currency: 'USD', external_id: 'order-1', is_test: false } })

  assert.equal(result.isError, true)
  assert.match(text(result), /CRYPTUNNEL_ALLOW_LIVE=1/)
  assert.equal(calls.length, 0)
})

test('create_payment makes a live payment once the gate is open', async () => {
  const calls = stubFetch(200, { id: 'pay-1', is_test: false })
  const client = await connect({ allowLive: true })

  const result = await client.callTool({ name: 'create_payment', arguments: { amount: 10, currency: 'USD', external_id: 'order-1', is_test: false } })

  assert.ok(!result.isError)
  assert.equal(calls[0].body.is_test, false)
})

test('the gate open still defaults to a sandbox payment', async () => {
  const calls = stubFetch(200, { id: 'pay-1' })
  const client = await connect({ allowLive: true })

  await client.callTool({ name: 'create_payment', arguments: { amount: 10, currency: 'USD', external_id: 'order-1' } })

  assert.equal(calls[0].body.is_test, true)
})

test('list_currencies follows the gate: testnet family closed, mainnet open', async () => {
  for (const [allowLive, family] of [[false, 'true'], [true, 'false']]) {
    const calls = stubFetch(200, [])
    const client = await connect({ allowLive })

    await client.callTool({ name: 'list_currencies', arguments: {} })

    assert.equal(calls[0].url.searchParams.get('is_test'), family, `allowLive=${allowLive}`)
  }
})

test('get_payment passes the id through', async () => {
  const calls = stubFetch(200, { id: 'pay-1', status: 'confirmed' })
  const client = await connect()

  const result = await client.callTool({ name: 'get_payment', arguments: { id: 'pay-1' } })

  assert.equal(calls[0].url.pathname, '/v1/payments/pay-1')
  assert.match(text(result), /"status": "confirmed"/)
})

test('list_payments pages with the given limit and offset', async () => {
  const calls = stubFetch(200, { items: [], total: 0, limit: 5, offset: 10 })
  const client = await connect()

  await client.callTool({ name: 'list_payments', arguments: { limit: 5, offset: 10 } })

  assert.equal(calls[0].url.searchParams.get('limit'), '5')
  assert.equal(calls[0].url.searchParams.get('offset'), '10')
})

test('API errors come back as tool errors carrying the API code', async () => {
  stubFetch(400, { code: 'WALLET_NOT_FOUND', message: 'Wallet not found' })
  const client = await connect()

  const result = await client.callTool({ name: 'get_payment', arguments: { id: 'pay-1' } })

  assert.equal(result.isError, true)
  assert.match(text(result), /ValidationError \(WALLET_NOT_FOUND\): Wallet not found/)
})

test('the base url option reaches every call', async () => {
  const calls = stubFetch(200, {})
  const client = await connect({ baseUrl: 'http://localhost:3000' })

  await client.callTool({ name: 'get_payment', arguments: { id: 'pay-1' } })

  assert.equal(calls[0].url.origin, 'http://localhost:3000')
})
