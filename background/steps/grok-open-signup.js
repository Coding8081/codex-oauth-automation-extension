(function attachBackgroundGrokStep1(root, factory) {
  root.MultiPageBackgroundGrokStep1 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep1Module() {
  function createGrokStep1Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      reuseOrCreateTab,
      registerTab,
      sendToContentScriptResilient,
      ensureContentScriptReadyOnTab,
    } = deps;

    const GROK_SIGNUP_URL = 'https://accounts.x.ai/sign-up?redirect=grok-com';

    async function executeGrokStep1() {
      await addLog('步骤 1：正在打开 x.ai 注册页...');
      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/grok-signup-page.js'];
      const tabId = await reuseOrCreateTab('grok-signup-page', GROK_SIGNUP_URL, {
        inject: injectFiles,
        injectSource: 'grok-signup-page',
      });

      if (registerTab) {
        await registerTab('grok-signup-page', tabId);
      }

      await ensureContentScriptReadyOnTab('grok-signup-page', tabId, {
        inject: injectFiles,
        injectSource: 'grok-signup-page',
        timeoutMs: 30000,
        retryDelayMs: 900,
        logMessage: '步骤 1：x.ai 注册页正在加载...',
      });

      await addLog('步骤 1：正在点击邮箱注册入口...');
      const result = await sendToContentScriptResilient('grok-signup-page', {
        type: 'EXECUTE_STEP',
        step: 1,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 15000,
        retryDelayMs: 700,
        logMessage: '步骤 1：x.ai 页面通信未就绪...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await completeStepFromBackground(1, {});
    }

    return { executeGrokStep1 };
  }

  return { createGrokStep1Executor };
});
