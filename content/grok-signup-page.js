(function attachGrokSignupPage(root) {
  if (root.__grokSignupPageLoaded) return;
  root.__grokSignupPageLoaded = true;

  let stopRequested = false;

  function resetStopState() { stopRequested = false; }
  function throwIfStopped() { if (stopRequested) throw new Error('stopped'); }

  function log(message, level) {
    try {
      chrome.runtime.sendMessage({ type: 'LOG', message: `[grok-page] ${message}`, level: level || 'info' });
    } catch (_) { /* ignore */ }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function reportComplete(step, payload) {
    try {
      chrome.runtime.sendMessage({ type: 'STEP_COMPLETE', step, payload });
    } catch (_) { /* ignore */ }
  }

  function reportError(step, errorMessage) {
    try {
      chrome.runtime.sendMessage({ type: 'STEP_ERROR', step, error: errorMessage });
    } catch (_) { /* ignore */ }
  }

  function isVisible(node) {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function pickInput(selector) {
    return Array.from(document.querySelectorAll(selector)).find((node) => {
      return isVisible(node) && !node.disabled && !node.readOnly;
    }) || null;
  }

  function setInputValue(input, value) {
    if (!input) return false;
    input.focus();
    input.click();

    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    const tracker = input._valueTracker;
    if (tracker) tracker.setValue('');

    if (nativeSetter) {
      nativeSetter.call(input, '');
      nativeSetter.call(input, value);
    } else {
      input.value = '';
      input.value = value;
    }

    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    return String(input.value || '') === String(value || '');
  }

  function dispatchInputEvents(input, value) {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- Step 1: Click "Sign up with email" button ----

  async function grokStep1_clickEmailSignup() {
    log('步骤 1：正在点击"使用邮箱注册"按钮...');
    const timeout = 10000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      throwIfStopped();
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const target = candidates.find((node) => {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '').toLowerCase();
        return text.includes('使用邮箱注册') || text.includes('signupwithemail') || text.includes('signupemail') || text.includes('continuewithemail') || text === 'email';
      });

      if (target) {
        target.click();
        log('步骤 1：已点击邮箱注册按钮');
        return { clicked: true };
      }
      await sleep(500);
    }
    throw new Error('未找到"使用邮箱注册"按钮');
  }

  // ---- Step 2: Fill email and submit ----

  async function grokStep2_fillEmailAndSubmit(payload) {
    const email = payload.email;
    if (!email) throw new Error('缺少邮箱地址');

    log(`步骤 2：正在填写邮箱 ${email}...`);
    const timeout = 15000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      throwIfStopped();
      const input = Array.from(document.querySelectorAll(
        'input[data-testid="email"], input[name="email"], input[type="email"], input[autocomplete="email"]'
      )).find((node) => isVisible(node) && !node.disabled && !node.readOnly) || null;

      if (!input) {
        await sleep(500);
        continue;
      }

      input.focus();
      input.click();

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const tracker = input._valueTracker;
      if (tracker) tracker.setValue('');
      if (valueSetter) {
        valueSetter.call(input, email);
      } else {
        input.value = email;
      }

      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: email, inputType: 'insertText' }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: email, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      if ((input.value || '').trim() !== email || !input.checkValidity()) {
        await sleep(500);
        continue;
      }

      input.blur();
      await sleep(800);

      // Find and click submit button
      const buttons = Array.from(document.querySelectorAll('button[type="submit"], button')).filter((node) => {
        return isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
      });
      const submitButton = buttons.find((node) => {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        const t = text.toLowerCase();
        return text === '注册' || text.includes('注册') || t === 'signup' || t === 'signup' || t.includes('signup');
      });

      if (submitButton) {
        submitButton.click();
        log(`步骤 2：已填写邮箱并点击注册: ${email}`);
        return { email, submitted: true };
      }

      await sleep(500);
    }
    throw new Error('未找到邮箱输入框或注册按钮');
  }

  // ---- Step 3: Fill verification code and confirm ----

  async function grokStep3_fillCodeAndSubmit(payload) {
    const code = String(payload.code || '').trim();
    if (!code) throw new Error('缺少验证码');

    log(`步骤 3：正在填写验证码 ${code}...`);
    const timeout = 60000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      throwIfStopped();

      // Check if already on profile page
      const hasProfile = hasProfileForm();
      if (hasProfile) {
        log('步骤 3：已直接进入注册资料页，跳过验证码确认');
        return { code, skippedToProfile: true };
      }

      // Find OTP input
      const input = Array.from(document.querySelectorAll(
        'input[data-input-otp="true"], input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"], input[inputmode="text"]'
      )).find((node) => isVisible(node) && !node.disabled && !node.readOnly && Number(node.maxLength || code.length || 6) > 1) || null;

      const otpBoxes = Array.from(document.querySelectorAll('input')).filter((node) => {
        if (!isVisible(node) || node.disabled || node.readOnly) return false;
        const maxLength = Number(node.maxLength || 0);
        const autocomplete = String(node.autocomplete || '').toLowerCase();
        return maxLength === 1 || autocomplete === 'one-time-code';
      });

      if (!input && otpBoxes.length < code.length) {
        await sleep(500);
        continue;
      }

      let filledOk = false;

      if (input) {
        input.focus();
        input.click();

        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue('');
        if (nativeSetter) {
          nativeSetter.call(input, '');
          nativeSetter.call(input, code);
        } else {
          input.value = '';
          input.value = code;
        }

        dispatchInputEvents(input, code);
        input.blur();

        filledOk = String(input.value || '').trim() === code;
      } else {
        const orderedBoxes = otpBoxes.slice(0, code.length);
        for (let i = 0; i < orderedBoxes.length; i++) {
          const box = orderedBoxes[i];
          const char = code[i] || '';
          box.focus();
          box.click();

          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          const tracker = box._valueTracker;
          if (tracker) tracker.setValue('');
          if (nativeSetter) {
            nativeSetter.call(box, '');
            nativeSetter.call(box, char);
          } else {
            box.value = '';
            box.value = char;
          }

          dispatchInputEvents(box, char);
          box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
          box.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
          box.blur();
        }
        const merged = orderedBoxes.map((n) => String(n.value || '').trim()).join('');
        filledOk = merged === code;
      }

      if (!filledOk) {
        await sleep(500);
        continue;
      }

      await sleep(1200);

      // Click confirm button
      const buttons = Array.from(document.querySelectorAll('button[type="submit"], button')).filter((node) => {
        return isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
      });
      const confirmButton = buttons.find((node) => {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        const t = text.toLowerCase();
        return text === '确认邮箱' || text.includes('确认邮箱') || text === '继续' || text.includes('继续')
          || text === '下一步' || t.includes('confirm') || t.includes('continue') || t.includes('next') || t.includes('verify');
      });

      if (confirmButton) {
        confirmButton.focus();
        confirmButton.click();
        log(`步骤 3：已填写验证码并点击确认: ${code}`);
        await sleep(2000);
        return { code, confirmed: true };
      }

      // No button found - maybe auto-submitted
      if (document.location.href.includes('sign-up') || document.location.href.includes('signup')) {
        log('步骤 3：验证码已填写，页面可能已自动跳转');
        return { code, autoSubmitted: true };
      }

      await sleep(500);
    }
    throw new Error('未找到验证码输入框或确认按钮');
  }

  // ---- Step 4: Fill profile (name + password) and submit ----

  function hasProfileForm() {
    const givenInput = pickInput('input[data-testid="givenName"], input[name="givenName"], input[autocomplete="given-name"]');
    const familyInput = pickInput('input[data-testid="familyName"], input[name="familyName"], input[autocomplete="family-name"]');
    const passwordInput = pickInput('input[data-testid="password"], input[name="password"], input[type="password"]');
    return !!(givenInput && familyInput && passwordInput);
  }

  async function grokStep4_fillProfileAndSubmit(payload) {
    const { firstName, lastName, password } = payload;
    if (!firstName || !lastName || !password) throw new Error('缺少姓名或密码');

    log(`步骤 4：正在填写注册资料 ${firstName} ${lastName}...`);
    const timeout = 30000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      throwIfStopped();

      const givenInput = pickInput('input[data-testid="givenName"], input[name="givenName"], input[autocomplete="given-name"]');
      const familyInput = pickInput('input[data-testid="familyName"], input[name="familyName"], input[autocomplete="family-name"]');
      const passwordInput = pickInput('input[data-testid="password"], input[name="password"], input[type="password"]');

      if (!givenInput || !familyInput || !passwordInput) {
        await sleep(500);
        continue;
      }

      const givenOk = setInputValue(givenInput, firstName);
      const familyOk = setInputValue(familyInput, lastName);
      const passwordOk = setInputValue(passwordInput, password);

      if (!givenOk || !familyOk || !passwordOk) {
        await sleep(500);
        continue;
      }

      // Verify values
      const valuesOk =
        String(givenInput.value || '').trim() === String(firstName || '').trim()
        && String(familyInput.value || '').trim() === String(lastName || '').trim()
        && String(passwordInput.value || '') === String(password || '');

      if (!valuesOk) {
        await sleep(500);
        continue;
      }

      // Handle Turnstile
      const challengeInput = document.querySelector('input[name="cf-turnstile-response"]');
      if (challengeInput && !String(challengeInput.value || '').trim()) {
        log('步骤 4：检测到 Turnstile，尝试自动处理...');
        try {
          if (typeof turnstile !== 'undefined') {
            turnstile.reset();
          }
          for (let i = 0; i < 15; i++) {
            throwIfStopped();
            try {
              let response = null;
              try { response = turnstile.getResponse(); } catch (_) { /* ignore */ }
              if (response) break;
              await sleep(1000);
            } catch (_) { /* ignore */ }
          }
        } catch (_) { /* ignore turnstile errors */ }
      }

      await sleep(1200);

      // Find and click submit button
      const submitButtons = Array.from(document.querySelectorAll('button[type="submit"], button'));
      const submitBtn = submitButtons.find((node) => {
        const text = (node.innerText || node.textContent || '').replace(/\s+/g, '');
        const t = text.toLowerCase();
        return text === '完成注册' || text.includes('完成注册') || t.includes('createaccount') || t.includes('signup') || t.includes('complete');
      });

      if (submitBtn && !submitBtn.disabled && submitBtn.getAttribute('aria-disabled') !== 'true') {
        // Check turnstile is ready
        const challengeNow = document.querySelector('input[name="cf-turnstile-response"]');
        if (challengeNow && !String(challengeNow.value || '').trim()) {
          await sleep(2000);
        }

        submitBtn.focus();
        submitBtn.click();
        log(`步骤 4：已填写注册资料并点击完成注册: ${firstName} ${lastName}`);
        return { firstName, lastName, password, submitted: true };
      }

      await sleep(500);
    }
    throw new Error('未找到注册资料表单或完成注册按钮');
  }

  // ---- Message listener ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message.type === 'EXECUTE_STEP'
      || message.type === 'GET_GROK_PAGE_STATE'
    ) {
      resetStopState();
      handleCommand(message).then((result) => {
        sendResponse({ ok: true, ...(result || {}) });
      }).catch((err) => {
        if (err.message !== 'stopped') {
          log(`步骤 ${message.step} 失败: ${err.message}`, 'error');
        }
        sendResponse({ error: err.message });
      });
      return true;
    }

    if (message.type === 'STOP') {
      stopRequested = true;
      sendResponse({ ok: true });
      return false;
    }
  });

  async function handleCommand(message) {
    switch (message.type) {
      case 'EXECUTE_STEP':
        switch (message.step) {
          case 1: return await grokStep1_clickEmailSignup();
          case 2: return await grokStep2_fillEmailAndSubmit(message.payload || {});
          case 3: return await grokStep3_fillCodeAndSubmit(message.payload || {});
          case 4: return await grokStep4_fillProfileAndSubmit(message.payload || {});
          default:
            throw new Error(`grok-signup-page.js 不处理步骤 ${message.step}`);
        }
      case 'GET_GROK_PAGE_STATE':
        return {
          url: document.location.href,
          hasProfileForm: hasProfileForm(),
          hasOtpInput: !!document.querySelector('input[data-input-otp="true"], input[name="code"]'),
        };
      default:
        throw new Error(`未知消息类型: ${message.type}`);
    }
  }

  log('grok-signup-page.js 已加载');
})(typeof window !== 'undefined' ? window : globalThis);
