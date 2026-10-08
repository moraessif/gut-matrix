export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "gut" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/me")) onUnauthorized();
  if (!res.ok) {
    let msg = data && data.detail;
    if (Array.isArray(msg)) msg = msg.map((x) => `${(x.loc || []).slice(-1)[0] || ""}: ${x.msg}`).join("; ");
    throw new ApiError(msg || `Error ${res.status}`, res.status);
  }
  return data;
}

export const get = (p) => request("GET", p);
export const post = (p, b) => request("POST", p, b ?? {});
export const patch = (p, b) => request("PATCH", p, b);
export const del = (p) => request("DELETE", p);
