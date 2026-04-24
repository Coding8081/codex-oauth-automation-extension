(function attachGrokTempMail(root, factory) {
  root.MultiPageBackgroundGrokTempMail = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokTempMailModule() {
  function createGrokTempMailHelpers(deps = {}) {
    const { addLog } = deps;

    function generateLocalPart(length) {
      const len = length || (8 + Math.floor(Math.random() * 5));
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < len; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    function generateMailPassword() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 18; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }

    function detectMailProvider(apiBase) {
      try {
        const hostname = new URL(apiBase).hostname.toLowerCase();
        if (hostname.includes('duckmail')) return 'duckmail';
      } catch (_) { /* ignore */ }
      return 'generic';
    }

    function extractDuckMailToken(payload) {
      for (const key of ['token', 'jwt', 'access_token', 'id_token']) {
        const value = payload[key];
        if (value) return String(value);
      }
      return '';
    }

    function extractDuckMailDomainName(item) {
      for (const key of ['domain', 'name', 'address']) {
        const value = item[key];
        if (value) return String(value);
      }
      return '';
    }

    async function resolveDuckMailDomain(apiBase, adminPassword, configuredDomain) {
      if (configuredDomain) return configuredDomain;

      const headers = {};
      if (adminPassword) headers['Authorization'] = `Bearer ${adminPassword}`;

      const res = await fetch(`${apiBase}/domains?page=1`, { headers });
      if (!res.ok) {
        throw new Error(`获取 DuckMail 域名失败: HTTP ${res.status}`);
      }

      const data = await res.json();
      const domains = data['hydra:member'] || data.data || data.results || [];
      if (!Array.isArray(domains) || domains.length === 0) {
        throw new Error('DuckMail 域名列表为空，请在配置里填写邮箱域名');
      }

      const publicVerified = [];
      const verified = [];
      const fallback = [];

      for (const item of domains) {
        if (typeof item !== 'object') continue;
        const domain = extractDuckMailDomainName(item);
        if (!domain) continue;
        fallback.push(domain);
        if (item.isVerified === true) {
          verified.push(domain);
          if (item.isPublic === true || !item.ownerId) {
            publicVerified.push(domain);
          }
        }
      }

      for (const candidates of [publicVerified, verified, fallback]) {
        if (candidates.length > 0) return candidates[0];
      }
      throw new Error('DuckMail 域名列表里没有可用域名');
    }

    async function createDuckMailEmail(apiBase, adminPassword, configuredDomain) {
      const domain = await resolveDuckMailDomain(apiBase, adminPassword, configuredDomain);
      const createHeaders = { 'Content-Type': 'application/json' };
      if (adminPassword) createHeaders['Authorization'] = `Bearer ${adminPassword}`;

      let lastError = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const emailLocal = generateLocalPart(8 + Math.floor(Math.random() * 5));
        const email = `${emailLocal}@${domain}`;
        const password = generateMailPassword();

        const res = await fetch(`${apiBase}/accounts`, {
          method: 'POST',
          headers: createHeaders,
          body: JSON.stringify({ address: email, password, expiresIn: 86400 }),
        });

        if (res.status === 200 || res.status === 201) {
          const authRes = await fetch(`${apiBase}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password }),
          });
          if (!authRes.ok) {
            throw new Error(`登录 DuckMail 邮箱失败: HTTP ${authRes.status}`);
          }

          const tokenData = await authRes.json();
          const mailToken = extractDuckMailToken(tokenData);
          if (!mailToken) {
            throw new Error(`DuckMail token 接口未返回 token`);
          }

          if (addLog) addLog(`DuckMail 临时邮箱创建成功: ${email}`, 'info');
          return { email, password, mailToken };
        }

        if (res.status === 409 || res.status === 422) {
          lastError = `HTTP ${res.status}`;
          continue;
        }

        throw new Error(`创建 DuckMail 邮箱失败: HTTP ${res.status}`);
      }

      throw new Error(`创建 DuckMail 邮箱失败，重试后仍冲突: ${lastError}`);
    }

    async function createGenericTempEmail(apiBase, adminPassword, domain, sitePassword) {
      if (!adminPassword) throw new Error('temp_mail_admin_password 未设置');
      if (!domain) throw new Error('temp_mail_domain 未设置');

      const emailLocal = generateLocalPart(8 + Math.floor(Math.random() * 5));
      const headers = {
        'Content-Type': 'application/json',
        'x-admin-auth': adminPassword,
      };
      if (sitePassword) headers['x-custom-auth'] = sitePassword;

      const res = await fetch(`${apiBase}/admin/new_address`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: emailLocal, domain, enablePrefix: false }),
      });

      if (!res.ok) {
        throw new Error(`创建邮箱失败: HTTP ${res.status}`);
      }

      const data = await res.json();
      const email = data.address || '';
      const mailToken = data.jwt || '';
      if (!email || !mailToken) {
        throw new Error(`接口返回缺少 address/jwt`);
      }

      if (addLog) addLog(`Temp Mail 临时邮箱创建成功: ${email}`, 'info');
      return { email, password: data.password || '', mailToken };
    }

    async function createGrokTempEmail(state) {
      const apiBase = (state.grokTempMailApi || '').trim().replace(/\/+$/, '');
      if (!apiBase) throw new Error('临时邮箱 API 地址未设置');

      const adminPassword = state.grokTempMailPassword || '';
      const domain = state.grokTempMailDomain || '';
      const provider = detectMailProvider(apiBase);

      if (provider === 'duckmail') {
        return createDuckMailEmail(apiBase, adminPassword, domain);
      }
      return createGenericTempEmail(apiBase, adminPassword, domain, '');
    }

    async function fetchDuckMailMessages(apiBase, mailToken) {
      const headers = {};
      if (mailToken) headers['Authorization'] = `Bearer ${mailToken}`;

      const res = await fetch(`${apiBase}/messages?page=1`, { headers });
      if (!res.ok) return [];

      const data = await res.json();
      if (typeof data !== 'object') return [];
      return data['hydra:member'] || data.data || data.results || data.messages || [];
    }

    async function fetchGenericMessages(apiBase, mailToken) {
      const headers = {};
      if (mailToken) headers['Authorization'] = `Bearer ${mailToken}`;

      const res = await fetch(`${apiBase}/api/mails?limit=20&offset=0`, { headers });
      if (!res.ok) return [];

      const data = await res.json();
      if (typeof data !== 'object') return [];
      return data.results || data.data || [];
    }

    async function fetchMessages(apiBase, mailToken) {
      const provider = detectMailProvider(apiBase);
      if (provider === 'duckmail') {
        return fetchDuckMailMessages(apiBase, mailToken);
      }
      return fetchGenericMessages(apiBase, mailToken);
    }

    function normalizeMessageId(msgId) {
      let raw = String(msgId || '').trim();
      if (raw.startsWith('/')) raw = raw.split('/').pop();
      return raw;
    }

    async function fetchDuckMailDetail(apiBase, mailToken, msgId) {
      const id = normalizeMessageId(msgId);
      const headers = {};
      if (mailToken) headers['Authorization'] = `Bearer ${mailToken}`;

      const res = await fetch(`${apiBase}/messages/${id}`, { headers });
      if (!res.ok) return null;

      const data = await res.json();
      if (typeof data !== 'object') return null;

      if (!data.text && !data.html && !data.raw && !data.source) {
        try {
          const srcRes = await fetch(`${apiBase}/sources/${id}`, { headers });
          if (srcRes.ok) {
            const srcData = await srcRes.json();
            if (typeof srcData === 'object') {
              data.raw = srcData.data || srcData.source || srcData.raw || '';
            }
          }
        } catch (_) { /* ignore */ }
      }
      return data;
    }

    async function fetchGenericDetail(apiBase, mailToken, msgId) {
      const headers = {};
      if (mailToken) headers['Authorization'] = `Bearer ${mailToken}`;

      const res = await fetch(`${apiBase}/api/mail/${msgId}`, { headers });
      if (!res.ok) return null;

      const data = await res.json();
      return typeof data === 'object' ? data : null;
    }

    async function fetchEmailDetail(apiBase, mailToken, msgId) {
      const provider = detectMailProvider(apiBase);
      if (provider === 'duckmail') {
        return fetchDuckMailDetail(apiBase, mailToken, msgId);
      }
      return fetchGenericDetail(apiBase, mailToken, msgId);
    }

    function stringifyMailPart(value) {
      if (value == null) return '';
      if (Array.isArray(value)) return value.map(stringifyMailPart).filter(Boolean).join('\n');
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }

    function htmlToText(html) {
      let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
      text = text.replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<\/p>/gi, '\n');
      text = text.replace(/<[^>]+>/g, ' ');
      text = text.replace(/[ \t\r\f\v]+/g, ' ');
      return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }

    function extractMailContent(detail) {
      const parts = [detail.subject, detail.text, detail.html, detail.raw, detail.source]
        .filter(Boolean)
        .map(stringifyMailPart);
      const direct = parts.join('\n');
      if (detail.text || detail.html) return direct;

      const raw = detail.raw || detail.source;
      if (typeof raw === 'string' && raw.includes('@')) {
        const textPart = htmlToText(raw);
        return `${direct}\n${textPart}`;
      }
      return direct;
    }

    function extractVerificationCode(content) {
      if (!content) return null;

      // Pattern 1: Grok format XXX-XXX
      let m = content.match(/(?<![A-Z0-9-])([A-Z0-9]{3}-[A-Z0-9]{3})(?![A-Z0-9-])/);
      if (m) return m[1];

      // Pattern 2: With label
      m = content.match(/(?:verification code|验证码|your code)[:\s]*[<>\s]*([A-Z0-9]{3}-[A-Z0-9]{3})\b/i);
      if (m) return m[1];

      // Pattern 3: HTML styled
      m = content.match(/background-color:\s*#F3F3F3[^>]*>[\s\S]*?([A-Z0-9]{3}-[A-Z0-9]{3})[\s\S]*?<\/p>/);
      if (m) return m[1];

      // Pattern 4: Subject line 6-digit
      m = content.match(/Subject:.*?(\d{6})/);
      if (m && m[1] !== '177010') return m[1];

      // Pattern 5: HTML tag wrapped 6-digit
      const codes5 = content.match(/>\s*(\d{6})\s*</g);
      if (codes5) {
        for (const c of codes5) {
          const num = c.replace(/[><\s]/g, '');
          if (num !== '177010') return num;
        }
      }

      // Pattern 6: Standalone 6-digit
      const codes6 = content.match(/(?<![&#\d])(\d{6})(?![&#\d])/g);
      if (codes6) {
        for (const c of codes6) {
          if (c !== '177010') return c;
        }
      }

      return null;
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function pollGrokVerificationCode(mailToken, state, options = {}) {
      const apiBase = (state.grokTempMailApi || '').trim().replace(/\/+$/, '');
      const timeout = options.timeout || 120000;
      const interval = options.interval || 3000;
      const startTime = Date.now();
      const seenIds = new Set();

      if (addLog) addLog('正在轮询临时邮箱等待验证码...', 'info');

      while (Date.now() - startTime < timeout) {
        const messages = await fetchMessages(apiBase, mailToken);
        for (const msg of messages) {
          if (typeof msg !== 'object') continue;
          const msgId = msg.id;
          if (!msgId || seenIds.has(msgId)) continue;
          seenIds.add(msgId);

          const detail = await fetchEmailDetail(apiBase, mailToken, String(msgId));
          if (!detail) continue;

          const content = extractMailContent(detail);
          const code = extractVerificationCode(content);
          if (code) {
            const normalized = code.replace(/-/g, '');
            if (addLog) addLog(`提取到验证码: ${code}`, 'info');
            return normalized;
          }
        }
        await sleep(interval);
      }

      throw new Error(`轮询验证码超时（${Math.round(timeout / 1000)}秒）`);
    }

    return {
      createGrokTempEmail,
      pollGrokVerificationCode,
    };
  }

  return { createGrokTempMailHelpers };
});
