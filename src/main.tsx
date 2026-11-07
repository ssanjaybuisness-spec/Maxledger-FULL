
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GoogleAuth from "./components/GoogleAuth";
import { auth, onAuthStateChanged } from "./services/firebase";
import "./styles.css";
import "./styles/premium-ui.css";

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

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
