const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function createExecutor(fetchImpl) {
  const source = fs.readFileSync('background/steps/grok-push-to-api.js', 'utf8');
  const globalScope = { fetch: fetchImpl };
  const api = new Function('self', 'fetch', `${source}; return self.MultiPageBackgroundGrokStep6;`)(globalScope, fetchImpl);
  const events = {
    logs: [],
    completions: [],
  };
  const executor = api.createGrokStep6Executor({
    addLog: async (message, level = 'info') => events.logs.push({ message, level }),
    completeStepFromBackground: async (step, payload) => events.completions.push({ step, payload }),
    throwIfStopped: () => {},
  });
  return { executor, events };
}

test('grok step 6 normalizes service root endpoint before querying and pushing', async () => {
  const calls = [];
  const { executor, events } = createExecutor(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body || '' });
    if ((options.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => ({ tokens: { ssoBasic: [] } }) };
    }
    return { ok: true, status: 200, text: async () => '' };
  });

  await executor.executeGrokStep6({
    grok2apiEndpoint: '127.0.0.1:8000',
    grok2apiToken: 'admin-key',
    ssoToken: 'sso-token',
    grok2apiAppend: true,
  });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['GET', 'http://127.0.0.1:8000/v1/admin/tokens'],
    ['POST', 'http://127.0.0.1:8000/v1/admin/tokens'],
  ]);
  assert.equal(JSON.parse(calls[1].body).ssoBasic[0], 'sso-token');
  assert.equal(events.logs.some(({ message }) => /已将 grok2api 地址规范为 http:\/\/127\.0\.0\.1:8000\/v1\/admin\/tokens/.test(message)), true);
  assert.deepEqual(events.completions, [{ step: 6, payload: {} }]);
});

test('grok step 6 converts admin token page endpoint to tokens API endpoint', async () => {
  const calls = [];
  const { executor } = createExecutor(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if ((options.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => ({ ssoBasic: ['old-token'] }) };
    }
    return { ok: true, status: 200, text: async () => '' };
  });

  await executor.executeGrokStep6({
    grok2apiEndpoint: 'http://localhost:8000/admin/token',
    grok2apiToken: 'admin-key',
    ssoToken: 'new-token',
    grok2apiAppend: true,
  });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['GET', 'http://localhost:8000/v1/admin/tokens'],
    ['POST', 'http://localhost:8000/v1/admin/tokens'],
  ]);
});
