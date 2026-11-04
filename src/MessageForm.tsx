import { useState } from "react";

export default function MessageForm() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = message.trim();

    if (!trimmed) {
      setStatus("Please enter a message.");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      setStatus("Please sign in before sending a message.");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("http://localhost:5000/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save message.");
      }

      setStatus("Loading...");
      setMessage("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setMessage(event.target.value);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="input-group">
        <label htmlFor="message" style={{ display: "block", marginBottom: "80px", fontWeight: 600 }}>
          Password
        </label>

        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <input
            id="message"
            type={showPassword ? "text" : "password"}
            name="message"
            placeholder="Re-enter password"
            value={message}
            onChange={handleChange}
            autoComplete="off"
            maxLength={500}
            required
            style={{ flex: 1 }}
          />

          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #d5dde5",
              background: "#f4f7fa",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Submit"}
        </button>

        {status && <p>{status}</p>}
      </form>

    </div>
  );
}