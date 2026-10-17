export const DEMO_DOCUMENTS = [
  { id: "d-204", title: "Employee Leave & Time Off Policy", filename: "leave-and-time-off.pdf", category: "HR Policy", subcategory: "Leave", department: "People", owner: "Maya Chen", uploaded_at: "2026-10-16T09:20:00Z", version: 3, status: "Indexed", confidentiality: "Internal", access_group: "All employees", tags: ["leave", "policy"] },
  { id: "d-203", title: "Platform Operations Runbook", filename: "platform-runbook.docx", category: "Engineering & DevOps", subcategory: "Runbooks", department: "Engineering", owner: "Nate Brooks", uploaded_at: "2026-10-15T14:10:00Z", version: 2, status: "Indexed", confidentiality: "Internal", access_group: "All employees", tags: ["platform", "operations"] },
  { id: "d-202", title: "Quarterly Product Release Notes", filename: "q3-release-notes.txt", category: "Product", subcategory: "Release Notes", department: "Product", owner: "Iris Walker", uploaded_at: "2026-10-14T11:05:00Z", version: 1, status: "Indexed", confidentiality: "Public", access_group: "All employees", tags: ["release", "product"] },
  { id: "d-201", title: "Vendor Security Review", filename: "vendor-security.xlsx", category: "Security & Compliance", subcategory: "Risk Assessments", department: "Security", owner: "Amir Patel", uploaded_at: "2026-10-12T08:35:00Z", version: 1, status: "Processing", confidentiality: "Confidential", access_group: "Security", tags: ["vendor", "security"] },
  { id: "d-200", title: "Service Desk Escalation Guide", filename: "escalation-guide.pdf", category: "Service & Support", subcategory: "Escalation Procedures", department: "Customer Success", owner: "Elena Ruiz", uploaded_at: "2026-10-10T16:45:00Z", version: 4, status: "Indexed", confidentiality: "Internal", access_group: "All employees", tags: ["support", "service"] },
];

export const DEMO_AUDIT = [
  { id: 1, actor: "Maya Chen", action: "Document metadata updated", target: "Employee Leave & Time Off Policy", time: "Today, 09:42" },
  { id: 2, actor: "Nate Brooks", action: "New document uploaded", target: "Platform Operations Runbook", time: "Yesterday, 14:10" },
  { id: 3, actor: "Admin", action: "Access group changed", target: "Vendor Security Review", time: "Oct 12, 08:38" },
  { id: 4, actor: "Iris Walker", action: "Document version published", target: "Quarterly Product Release Notes", time: "Oct 10, 16:11" },
];

export const DEMO_USERS = [
  { id: 1, name: "Maya Chen", email: "maya.chen@northstar.example", role: "Admin", department: "People", status: "Active" },
  { id: 2, name: "Nate Brooks", email: "nate.brooks@northstar.example", role: "Editor", department: "Engineering", status: "Active" },
  { id: 3, name: "Iris Walker", email: "iris.walker@northstar.example", role: "Employee", department: "Product", status: "Active" },
  { id: 4, name: "Amir Patel", email: "amir.patel@northstar.example", role: "HR reviewer", department: "People", status: "Invited" },
];

export const SUGGESTED_QUESTIONS = [
  "How much annual leave can I carry over?",
  "What is the incident escalation path?",
  "What changed in the latest product release?",
];
