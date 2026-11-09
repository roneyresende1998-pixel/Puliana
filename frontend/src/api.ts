export interface ChatMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface ChatResponse {
  reply: string;
  messages: ChatMessage[];
}

// Em produção (Vercel) defina VITE_BACKEND_URL; sem ela, usa o backend local.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

export async function sendMessage(message: string, history: ChatMessage[]): Promise<ChatResponse> {
  const resp = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!resp.ok) {
    throw new Error(`Erro ${resp.status} ao falar com o backend`);
  }
  return resp.json();
}

export async function checkHealth(): Promise<{ status: string; agent_name?: string; detail?: string }> {
  const resp = await fetch(`${BACKEND_URL}/health`);
  return resp.json();
}
