"use client";

import React, { useState, useCallback, createContext, useContext, ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  txSig?: string;
}

interface ToastContextValue {
  addToast: (message: string, type: Toast["type"], txSig?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"], txSig?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, txSig }]);
    setTimeout(() => {
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
