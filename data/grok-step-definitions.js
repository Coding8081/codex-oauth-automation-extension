(function attachGrokStepDefinitions(root, factory) {
  root.MultiPageGrokStepDefinitions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createGrokStepDefinitionsModule() {
  const GROK_STEP_DEFINITIONS = [
    { id: 1, order: 10, key: 'grok-open-signup', title: '打开 x.ai 注册页' },
    { id: 2, order: 20, key: 'grok-submit-email', title: '创建临时邮箱并提交' },
    { id: 3, order: 30, key: 'grok-verify-code', title: '获取并提交验证码' },
    { id: 4, order: 40, key: 'grok-fill-profile', title: '填写个人资料' },
    { id: 5, order: 50, key: 'grok-extract-sso', title: '提取 SSO Cookie' },
    { id: 6, order: 60, key: 'grok-push-to-api', title: '推送到 grok2api' },
  ];

  function getSteps() {
    return GROK_STEP_DEFINITIONS.map((step) => ({ ...step }));
  }

  function getStepById(id) {
    const numericId = Number(id);
    const match = GROK_STEP_DEFINITIONS.find((step) => step.id === numericId);
    return match ? { ...match } : null;
  }

  return {
    GROK_STEP_DEFINITIONS,
    getStepById,
    getSteps,
  };
});
