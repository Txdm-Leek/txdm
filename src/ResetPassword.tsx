
import { useState, type FormEvent } from "react";

interface ResetPasswordProps {
  onBack: () => void;
}

function ResetPassword({ onBack }: ResetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setMessage("Your password must contain at least 8 characters.");
      return;
    }

    const token = new URLSearchParams(window.location.search)
      .get("token");

    if (!token) {
      setMessage("The reset link is missing its token.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Password reset failed.");
        return;
      }

      setSuccess(true);
      setMessage("Password changed successfully. You can now sign in.");

      // Remove the token from the address bar.
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    } catch {
      setMessage(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="auth-card">
        <div className="telegram-logo">➤</div>

        <h1>Reset Password</h1>

        <p className="subtitle">
          Choose a new password for your account.
        </p>

        {!success && (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="new-password">New Password</label>

              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="confirm-password">
                Confirm New Password
              </label>

              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {message && (
          <p className="reset-message" role="status">
            {message}
          </p>
        )}

        {success && (
          <button
            type="button"
            className="submit-btn"
            onClick={onBack}
          >
            Go to Sign In
          </button>
        )}

        {!success && (
          <p className="switch-text">
            <button
              type="button"
              className="switch-btn"
              onClick={onBack}
            >
              Back to Sign In
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
