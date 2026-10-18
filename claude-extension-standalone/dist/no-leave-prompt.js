// Runs in the page's MAIN world at document_start (registered by the service
// worker). Neutralises "Leave site? Changes you made may not be saved." prompts.
// Several independent layers, so a page that gets around one still can't show it.
(() => {
  if (window.__claudeNoLeavePrompt) return;
  Object.defineProperty(window, "__claudeNoLeavePrompt", { value: true });

  const isWin = (t) => t === window || t === document || t === document.body;

  // 1. A capturing listener registered before any page code runs fires first
  //    and stops every later beforeunload handler (incl. <body onbeforeunload>).
  window.addEventListener(
    "beforeunload",
    (e) => {
      e.stopImmediatePropagation();
      try {
        Object.defineProperty(e, "returnValue", { value: "", writable: true });
      } catch {}
    },
    true,
  );

  // 2. Even if a handler does run, preventDefault()/returnValue can't cancel unload.
  const BUE = window.BeforeUnloadEvent && window.BeforeUnloadEvent.prototype;
  if (BUE) {
    const origPD = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
      if (this instanceof window.BeforeUnloadEvent) return;
      return origPD.call(this);
    };
    try {
      Object.defineProperty(BUE, "returnValue", { configurable: true, get: () => "", set: () => {} });
    } catch {}
  }

  // 3. Page attempts to add beforeunload listeners are ignored.
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === "beforeunload" && isWin(this)) return;
    return origAdd.call(this, type, listener, options);
  };

  // 4. window.onbeforeunload = ... / document.body.onbeforeunload = ... are ignored.
  const sink = { configurable: true, get: () => null, set: () => {} };
  try { Object.defineProperty(window, "onbeforeunload", sink); } catch {}
  try { Object.defineProperty(HTMLBodyElement.prototype, "onbeforeunload", sink); } catch {}
  try { Object.defineProperty(HTMLFrameSetElement.prototype, "onbeforeunload", sink); } catch {}
})();
