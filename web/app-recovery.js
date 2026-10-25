// Recovery uses DOM text nodes: runtime diagnostics belong in the console,
// and neither exception messages nor saved file content are HTML.
export function showAppRecovery({ title, explanation, files = [] }) {
  const message = document.getElementById("message");
  message.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  message.append(heading);
  for (const text of explanation) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    message.append(paragraph);
  }
  if (files.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Before restarting, you can download a recovery copy of the files last written in this page. Edits still on screen may be missing. Keep these copies if you need help recovering your work.";
    message.append(paragraph);
    for (const { name, data } of files) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([data], { type: "text/plain;charset=utf-8" }));
      link.download = name;
      link.textContent = `Download ${name}`;
      const row = document.createElement("p");
      row.append(link);
      message.append(row);
      // The page owns these URLs until restart, so repeated downloads work.
    }
  }
  const restart = document.createElement("a");
  const restartUrl = new URL(location.href);
  restartUrl.searchParams.delete("fresh");
  restart.href = restartUrl.href;
  restart.textContent = "Restart";
  message.append(restart);
  const help = document.createElement("p");
  help.textContent = "If this happens again, check your connection and that this browser allows site storage. Keep your browser data; clearing it can remove saved work. The browser console has details for troubleshooting.";
  message.append(help);
  document.body.classList.remove("booting");
  const overlay = document.getElementById("overlay");
  overlay.hidden = false;
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-label", title);
  restart.focus();
}
