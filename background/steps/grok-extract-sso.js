(function attachBackgroundGrokStep5(root, factory) {
  root.MultiPageBackgroundGrokStep5 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStep5Module() {
  function createGrokStep5Executor(deps = {}) {
    const {
      addLog,
      chrome,
      completeStepFromBackground,
      setState,
      throwIfStopped,
    } = deps;

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function executeGrokStep5() {
      await addLog('步骤 5：正在提取 SSO Cookie...');
      const timeout = 30000;
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        throwIfStopped();

        const cookies = await chrome.cookies.getAll({ domain: '.x.ai', name: 'sso' });
        if (cookies && cookies.length > 0) {
          const ssoToken = cookies[0].value;
          if (ssoToken) {
            await setState({ ssoToken });
            await addLog(`步骤 5：SSO Cookie 提取成功（${ssoToken.length} 字符）`, 'info');
            await completeStepFromBackground(5, { ssoToken });
            return;
          }
        }

        await sleep(1000);
      }

      throw new Error('提取 SSO Cookie 超时（30秒），注册可能未成功完成');
    }

    return { executeGrokStep5 };
  }

  return { createGrokStep5Executor };
});
