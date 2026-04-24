(function attachBackgroundGrokStep4(root, factory) {
  root.MultiPageBackgroundGrokStep4 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep4Module() {
  function createGrokStep4Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getTabId,
      isTabAlive,
      sendToContentScriptResilient,
      setState,
      throwIfStopped,
    } = deps;

    function generateGrokPassword() {
      const array = new Uint8Array(4);
      crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
      const urlSafeArr = new Uint8Array(6);
      crypto.getRandomValues(urlSafeArr);
      const urlSafe = btoa(String.fromCharCode(...urlSafeArr)).replace(/[+/=]/g, 'x');
      return `N${hex}!a7#${urlSafe.slice(0, 8)}`;
    }

    async function executeGrokStep4(state) {
      throwIfStopped();

      const firstName = 'Neo';
      const lastName = 'Lin';
      const password = generateGrokPassword();

      await setState({ grokPassword: password });
      await addLog(`步骤 4：正在填写注册资料 ${firstName} ${lastName}...`);

      const signupTabId = await getTabId('grok-signup-page');
      if (!signupTabId || !(await isTabAlive('grok-signup-page'))) {
        throw new Error('x.ai 注册页标签页已关闭，请先重新执行步骤 1。');
      }

      const injectFiles = ['content/activation-utils.js', 'content/utils.js', 'content/grok-signup-page.js'];
      await ensureContentScriptReadyOnTab('grok-signup-page', signupTabId, {
        inject: injectFiles,
        injectSource: 'grok-signup-page',
        timeoutMs: 30000,
        retryDelayMs: 900,
        logMessage: '步骤 4：x.ai 页面内容脚本未就绪...',
      });

      const result = await sendToContentScriptResilient('grok-signup-page', {
        type: 'EXECUTE_STEP',
        step: 4,
        source: 'background',
        payload: { firstName, lastName, password },
      }, {
        timeoutMs: 45000,
        retryDelayMs: 700,
        logMessage: '步骤 4：x.ai 页面通信未就绪...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await completeStepFromBackground(4, { firstName, lastName, grokPassword: password });
    }

    return { executeGrokStep4 };
  }

  return { createGrokStep4Executor };
});
