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
    setToasts((current) => [...current, { id, message, type, txSig }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}</span>
            <div>
              <div>{toast.message}</div>
              {toast.txSig && (
                <a
                  href={`https://explorer.solana.com/tx/${toast.txSig}?cluster=devnet`}
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
