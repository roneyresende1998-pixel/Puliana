import { useEffect, useRef, useState } from "react";
import { ChatMessage, sendMessage } from "../api";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block?.type === "text")
      .map((block: any) => block.text)
      .join("\n");
  }
  return "";
}

export default function Chat() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  async function handleSend() {
    const message = input.trim();
    if (!message || loading) return;

    setDisplayMessages((prev) => [...prev, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const resp = await sendMessage(message, history);
      setHistory(resp.messages);
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: resp.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="messages">
        {displayMessages.map((msg, i) => (
          <div key={i} className={`bubble ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {error && <div className="bubble assistant">⚠️ {error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="input-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Fala com a Puliana..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading}>
          {loading ? "..." : "Enviar"}
        </button>
      </div>
    </>
  );
}
