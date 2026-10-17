export const CATEGORY_TREE = [
  { name: "Product", children: ["Online Store", "Games", "Pricing", "Product Catalog", "Product Documentation", "Release Notes", "Product Roadmap"] },
  { name: "HR Policy", children: ["Leave", "Encashment", "Hiring Process", "CV Upload", "Recruitment", "Job Descriptions", "Employee Handbook", "Onboarding", "Training and Development", "Benefits and Compensation"] },
  { name: "Service & Support", children: ["Tickets", "Resolving Issues", "Troubleshooting Guides", "Knowledge Base", "Incident Reports", "Service-Level Agreements", "FAQs", "Escalation Procedures"] },
  { name: "Finance Data", children: ["Budgets", "Invoices", "Expenses", "Purchase Orders", "Financial Reports", "Forecasts", "Billing", "Tax Documentation"] },
  { name: "Engineering & DevOps", children: ["CI/CD", "Terraform and Infrastructure as Code", "Kubernetes", "Cloud Operations", "Architecture", "Runbooks", "Disaster Recovery", "Release Management"] },
  { name: "Security & Compliance", children: ["Security Policies", "Vulnerability Management", "Risk Assessments", "Audit Evidence", "Compliance Reports", "Incident Response", "Data Protection"] },
  { name: "Legal & Contracts", children: ["Contracts", "Vendor Agreements", "NDAs", "Regulatory Documentation"] },
  { name: "Operations & Projects", children: ["Standard Operating Procedures", "Project Plans", "Meeting Notes", "Status Reports"] },
  { name: "Sales & Marketing", children: ["Sales Playbooks", "Customer Proposals", "Marketing Materials", "Market Research"] },
  { name: "IT & Assets", children: ["Asset Inventory", "Software Licenses", "Hardware Documentation", "IT Support Procedures", "Change Management"] },
];

export const CATEGORY_NAMES = CATEGORY_TREE.map(({ name }) => name);
export const getSubcategories = (category) => CATEGORY_TREE.find((item) => item.name === category)?.children ?? [];
