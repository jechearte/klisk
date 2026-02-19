import { useState, useEffect, useRef } from "react";

interface OfflineScreenProps {
  onServerReady: () => void;
}

export default function OfflineScreen({ onServerReady }: OfflineScreenProps) {
  const [copied, setCopied] = useState(false);
  const onServerReadyRef = useRef(onServerReady);
  useEffect(() => { onServerReadyRef.current = onServerReady; }, [onServerReady]);

  // Poll /api/project every 3 seconds
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/project");
        if (res.ok && active) {
          onServerReadyRef.current();
        }
      } catch {
        // still offline
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    navigator.clipboard.writeText("klisk studio").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center bg-gray-950 text-gray-100">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
        <img src="/favicon.png" alt="Klisk" className="w-12 h-12 opacity-60" />

        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-100 mb-1">Klisk Studio offline</h1>
          <p className="text-sm text-gray-400">El servidor no está corriendo.</p>
          <p className="text-sm text-gray-400">Ejecuta en tu terminal:</p>
        </div>

        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 w-full">
          <code className="text-sm text-green-400 flex-1 font-mono">$ klisk studio</code>
          <button
            onClick={handleCopy}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800"
            title="Copiar comando"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        <svg
          className="w-4 h-4 animate-spin text-gray-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    </div>
  );
}
