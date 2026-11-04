
import { useEffect, useState } from "react";

function VerifyEmail() {
    const [message, setMessage] = useState("Verifying your email...");
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("verifyToken");

        if (!token) {
            setMessage("Verification token is missing.");
            setLoading(false);
            return;
        }

        const verifyEmail = async () => {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`
                );

                const data = await response.json();

                setMessage(data.message || "Verification failed.");
                setSuccess(response.ok && data.success === true);
            } catch (error) {
                console.error("Email verification error:", error);
                setMessage("Unable to connect to the server. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        verifyEmail();
    }, []);

    return (
        <div className="container text-center mt-5">
            <h2>Email Verification</h2>

            <p>{message}</p>

            {!loading && success && (
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        window.location.href = "/";
                    }}
                >
                    Go to Login
                </button>
            )}
        </div>
    );
}

export default VerifyEmail;
