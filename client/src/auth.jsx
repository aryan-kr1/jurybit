import { createContext, useContext, useState } from "react";
import { api, TOKEN_KEY } from "./api.js";

const AuthContext = createContext(null);

// Reads the role from the JWT payload. This only decides what the UI shows;
// the server still checks the role on every admin route.
function decodeRole(token) {
  try {
    let part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (part.length % 4 !== 0) part += "=";
    const payload = JSON.parse(atob(part));
    return payload.role || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const role = token ? decodeRole(token) : null;
  const isAdmin = role === "admin";

  async function login(email, password) {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
  }

  async function register(username, email, password) {
    await api("/api/auth/register", {
      method: "POST",
      body: { username, email, password },
    });
    await login(email, password);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{ token, role, isAdmin, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
