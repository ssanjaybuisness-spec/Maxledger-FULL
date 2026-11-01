
import { useState } from "react";
import { signInWithGoogle } from "../services/firebase";

export default function GoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setLoading(true);
    setError("");

    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell auth-screen">
      <section className="auth-card">
        <div className="brand-icon">M</div>
        <h1>Welcome to MaxLedger</h1>
        <p>Sign in with Google to access your finance dashboard.</p>

        <button
          type="button"
          className="submit-button"
          onClick={handleSignIn}
          disabled={loading}
        >
          {loading ? "Connecting..." : "Continue with Google"}
        </button>

        {error && <p role="alert" className="auth-error">{error}</p>}

        <small>Your existing local data will remain on this device.</small>
      </section>
    </main>
  );
}
