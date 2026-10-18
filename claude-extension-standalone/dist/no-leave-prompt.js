// Runs in the page's MAIN world at document_start (registered by the service
// worker). Neutralises "Leave site? Changes you made may not be saved." prompts
// by stopping pages from registering beforeunload handlers that cancel unload.
(() => {
  if (window.__claudeNoLeavePrompt) return;
  window.__claudeNoLeavePrompt = true;

  const swallow = (e) => {
    e.stopImmediatePropagation();
    // Clearing returnValue is what actually suppresses Chrome's dialog.
    Object.defineProperty(e, "returnValue", { value: undefined, writable: true });
  };

  // Our capturing listener on window runs before any handler the page adds.
  window.addEventListener("beforeunload", swallow, true);

  // Ignore page attempts to add beforeunload listeners on window.
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === "beforeunload" && (this === window || this === document)) return;
    return origAdd.call(this, type, listener, options);
  };

  // Ignore window.onbeforeunload = ... assignments.
  try {
    Object.defineProperty(window, "onbeforeunload", {
      configurable: true,
      get: () => null,
      set: () => {},
    });
  } catch {
    /* already locked by the page */
  }
})();
