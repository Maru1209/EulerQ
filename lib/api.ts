const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// ---- JIJ route optimizer ----
export async function optimizeJij(payload: any) {
  const res = await fetch(`${API_BASE}/optimize/jij`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`optimize/jij failed: ${res.status}`);
  return res.json();
}

// ---- VRPTW (time windows, vehicles, shifts, etc.) ----
export async function optimizeVrptw(payload: any) {
  const res = await fetch(`${API_BASE}/optimize/vrptw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`optimize/vrptw failed: ${res.status}`);
  return res.json();
}
