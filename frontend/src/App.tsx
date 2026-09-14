import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import { checkHealth } from "./api";

export default function App() {
  const [status, setStatus] = useState<string>("verificando...");
  const [agentName, setAgentName] = useState<string>("Puliana");

  useEffect(() => {
    checkHealth()
      .then((res) => {
        setStatus(res.status === "ok" ? "online" : `atenção: ${res.detail ?? res.status}`);
        if (res.agent_name) setAgentName(res.agent_name);
      })
      .catch(() => setStatus("backend offline (rode `make dev`)"));
  }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>{agentName}</h1>
        <div className="status">status: {status}</div>
      </div>
      <Chat />
    </div>
  );
}
