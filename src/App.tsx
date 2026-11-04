import { useState, useEffect } from "react";
import Dashboard from "./Dashboard";
import "./App.css";
import VerifyEmail from "./VerifyEmail";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

function App() {
  interface User {
    id: number;
    name: string;
    email: string;
    phonenumber: string;
  }

  type AuthPage = "login" | "register" | "forgot" | "reset" | "verify";

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
 const params = new URLSearchParams(window.location.search);

const [authPage, setAuthPage] = useState<AuthPage>(
    params.has("verifyToken")
        ? "verify"
        : params.has("token")
        ? "reset"
        : "login"
);
  const [form, setForm] = useState({
    name: "",
    phonenumber: "",
    password: "",
  });

  const isRegister = authPage === "register";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const identifier = form.phonenumber.trim();
    const isEmailIdentifier = identifier.includes("@");

    const payload = isRegister
      ? {
          name: form.name,
          email: isEmailIdentifier ? identifier : "",
          phonenumber: isEmailIdentifier ? "" : identifier,
          password: form.password,
        }
      : {
          email: isEmailIdentifier ? identifier : "",
          phonenumber: isEmailIdentifier ? "" : identifier,
          password: form.password,
        };

    try {
      const response = await fetch(
        `http://localhost:5000/api/auth/${isRegister ? "register" : "login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

const data = await response.json();

if (!response.ok) {
    alert(data.message || "Authentication failed.");
    return;
}

// Email registration requires verification before login.
if (data.requiresVerification) {
    alert(data.message);
    setAuthPage("login");
    return;
}

// Normal login or phone-only registration.
localStorage.setItem("token", data.token);
setUser(data.user);
      /*alert(`Welcome, ${data.user.name}!`);*/
      console.log("Authenticated user:", data.user);
    } catch (error) {
      console.error(error);
      alert("Could not connect to the backend. Is the server running?");
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("http://localhost:5000/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem("token");
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error("Session verification failed:", error);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  if (loading) {
    return <p>Checking your session...</p>;
  }

  if (user) {
    return (
      <Dashboard
        user={user}
        onLogout={() => {
          localStorage.removeItem("token");
          setUser(null);
        }}
      />
    );
  }

  if (authPage === "forgot") {
    return <ForgotPassword onBack={() => setAuthPage("login")} />;
  }

  if (authPage === "reset") {
    return (
      <ResetPassword
        onBack={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuthPage("login");
        }}
      />
    );
  }
if (authPage === "verify") {
    return <VerifyEmail />;
}
  return (
    <div className="page">
      <div className="auth-card">
        <div className="telegram-logo"><div className="telegram-logo">
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.5 3.5L2.8 10.7c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.5c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8l3.2-14.9c.3-1.2-.5-1.8-1.4-1.5zM9.3 13.4l9.4-5.9c.5-.3.9-.1.5.2l-7.8 7.1-.3 3.5-1.8-4.9z" fill="white"/>
  </svg>
</div></div>

        <h1>{isRegister ? "Create Account" : "Welcome"}</h1>

        <p className="subtitle">
          {isRegister
            ? "Create your account to get started."
            : "Sign in with your phone number or email."}
        </p>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="input-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                name="name"
                placeholder="Enter your name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="phonenumber">Phone Number or Email</label>
            <input
              id="phonenumber"
              type="text"
              name="phonenumber"
              placeholder="Enter your phone number or email"
              value={form.phonenumber}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="submit-btn">
            {isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          className="switch-btn"
          onClick={() => setAuthPage("forgot")}
        >
          Forgot Password?
        </button>

        <p className="switch-text">
          {isRegister ? "Already have an account?" : "Don't have an account?"}

          <button
            type="button"
            className="switch-btn"
            onClick={() => {
              setAuthPage(isRegister ? "login" : "register");
              setForm({ name: "", phonenumber: "", password: "" });
            }}
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </p>

        <p className="footer-text">A Telegram-inspired interface</p>
      </div>
    </div>
  );
}

export default App;

