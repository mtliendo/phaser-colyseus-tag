import { displayName, initAuth, login, renderAuthActions } from "./auth";

const actions = document.querySelector<HTMLElement>("#auth-actions");
const ctaRow = document.querySelector<HTMLElement>("#cta-row");
if (!actions || !ctaRow) throw new Error("home markup missing");

const session = await initAuth();
renderAuthActions(session, actions);

const addLink = (href: string, label: string, primary = false): void => {
  const a = document.createElement("a");
  a.className = primary ? "btn primary" : "btn";
  a.href = href;
  a.textContent = label;
  ctaRow.append(a);
};

if (session.authenticated) {
  addLink("/host", "Open host screen", true);
  addLink("/play", "Join as player");
} else {
  const loginBtn = document.createElement("button");
  loginBtn.className = "btn primary";
  loginBtn.type = "button";
  loginBtn.textContent = "Log in to play";
  loginBtn.addEventListener("click", () => void login());
  ctaRow.append(loginBtn);
  addLink("/host", "I'm the host");
}

if (session.authenticated) {
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = `Signed in as ${displayName(session)}.`;
  ctaRow.after(note);
}
