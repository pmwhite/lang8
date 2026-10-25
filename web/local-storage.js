// Browser persistence shared by canvas applications. Expected storage denial
// keeps the current session usable and leaves a visible warning until reload.
// Other exceptions, including serialization errors, reach the caller.
export function saveLocalText(key, text) {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch (error) {
    if (!(error instanceof DOMException) ||
        !["QuotaExceededError", "SecurityError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name)) {
      throw error;
    }
    console.warn("Could not save browser data", key, error);
    if (!document.getElementById("local-save-warning")) {
      const warning = document.createElement("div");
      warning.id = "local-save-warning";
      warning.setAttribute("role", "status");
      warning.textContent = "This browser could not save your latest changes. They may be lost when you close this tab. Free some storage space or allow storage for this site, then try again.";
      Object.assign(warning.style, {
        position: "fixed", bottom: "max(12px, env(safe-area-inset-bottom))",
        left: "12px", right: "12px", maxWidth: "560px", margin: "auto",
        padding: "12px 16px", background: "#fff3cd", color: "#3b2c00",
        border: "1px solid #b58a25", borderRadius: "8px", zIndex: "10000",
        font: "15px/1.4 system-ui, sans-serif",
      });
      document.body.append(warning);
    }
    return false;
  }
}

export function saveLocalJson(key, value) {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError("Browser save requires a JSON value");
  return saveLocalText(key, text);
}
