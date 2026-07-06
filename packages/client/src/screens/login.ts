import { api } from "../network/api.js";
import { showScreen } from "../app.js";

export function initLoginScreen(): void {
  const usernameInput = document.getElementById("login-username") as HTMLInputElement;
  const passwordInput = document.getElementById("login-password") as HTMLInputElement;
  const errorEl = document.getElementById("login-error")!;
  const loginBtn = document.getElementById("btn-login")!;
  const registerBtn = document.getElementById("btn-register")!;

  async function handleAction(isRegister: boolean): Promise<void> {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      errorEl.textContent = "Kullanıcı adı ve şifre gerekli";
      return;
    }
    errorEl.textContent = "";
    try {
      const { user } = isRegister
        ? await api.register(username, password)
        : await api.login(username, password);
      document.getElementById("menu-username")!.textContent = user.username;
      showScreen("menu");
    } catch (err: any) {
      errorEl.textContent = err.message || "Bir hata oluştu";
    }
  }

  loginBtn.addEventListener("click", () => handleAction(false));
  registerBtn.addEventListener("click", () => handleAction(true));
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAction(false);
  });
}
