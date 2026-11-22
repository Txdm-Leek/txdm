export function getApiBaseUrl(): string {
    const configured = import.meta.env.VITE_API_URL;

    return (
        configured || "https://react-backend-gqnc.onrender.com"
    ).trim().replace(/\/+$/, "");
}