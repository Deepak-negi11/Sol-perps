"use client";

import React, { useState, useCallback, createContext, useContext, ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  txSig?: string;
}

interface ToastContextValue {
  // ToastContextValue defines the API (methods) exposed by our Toast Provider.
  // This is separate from the Toast interface, which defines the state shape of a single toast object.
  addToast: (message: string, type: Toast["type"], txSig?: string) => void;
}

// Creates the React Context object with a default empty fallback function.
const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  // useContext is a React hook that lets components consume the ToastContext values.
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // toasts stores an array of active Toast objects. Toast[] represents the TypeScript generic type for an array.
  const [toasts, setToasts] = useState<Toast[]>([]);

  // useCallback memoizes this function definition so that it is not recreated on every render.
  const addToast = useCallback((message: string, type: Toast["type"], txSig?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, txSig }]);
    setTimeout(() => {
      // .filter removes the toast with the matching ID after 5 seconds.
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            <div>
              <div>{t.message}</div>
              {t.txSig && (
                <a
                  href={`https://explorer.solana.com/tx/${t.txSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.7rem", opacity: 0.7, textDecoration: "underline" }}
                >
                  View on Explorer →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
