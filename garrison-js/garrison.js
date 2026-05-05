/**
 * Garrison Shield v0.1
 * Drop-in AI Security Posture Management for SMB chatbots.
 *
 * Usage — add before </body>:
 *
 *   <script>
 *     window.GARRISON_CONFIG = {
 *       apiUrl:    'https://your-garrison-api.com/analyze',
 *       container: '#chat-widget-container',   // CSS selector for the chatbot wrapper
 *       siteId:    'client-site-abc123',        // optional: for threat logging
 *       timeout:   250,                         // ms before fail-open (default 250)
 *     };
 *   </script>
 *   <script src="garrison.js"></script>
 */

(function GarrisonShield() {
  'use strict';

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------
  const cfg = Object.assign(
    { apiUrl: '', apiKey: null, container: 'body', siteId: null, timeout: 250 },
    window.GARRISON_CONFIG || {}
  );

  if (!cfg.apiUrl) {
    console.warn('[Garrison] apiUrl is not set — shield inactive.');
    return;
  }

  // -------------------------------------------------------------------------
  // Warning banner (injected once, shown/hidden as needed)
  // -------------------------------------------------------------------------
  const banner = (function buildBanner() {
    const el = document.createElement('div');
    el.id = 'garrison-alert';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    Object.assign(el.style, {
      display:         'none',
      position:        'fixed',
      bottom:          '80px',
      left:            '50%',
      transform:       'translateX(-50%)',
      zIndex:          '2147483647',       // max z-index
      background:      '#1a1a2e',
      color:           '#ff4d6d',
      border:          '1px solid #ff4d6d',
      borderRadius:    '8px',
      padding:         '12px 20px',
      fontSize:        '14px',
      fontFamily:      'system-ui, sans-serif',
      fontWeight:      '600',
      boxShadow:       '0 4px 20px rgba(0,0,0,0.4)',
      maxWidth:        '400px',
      textAlign:       'center',
      pointerEvents:   'none',
    });
    document.documentElement.appendChild(el);
    return el;
  })();

  let _bannerTimer = null;

  function showAlert(message) {
    banner.textContent = '\u26A0\uFE0F  ' + message;
    banner.style.display = 'block';
    clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(function () {
      banner.style.display = 'none';
    }, 4000);
  }

  // -------------------------------------------------------------------------
  // Core: call the Garrison API
  // Returns true  → message is SAFE (allow)
  // Returns false → message is BLOCKED (cancel)
  // -------------------------------------------------------------------------
  async function garrison_check(text) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, cfg.timeout);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;

      const resp = await fetch(cfg.apiUrl, {
        method:  'POST',
        headers,
        body:    JSON.stringify({
          prompt:  text,
          site_id: cfg.siteId || null,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) return true; // fail-open on non-2xx

      const data = await resp.json();
      return data.status !== 'blocked';

    } catch (err) {
      // AbortError (timeout) or network failure → fail-open, never break chat
      if (err.name !== 'AbortError') {
        console.warn('[Garrison] API error:', err.message);
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Event interception
  // Uses capture phase so we run BEFORE the chatbot widget's own listeners.
  // -------------------------------------------------------------------------

  // Map of input elements currently being guarded to avoid double-binding.
  const _guarded = new WeakSet();

  // Pending check: prevents rapid double-fires (Enter + click on same message)
  let _pending = false;

  function getInputValue(input) {
    return (input.value || input.textContent || '').trim();
  }

  function clearInput(input) {
    if ('value' in input) {
      input.value = '';
    } else {
      input.textContent = '';
    }
    // Trigger React/Vue synthetic change events in case the widget listens
    ['input', 'change'].forEach(function (type) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  /**
   * The unified intercept handler.
   * Wraps synchronous event handling around an async Garrison check.
   */
  function intercept(evt, input) {
    const text = getInputValue(input);
    if (!text || _pending) return;

    // Stop the event immediately — we re-fire it if the check passes.
    evt.preventDefault();
    evt.stopImmediatePropagation();

    _pending = true;

    garrison_check(text).then(function (safe) {
      _pending = false;

      if (!safe) {
        clearInput(input);
        showAlert('Security Alert: Your message contains prohibited instructions.');
        return;
      }

      // Re-dispatch the original event so the chatbot widget picks it up.
      // We clone to a plain trusted event — the widget just needs the type.
      const replay = new (evt.constructor)(evt.type, {
        bubbles:    evt.bubbles,
        cancelable: evt.cancelable,
        key:        evt instanceof KeyboardEvent ? evt.key        : undefined,
        keyCode:    evt instanceof KeyboardEvent ? evt.keyCode    : undefined,
        which:      evt instanceof KeyboardEvent ? evt.which      : undefined,
        composed:   true,
      });
      // Tag so we don't intercept our own replay
      replay._garrison_replay = true;
      evt.target.dispatchEvent(replay);

    }).catch(function () {
      _pending = false;
    });
  }

  function isSendButton(el) {
    if (!el) return false;
    const tag  = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase();
    const cls  = (el.className || '').toLowerCase();

    return (
      (tag === 'button' && (type === 'submit' || /send|submit/i.test(text + cls))) ||
      (tag === 'input'  && (type === 'submit' || type === 'image'))
    );
  }

  function findAssociatedInput(sendBtn) {
    // Walk up from the button to find the nearest textarea or text input
    let node = sendBtn.parentElement;
    while (node && node !== document.body) {
      const input = node.querySelector('textarea, input[type="text"], input:not([type]), [contenteditable="true"]');
      if (input) return input;
      node = node.parentElement;
    }
    return null;
  }

  function attachToInput(input) {
    if (_guarded.has(input)) return;
    _guarded.add(input);

    input.addEventListener('keydown', function (evt) {
      if (evt._garrison_replay) return;
      if (evt.key === 'Enter' && !evt.shiftKey) {
        intercept(evt, input);
      }
    }, true); // capture phase
  }

  function attachToSendButton(btn) {
    if (_guarded.has(btn)) return;
    _guarded.add(btn);

    btn.addEventListener('click', function (evt) {
      if (evt._garrison_replay) return;
      const input = findAssociatedInput(btn);
      if (!input) return;
      intercept(evt, input);
    }, true); // capture phase
  }

  // -------------------------------------------------------------------------
  // DOM scanning — handles both static and dynamically injected widgets
  // -------------------------------------------------------------------------

  function scanContainer(root) {
    root.querySelectorAll(
      'textarea, input[type="text"], input:not([type]), [contenteditable="true"]'
    ).forEach(attachToInput);

    root.querySelectorAll('button, input[type="submit"], input[type="image"]').forEach(function (el) {
      if (isSendButton(el)) attachToSendButton(el);
    });
  }

  function init() {
    const container = document.querySelector(cfg.container) || document.body;
    scanContainer(container);

    // Watch for widgets that inject themselves after page load (Intercom, Chatbase, etc.)
    const observer = new MutationObserver(function (mutations) {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          scanContainer(node);
          // Also check if the node itself is an input/button
          const tag = node.tagName.toLowerCase();
          if (tag === 'textarea' || tag === 'input') attachToInput(node);
          if (tag === 'button') { if (isSendButton(node)) attachToSendButton(node); }
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
