const API_BASE = import.meta.env.VITE_API_URL || "";

export async function notifyUser(userId, event, data = {}) {
  if (!userId) return;
  try {
    await fetch(`${API_BASE}/api/notify-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, event, data }),
    });
  } catch (err) {
    console.error("notifyUser failed (non-blocking):", err);
  }
}