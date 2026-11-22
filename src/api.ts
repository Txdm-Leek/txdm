export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;

    if (hostname.includes("devtunnels.ms")) {
      const tunnelHost = hostname.replace(/-\d+(\.devtunnels\.ms)$/, "-5000$1");
      return `${protocol}//${tunnelHost}`;
    }
  }

  return "http://localhost:5000";
}
