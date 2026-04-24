(function attachBackgroundGrokStep3(root, factory) {
  root.MultiPageBackgroundGrokStep3 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep3Module() {
  function createGrokStep3Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getTabId,
      isTabAlive,
      sendToContentScriptResilient,
      grokTempMail,
      throwIfStopped,
    } = deps;

    async function executeGrokStep3(state) {
      throwIfStopped();
      const mailToken = state.grokMailToken;
      if (!mailToken) {
        throw new Error('缺少临时邮箱 Token，请先完成步骤 2。');
      }

      await addLog('步骤 3：正在轮询验证码...');
      const code = await grokTempMail.pollGrokVerificationCode(mailToken, state);
      if (!code) {
        throw new Error('获取验证码超时');
      }

      await addLog(`步骤 3：获取到验证码 ${code}，正在提交...`);
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
        logMessage: '步骤 3：x.ai 页面内容脚本未就绪...',
      });

      const result = await sendToContentScriptResilient('grok-signup-page', {
        type: 'EXECUTE_STEP',
        step: 3,
        source: 'background',
        payload: { code },
      }, {
        timeoutMs: 60000,
        retryDelayMs: 700,
        logMessage: '步骤 3：x.ai 页面通信未就绪...',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      await completeStepFromBackground(3, { verificationCode: code });
    }

    return { executeGrokStep3 };
  }

  return { createGrokStep3Executor };
});
