const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('content utils identifies accounts.x.ai as grok signup page', () => {
  const source = fs.readFileSync('content/utils.js', 'utf8');
  let listener = null;
  const windowObject = {};
  const chrome = {
    runtime: {
      sendMessage() {},
      onMessage: {
        addListener(handler) {
          listener = handler;
        },
      },
    },
  };
  const location = {
    href: 'https://accounts.x.ai/sign-up?redirect=grok-com',
    hostname: 'accounts.x.ai',
  };

  new Function('window', 'location', 'chrome', 'self', source)(windowObject, location, chrome, {});

  let response = null;
  listener({ type: 'PING' }, {}, (payload) => { response = payload; });
  assert.deepEqual(response, {
    ok: true,
    source: 'grok-signup-page',
  });
});
