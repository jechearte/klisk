/**
 * AgentKit Chat Widget — Embeddable script.
 *
 * Usage:
 *   <script src="https://my-agent.run.app/widget.js"></script>
 *
 * Configuration via data attributes on the script tag:
 *   data-position: "bottom-right" (default) | "bottom-left"
 *   data-color: button color (default "#2563eb")
 *   data-width: panel width (default "380px")
 *   data-height: panel height (default "560px")
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  // Derive the agent base URL from the script's src
  var src = script.src;
  var baseUrl = src.replace(/\/widget\.js(\?.*)?$/, '');

  // Read configuration
  var position = script.getAttribute('data-position') || 'bottom-right';
  var color = script.getAttribute('data-color') || '#2563eb';
  var width = script.getAttribute('data-width') || '380px';
  var height = script.getAttribute('data-height') || '560px';

  var isLeft = position === 'bottom-left';
  var isOpen = false;
  var container, btn, panel;

  function createWidget() {
    // Container
    container = document.createElement('div');
    container.id = 'agentkit-widget';
    container.style.cssText = 'position:fixed;bottom:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      (isLeft ? 'left:20px;' : 'right:20px;');

    // Panel (iframe)
    panel = document.createElement('div');
    panel.style.cssText = 'display:none;width:' + width + ';height:' + height + ';margin-bottom:12px;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.08);';

    var iframe = document.createElement('iframe');
    iframe.src = baseUrl + '/?embed=1';
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.setAttribute('allow', 'clipboard-write');
    panel.appendChild(iframe);

    // Button
    btn = document.createElement('button');
    btn.style.cssText = 'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:' + color + ';color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s,box-shadow 0.2s;' +
      (isLeft ? '' : 'margin-left:auto;');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.onmouseenter = function () { btn.style.transform = 'scale(1.08)'; };
    btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; };
    btn.onclick = toggle;

    container.appendChild(panel);
    container.appendChild(btn);
    document.body.appendChild(container);
  }

  function toggle() {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'block' : 'none';
    btn.innerHTML = isOpen
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  }

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
