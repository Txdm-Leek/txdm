
import { useState, type FormEvent } from "react";

interface ForgotPasswordProps {
  onBack: () => void;
}

function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        }
      );

      const data = await response.json();

      setMessage(
        data.message ||
          "If an account exists, password-reset instructions will be sent."
      );
    } catch {
      setMessage(
        "Unable to connect to the server. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="auth-card">
        <div className="telegram-logo"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.5 3.5L2.8 10.7c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.5c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8l3.2-14.9c.3-1.2-.5-1.8-1.4-1.5zM9.3 13.4l9.4-5.9c.5-.3.9-.1.5.2l-7.8 7.1-.3 3.5-1.8-4.9z" fill="white"/>
  </svg></div>

        <h1>Forgot Password?</h1>

        <p className="subtitle">
          Enter your email address and we'll send you instructions
          to reset your password.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="reset-email">Email Address</label>

            <input
              id="reset-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              required
            />
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && (
          <p className="reset-message" role="status">
            {message}
          </p>
        )}

        <p className="switch-text">
          Remember your password?
          <button
            type="button"
            className="switch-btn"
            onClick={onBack}
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;

