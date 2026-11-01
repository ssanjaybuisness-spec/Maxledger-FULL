
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GoogleAuth from "./components/GoogleAuth";
import { auth, onAuthStateChanged, logout } from "./services/firebase";
import "./styles.css";

function Root() {
  const [user, setUser] = useState<typeof auth.currentUser>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <main className="app-shell"><h2>Checking sign-in...</h2></main>;
  }

  if (!user) {
    return <GoogleAuth />;
  }

  return (
    <>
      <div className="signed-in-bar">
        <span>Signed in as {user.displayName || user.email}</span>
        <button type="button" onClick={() => logout()}>Sign out</button>
      </div>
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
