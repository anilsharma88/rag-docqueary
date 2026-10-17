const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.detail || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const documentApi = {
  list: () => request("/documents"),
  adminList: (credentials) => request("/documents/admin/documents", {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  adminDashboard: (credentials) => request("/documents/admin/dashboard", {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  auditLogs: (credentials) => request("/documents/admin/audit-logs", {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  verifyAdmin: (credentials) => request("/documents/admin/verify", {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  upload: (formData, credentials, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/documents/upload`);
    xhr.setRequestHeader("Authorization", `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const payload = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.detail || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload could not reach the server."));
    xhr.send(formData);
  }),
  remove: (id, credentials) => request(`/documents/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  update: (id, changes, credentials) => request(`/documents/admin/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
    body: JSON.stringify(changes),
  }),
  versions: (id, credentials) => request(`/documents/admin/documents/${id}/versions`, {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  reprocess: (id, credentials) => request(`/documents/admin/documents/${id}/reprocess`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  download: async (id, credentials) => {
    const response = await fetch(`${API_URL}/documents/admin/documents/${id}/download`, {
      headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
    });
    if (!response.ok) throw new Error("Document download failed");
    return response.blob();
  },
  ask: (id, question, category) => request(`/documents/${id}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: 4, category }),
  }),
  cvList: (credentials) => request("/hr/candidates", {
    headers: { Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` },
  }),
  cvSearch: (filters, credentials) => request("/hr/candidates/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
    },
    body: JSON.stringify(filters),
  }),
};

export const knowledgeApi = {
  query: (question, category) => request("/knowledge/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, category: category === "All Categories" ? null : category, top_k: 5 }),
  }),
};
