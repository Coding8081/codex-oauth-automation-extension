(function attachBackgroundGrokStep6(root, factory) {
  root.MultiPageBackgroundGrokStep6 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep6Module() {
  function createGrokStep6Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      throwIfStopped,
    } = deps;

    function normalizeGrok2ApiEndpoint(rawEndpoint) {
      const input = String(rawEndpoint || '').trim();
      if (!input) return '';

      const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
      const parsed = new URL(withProtocol);
      const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

      if (pathname === '/' || pathname === '/admin' || pathname === '/admin/token') {
        parsed.pathname = '/v1/admin/tokens';
      } else if (pathname === '/v1/admin' || pathname === '/v1/admin/token') {
        parsed.pathname = '/v1/admin/tokens';
      } else if (/\/tokens$/i.test(pathname)) {
        parsed.pathname = pathname;
      }

      parsed.hash = '';
      return parsed.toString();
    }

    function getGrok2ApiEndpointCandidates(endpoint) {
      if (!endpoint) return [];
      const candidates = [endpoint];
      try {
        const parsed = new URL(endpoint);
        const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        if (pathname === '/v1/admin/tokens') {
          parsed.pathname = '/admin/api/tokens';
          candidates.push(parsed.toString());
        } else if (pathname === '/admin/api/tokens') {
          parsed.pathname = '/v1/admin/tokens';
          candidates.push(parsed.toString());
        }
      } catch { /* ignore invalid normalized endpoint */ }
      return [...new Set(candidates)];
    }

    function extractExistingTokens(data) {
      let existing = [];
      if (Array.isArray(data)) {
        existing = data;
      } else if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data.tokens)) {
          existing = data.tokens;
        } else if (data.tokens && typeof data.tokens === 'object') {
          existing = data.tokens.ssoBasic || [];
        } else if (Array.isArray(data.ssoBasic)) {
          existing = data.ssoBasic;
        } else if (Array.isArray(data.data)) {
          existing = data.data;
        } else if (Array.isArray(data.items)) {
          existing = data.items;
        }
      }

      return existing
        .map((item) => (typeof item === 'object' && item !== null) ? item.token : String(item))
        .filter(Boolean);
    }

    async function executeGrokStep6(state) {
      throwIfStopped();
      const configuredEndpoint = (state.grok2apiEndpoint || '').trim();
      const endpoint = normalizeGrok2ApiEndpoint(configuredEndpoint);
      const endpointCandidates = getGrok2ApiEndpointCandidates(endpoint);
      const apiToken = (state.grok2apiToken || '').trim();
      const ssoToken = state.ssoToken || '';
      const appendMode = state.grok2apiAppend !== false;

      if (!endpoint) {
        await addLog('步骤 6：未配置 grok2api 地址，跳过推送', 'info');
        await completeStepFromBackground(6, { skipped: true });
        return;
      }

      if (!ssoToken) {
        throw new Error('缺少 SSO Token，请先完成步骤 5。');
      }

      const headers = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      };

      if (configuredEndpoint && endpoint !== configuredEndpoint) {
        await addLog(`步骤 6：已将 grok2api 地址规范为 ${endpoint}`, 'info');
      }

      let tokensToPush = [ssoToken];
      let pushEndpoint = endpoint;

      if (appendMode) {
        await addLog('步骤 6：正在查询线上已有 Token...');
        let lastQueryError = null;
        let queried = false;

        try {
          for (const candidate of endpointCandidates) {
            const getResp = await fetch(candidate, { headers, method: 'GET' });
            if (!getResp.ok) {
              lastQueryError = new Error(`查询线上 Token 失败: HTTP ${getResp.status}`);
              if (getResp.status === 404) {
                continue;
              }
              throw lastQueryError;
            }

            const data = await getResp.json();
            const existingTokens = extractExistingTokens(data);

            const seen = new Set();
            const deduped = [];
            for (const t of [...existingTokens, ...tokensToPush]) {
              if (!seen.has(t)) {
                seen.add(t);
                deduped.push(t);
              }
            }
            tokensToPush = deduped;
            pushEndpoint = candidate;
            queried = true;
            if (candidate !== endpoint) {
              await addLog(`步骤 6：当前服务使用新版 Token 接口，已切换为 ${candidate}`, 'info');
            }
            await addLog(`步骤 6：线上 ${existingTokens.length} 个，本次 1 个，合并后共 ${deduped.length} 个`, 'info');
            break;
          }

          if (!queried) {
            throw lastQueryError || new Error('查询线上 Token 失败: 无可用接口');
          }
        } catch (err) {
          throw new Error(`查询线上 Token 失败: ${err.message}，放弃推送以保护存量数据`);
        }
      }

      throwIfStopped();
      await addLog(`步骤 6：正在推送 ${tokensToPush.length} 个 Token 到 grok2api...`);

      let resp = await fetch(pushEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ssoBasic: tokensToPush }),
      });

      if (!appendMode && resp.status === 404) {
        for (const candidate of endpointCandidates) {
          if (candidate === pushEndpoint) continue;
          resp = await fetch(candidate, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ssoBasic: tokensToPush }),
          });
          if (resp.status !== 404) {
            pushEndpoint = candidate;
            await addLog(`步骤 6：当前服务使用新版 Token 接口，已切换为 ${candidate}`, 'info');
            break;
          }
        }
      }

      if (resp.ok) {
        await addLog(`步骤 6：SSO Token 已推送到 grok2api（共 ${tokensToPush.length} 个）`, 'info');
      } else {
        const text = await resp.text().catch(() => '');
        throw new Error(`推送 API 返回异常: HTTP ${resp.status} ${text.slice(0, 200)}`);
      }

      await completeStepFromBackground(6, {});
    }

    return { executeGrokStep6 };
  }

  return { createGrokStep6Executor };
});
