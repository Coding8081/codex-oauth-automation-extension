(function attachBackgroundGrokStep2(root, factory) {
  root.MultiPageBackgroundGrokStep2 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep2Module() {
  function createGrokStep2Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getTabId,
      isTabAlive,
      sendToContentScriptResilient,
      setState,
      grokTempMail,
      throwIfStopped,
    } = deps;

    async function executeGrokStep2(state) {
      throwIfStopped();
      await addLog('步骤 2：正在创建临时邮箱...');

      const { email, mailToken } = await grokTempMail.createGrokTempEmail(state);
      await setState({ email, grokMailToken: mailToken });

      throwIfStopped();
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
        logMessage: '步骤 2：x.ai 页面内容脚本未就绪...',
      });

      await addLog(`步骤 2：正在提交邮箱 ${email}...`);
      const result = await sendToContentScriptResilient('grok-signup-page', {
        type: 'EXECUTE_STEP',
        step: 2,
        source: 'background',
        payload: { email },
      }, {
        timeoutMs: 20000,
        retryDelayMs: 700,
        logMessage: '步骤 2：x.ai 页面通信未就绪...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await completeStepFromBackground(2, { email });
    }

    return { executeGrokStep2 };
  }

  return { createGrokStep2Executor };
});
