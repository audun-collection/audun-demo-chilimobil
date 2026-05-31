"use client";

/**
 * No-op auth shim — the marketing demo has no real users.
 *
 * The case-view / conversation-panel components from the production
 * codebase call `useAuth()` to grab an ID token for outbound API
 * calls. Here every API call short-circuits to the static fixtures,
 * so the token is unused — but we still need the hook shape to keep
 * those components from crashing.
 */

import { createContext, useContext, type ReactNode } from "react";

interface AuthValue {
  getIdToken: () => Promise<string | null>;
  claims: { role: "creditor" } | null;
  configured: boolean;
}

const noopAuth: AuthValue = {
  getIdToken: async () => null,
  claims: { role: "creditor" },
  configured: false,
};

const AuthContext = createContext<AuthValue>(noopAuth);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  return <AuthContext.Provider value={noopAuth}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
