import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CATEGORY_TREE, CATEGORY_NAMES, getSubcategories } from "./data/categories";
import { documentApi, knowledgeApi } from "./services/api";
import { DEMO_AUDIT, DEMO_DOCUMENTS, DEMO_USERS, SUGGESTED_QUESTIONS } from "./mocks/data";
import "./App.css";

const NAV_GROUPS = [
  { label: "WORKSPACE", items: [{ id: "dashboard", icon: "◫", label: "Overview", admin: true }, { id: "documents", icon: "▤", label: "Documents", admin: true }, { id: "knowledge", icon: "⌕", label: "Knowledge assistant" }, { id: "hr", icon: "◎", label: "HR workspace", admin: true, hr: true }] },
  { label: "GOVERNANCE", items: [{ id: "categories", icon: "▦", label: "Categories", admin: true }, { id: "users", icon: "♙", label: "People & access", admin: true }, { id: "audit", icon: "◷", label: "Audit trail", admin: true }] },
];
const INITIAL_CATEGORIES = CATEGORY_TREE.map((entry) => ({ ...entry, active: true }));
const SAVED_KEY = "docuquery-saved-answers";
const HISTORY_KEY = "docuquery-query-history";
const CATEGORIES_KEY = "docuquery-category-config";

function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function fileExt(filename = "file") { return filename.split(".").pop().toUpperCase(); }
function formattedDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
function authHeader(credentials) {
  return credentials ? `Basic ${btoa(`${credentials.username}:${credentials.password}`)}` : "";
}
function Icon({ children, className = "" }) { return <span className={`icon ${className}`} aria-hidden="true">{children}</span>; }

function App() {
  const [page, setPage] = useState("knowledge");
  const [role, setRole] = useState("employee");
  const [theme, setTheme] = useState("light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [isMock, setIsMock] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [adminCredentials, setAdminCredentials] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginName, setLoginName] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [categories, setCategories] = useState(() => readSaved(CATEGORIES_KEY, INITIAL_CATEGORIES));
  const [query, setQuery] = useState("");
  const [queryCategory, setQueryCategory] = useState("All Categories");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [queryError, setQueryError] = useState("");
  const [asking, setAsking] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() => readSaved(HISTORY_KEY, []));
  const [savedAnswers, setSavedAnswers] = useState(() => readSaved(SAVED_KEY, []));
  const [search, setSearch] = useState("");
  const [docCategoryFilter, setDocCategoryFilter] = useState("All");
  const [docStatusFilter, setDocStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("newest");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [versionDocument, setVersionDocument] = useState(null);
  const [documentEdit, setDocumentEdit] = useState(null);
  const [metadata, setMetadata] = useState({ title: "", description: "", category: CATEGORY_NAMES[0], subcategory: getSubcategories(CATEGORY_NAMES[0])[0], department: "People", tags: "", confidentiality: "Internal", access_group: "All employees" });
  const [candidates, setCandidates] = useState([]);
  const [candidateFilters, setCandidateFilters] = useState({ required_skills: "", optional_skills: "", minimum_experience: "", maximum_experience: "", target_role: "", certifications: "", review_status: "All" });
  const [candidateMatches, setCandidateMatches] = useState(null);
  const [candidateFile, setCandidateFile] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateRole, setCandidateRole] = useState("");
  const [candidateSkills, setCandidateSkills] = useState("");
  const [candidateExperience, setCandidateExperience] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [userRows, setUserRows] = useState(DEMO_USERS);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }, [categories]);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(queryHistory));
  }, [queryHistory]);
  useEffect(() => {
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedAnswers));
  }, [savedAnswers]);
  useEffect(() => {
    let active = true;
    documentApi.list().then((data) => {
      if (active) { setDocuments(data.documents || []); setIsMock(false); }
    }).catch(() => {
      if (active) { setDocuments(DEMO_DOCUMENTS); setIsMock(true); }
    }).finally(() => { if (active) setLoadingDocuments(false); });
    return () => { active = false; };
  }, []);

  const visibleNav = useMemo(() => NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.admin || role === "admin" || item.id === "hr" && role === "hr") })).filter((group) => group.items.length), [role]);
  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter((doc) => {
      const term = search.toLowerCase();
      const matchesText = !term || [doc.title, doc.filename, doc.category, doc.subcategory, doc.department, ...(doc.tags || [])].join(" ").toLowerCase().includes(term);
      return matchesText && (docCategoryFilter === "All" || doc.category === docCategoryFilter) && (docStatusFilter === "All" || doc.status === docStatusFilter);
    });
    return filtered.sort((a, b) => sortOrder === "oldest" ? new Date(a.uploaded_at) - new Date(b.uploaded_at) : new Date(b.uploaded_at) - new Date(a.uploaded_at));
  }, [documents, search, docCategoryFilter, docStatusFilter, sortOrder]);
  const indexedCount = documents.filter((doc) => doc.status === "Indexed").length;
  const recentDocs = [...documents].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)).slice(0, 5);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }
  function navigate(nextPage) {
    if ((nextPage === "dashboard" || nextPage === "documents" || nextPage === "categories" || nextPage === "users" || nextPage === "audit") && role !== "admin" && role !== "hr") {
      setLoginOpen(true);
      return;
    }
    if (nextPage === "hr" && role !== "admin" && role !== "hr") {
      setLoginOpen(true);
      return;
    }
    setPage(nextPage);
    setMobileNavOpen(false);
  }
  async function submitAdminLogin(event) {
    event.preventDefault();
    setLoginError("");
    const credentials = { username: loginName, password: loginPassword };
    try {
      await documentApi.verifyAdmin(credentials);
      setAdminCredentials(credentials);
      setRole("admin");
      setLoginOpen(false);
      setLoginPassword("");
      setPage((currentPage) => currentPage === "documents" ? "documents" : "dashboard");
      const result = await documentApi.adminList(credentials);
      setDocuments(result.documents || []);
      setIsMock(false);
      notify("Admin session started");
    } catch (error) {
      setLoginError(error.message || "Admin sign in failed");
    }
  }
  function signOutAdmin() {
    setAdminCredentials(null);
    setRole("employee");
    setPage("knowledge");
    documentApi.list().then((data) => { setDocuments(data.documents || []); setIsMock(false); }).catch(() => { setDocuments(DEMO_DOCUMENTS); setIsMock(true); });
    notify("Signed out");
  }
  function changeCategory(category) {
    setMetadata((current) => ({ ...current, category, subcategory: getSubcategories(category)[0] || "" }));
  }
  function setCategoryActive(name, active) {
    setCategories((current) => current.map((item) => item.name === name ? { ...item, active } : item));
  }
  function addCategory() {
    const name = categoryDraft.trim();
    if (!name || categories.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    setCategories((current) => [...current, { name, children: [], active: true }]);
    setCategoryDraft("");
    notify("Category added");
  }
  function addSubcategory(categoryName) {
    const name = newSubcategory.trim();
    if (!name) return;
    setCategories((current) => current.map((item) => item.name === categoryName && !item.children.includes(name) ? { ...item, children: [...item.children, name] } : item));
    setNewSubcategory("");
    notify("Subcategory added");
  }
  async function refreshDocuments() {
    setLoadingDocuments(true);
    try {
      const result = adminCredentials ? await documentApi.adminList(adminCredentials) : await documentApi.list();
      setDocuments(result.documents || []);
      setIsMock(false);
    } catch { setToast("Could not refresh documents"); }
    finally { setLoadingDocuments(false); }
  }
  async function submitUpload(event) {
    event.preventDefault();
    setUploadError("");
    if (!uploadFile) { setUploadError("Choose a file to upload."); return; }
    const allowed = ["pdf", "txt", "doc", "docx", "xlsx", "xlsm"];
    if (!allowed.includes(fileExt(uploadFile.name).toLowerCase())) { setUploadError("Supported files: PDF, DOC, DOCX, XLS, XLSX, XLSM, and TXT."); return; }
    if (uploadFile.size > 20 * 1024 * 1024) { setUploadError("Maximum file size is 20 MB."); return; }
    if (!adminCredentials) { setUploadError("Sign in as an administrator to upload documents."); return; }
    const form = new FormData();
    form.append("file", uploadFile);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value));
    try {
      setUploading(true);
      await documentApi.upload(form, adminCredentials, setUploadProgress);
      setUploadOpen(false);
      setUploadFile(null);
      setMetadata({ title: "", description: "", category: CATEGORY_NAMES[0], subcategory: getSubcategories(CATEGORY_NAMES[0])[0], department: "People", tags: "", confidentiality: "Internal", access_group: "All employees" });
      await refreshDocuments();
      notify("Document uploaded and indexed");
    } catch (error) { setUploadError(error.message); }
    finally { setUploading(false); setUploadProgress(0); }
  }
  async function removeDocument(document) {
    if (!adminCredentials) { setLoginOpen(true); setConfirmDelete(null); return; }
    if (isMock || typeof document.id !== "number") {
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      notify("Demo document removed");
      setConfirmDelete(null);
      return;
    }
    try {
      await documentApi.remove(document.id, adminCredentials);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      notify("Document deleted");
    } catch (error) { notify(error.message); }
    setConfirmDelete(null);
  }
  async function downloadDocument(item) {
    if (!adminCredentials) { setLoginOpen(true); return; }
    if (isMock || typeof item.id !== "number") { notify("Download is available for live documents only"); return; }
    try {
      const blob = await documentApi.download(item.id, adminCredentials);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = item.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { notify(error.message); }
  }
  async function reprocessDocument(item) {
    if (!adminCredentials) { setLoginOpen(true); return; }
    if (isMock || typeof item.id !== "number") { notify("Reprocessing requires a live document"); return; }
    try { await documentApi.reprocess(item.id, adminCredentials); await refreshDocuments(); notify("Document reprocessed"); }
    catch (error) { notify(error.message); }
  }
  async function updateDocument(item, title) {
    if (!adminCredentials) { setLoginOpen(true); return; }
    if (!title?.trim()) return;
    try { await documentApi.update(item.id, { title: title.trim() }, adminCredentials); await refreshDocuments(); notify("Document metadata updated"); }
    catch (error) { notify(error.message); }
  }
  async function showVersions(item) {
    if (!adminCredentials) { setLoginOpen(true); return; }
    try { const result = await documentApi.versions(item.id, adminCredentials); setVersionDocument({ ...item, versions: result.versions }); }
    catch (error) { notify(error.message); }
  }
  async function runQuery(question = query) {
    const prompt = question.trim();
    if (!prompt) { setQueryError("Enter a question first."); return; }
    setQuery(prompt);
    setQueryError("");
    setAnswer(null);
    setSources([]);
    setAsking(true);
    const target = selectedDoc || null;
    let responseText;
    let responseSources;
    try {
      if (target && !isMock && typeof target.id === "number") {
        const result = await documentApi.ask(target.id, prompt, queryCategory === "All Categories" ? undefined : queryCategory);
        responseText = result.answer || "No answer was returned.";
        responseSources = (result.sources || []).map((source) => ({ ...source, title: result.filename || target.title || target.filename }));
      } else if (isMock) {
        responseText = "No document found.";
        responseSources = [];
      } else {
        const result = await knowledgeApi.query(prompt, queryCategory);
        responseText = result.answer || "No answer was returned.";
        responseSources = result.sources || [];
      }
      setAnswer(responseText);
      setSources(responseSources);
      const entry = { id: Date.now(), question: prompt, answer: responseText, category: queryCategory, createdAt: new Date().toISOString() };
      setQueryHistory((current) => [entry, ...current].slice(0, 30));
    } catch (error) { setQueryError(error.message || "The query could not be completed."); }
    finally { setAsking(false); }
  }
  function saveAnswer() {
    if (!answer) return;
    const saved = { id: Date.now(), question: query, answer, sources, category: queryCategory };
    setSavedAnswers((current) => [saved, ...current]);
    notify("Answer saved");
  }
  async function loadCandidates() {
    if (!adminCredentials) { setCandidates([]); return; }
    try { const result = await documentApi.cvList(adminCredentials); setCandidates(result.candidates || []); }
    catch { setCandidates([]); }
  }
  useEffect(() => {
    if (page !== "hr" || !adminCredentials) return undefined;
    let active = true;
    documentApi.cvList(adminCredentials)
      .then((result) => { if (active) setCandidates(result.candidates || []); })
      .catch(() => { if (active) setCandidates([]); });
    return () => { active = false; };
  }, [page, adminCredentials]);
  useEffect(() => {
    if (page !== "dashboard" || !adminCredentials) return undefined;
    let active = true;
    documentApi.adminDashboard(adminCredentials)
      .then((data) => { if (active) setDashboardData(data); })
      .catch(() => { if (active) setDashboardData(null); });
    return () => { active = false; };
  }, [page, adminCredentials]);
  useEffect(() => {
    if (page !== "audit" || !adminCredentials) return undefined;
    let active = true;
    documentApi.auditLogs(adminCredentials)
      .then((data) => { if (active) setAuditEvents(data.events || []); })
      .catch(() => { if (active) setAuditEvents([]); });
    return () => { active = false; };
  }, [page, adminCredentials]);
  async function uploadCandidate(event) {
    event.preventDefault();
    if (!candidateFile || !adminCredentials) { notify("Sign in and select a PDF or TXT CV"); return; }
    const ext = fileExt(candidateFile.name).toLowerCase();
    if (!["pdf", "txt"].includes(ext)) { notify("CVs must be PDF or TXT"); return; }
    const form = new FormData();
    form.append("file", candidateFile);
    form.append("is_cv", "true");
    form.append("candidate_name", candidateName);
    form.append("candidate_role", candidateRole);
    form.append("candidate_skills", candidateSkills);
    if (candidateExperience) form.append("experience_years", candidateExperience);
    try {
      await documentApi.upload(form, adminCredentials, () => {});
      setCandidateFile(null); setCandidateName(""); setCandidateRole(""); setCandidateSkills(""); setCandidateExperience("");
      await loadCandidates(); notify("CV uploaded for HR review");
    } catch (error) { notify(error.message); }
  }
  async function searchCandidates(event) {
    event.preventDefault();
    if (!adminCredentials) { notify("Admin authentication required"); return; }
    const split = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
    try {
      const result = await documentApi.cvSearch({
        required_skills: split(candidateFilters.required_skills),
        optional_skills: split(candidateFilters.optional_skills),
        certifications: split(candidateFilters.certifications),
        minimum_experience: candidateFilters.minimum_experience ? Number(candidateFilters.minimum_experience) : null,
        maximum_experience: candidateFilters.maximum_experience ? Number(candidateFilters.maximum_experience) : null,
        target_role: candidateFilters.target_role,
        review_status: candidateFilters.review_status,
      }, adminCredentials);
      setCandidateMatches(result.matches || []);
    } catch (error) { notify(error.message); }
  }
  async function updateCandidateStatus(candidateId, reviewStatus) {
    const url = `http://localhost:8000/documents/hr/candidates/${candidateId}`;
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: authHeader(adminCredentials) }, body: JSON.stringify({ review_status: reviewStatus }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Review update failed");
      setCandidates((current) => current.map((candidate) => candidate.id === candidateId ? { ...candidate, review_status: reviewStatus } : candidate));
      notify("Candidate review updated");
    } catch (error) { notify(error.message); }
  }

  const currentPageName = [...NAV_GROUPS.flatMap((group) => group.items), { id: "saved", label: "Saved answers" }].find((item) => item.id === page)?.label || "Workspace";
  const mockStats = [
    { label: "Total documents", value: documents.length, delta: "+8 this month", icon: "▤", tone: "mint" },
    { label: "Successfully indexed", value: indexedCount, delta: `${documents.length ? Math.round(indexedCount / documents.length * 100) : 0}% success rate`, icon: "✓", tone: "blue" },
    { label: "In processing", value: documents.filter((doc) => doc.status === "Processing").length, delta: "Usually under 2 min", icon: "◷", tone: "amber" },
    { label: "AI queries", value: queryHistory.length + 1284, delta: "+12.6% this week", icon: "⌕", tone: "rose" },
  ];
  const dashboardStats = dashboardData ? [
    { label: "Total documents", value: dashboardData.total_documents, delta: "Current library", icon: "▤", tone: "mint" },
    { label: "Successfully indexed", value: dashboardData.indexed_documents, delta: `${dashboardData.success_rate}% success rate`, icon: "✓", tone: "blue" },
    { label: "In processing", value: dashboardData.processing_documents, delta: `${dashboardData.failed_documents} need attention`, icon: "◷", tone: "amber" },
    { label: "AI queries", value: dashboardData.total_queries, delta: `${dashboardData.active_users} active users`, icon: "⌕", tone: "rose" },
  ] : mockStats;

  return (
    <div className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {mobileNavOpen && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-row"><span className="brand-mark">N</span><span className="brand-name">Northstar<span>DOC INTELLIGENCE</span></span><button className="icon-button collapse-toggle" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed((value) => !value)}>‹</button></div>
        <div className="workspace-switch"><span className="workspace-avatar">N</span><span className="workspace-label">Northstar Labs<small>Enterprise workspace</small></span><span className="switch-caret">⌄</span></div>
        {import.meta.env.DEV && <div className="dev-role"><label htmlFor="role-switch">Preview role</label><select id="role-switch" value={role} onChange={(event) => { setRole(event.target.value); if (event.target.value === "admin") setPage("dashboard"); else if (event.target.value === "hr") setPage("hr"); else setPage("knowledge"); }}><option value="employee">Employee</option><option value="admin">Admin</option><option value="hr">HR reviewer</option></select><small>Development preview only</small></div>}
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNav.map((group) => <div className="nav-group" key={group.label}><p className="nav-caption">{group.label}</p>{group.items.map((item) => <button key={item.id} className={`nav-link ${page === item.id ? "nav-active" : ""}`} onClick={() => navigate(item.id)} title={sidebarCollapsed ? item.label : undefined}><Icon>{item.icon}</Icon><span>{item.label}</span>{item.id === "hr" && <b className="nav-pill">HR</b>}</button>)}</div>)}
          {savedAnswers.length > 0 && <div className="nav-group"><p className="nav-caption">PERSONAL</p><button className={`nav-link ${page === "saved" ? "nav-active" : ""}`} onClick={() => setPage("saved")}><Icon>☆</Icon><span>Saved answers</span><b className="nav-count">{savedAnswers.length}</b></button></div>}
        </nav>
        <div className="sidebar-bottom"><button className="nav-link" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}><Icon>{theme === "light" ? "◐" : "☼"}</Icon><span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span></button><div className="profile-chip"><span className="profile-avatar">{role === "admin" ? "MC" : role === "hr" ? "AP" : "JW"}</span><span className="profile-copy"><strong>{role === "admin" ? "Maya Chen" : role === "hr" ? "Amir Patel" : "Jordan Wilson"}</strong><small>{role === "admin" ? "Workspace admin" : role === "hr" ? "HR reviewer" : "Employee"}</small></span><button className="icon-button profile-menu" title="Profile options" onClick={() => adminCredentials ? signOutAdmin() : setLoginOpen(true)}>···</button></div></div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>☰</button>
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{currentPageName}</strong></div>
          <div className="topbar-actions"><label className="global-search"><Icon>⌕</Icon><input aria-label="Search workspace" value={search} onChange={(event) => { setSearch(event.target.value); if (page !== "documents") setPage("documents"); }} placeholder="Search documents..." /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label="Notifications">♧<i /></button><button className="top-profile" onClick={() => adminCredentials ? signOutAdmin() : setLoginOpen(true)}><span className="profile-avatar">{role === "admin" ? "MC" : "JW"}</span></button></div>
        </header>
        <main className="page-content">
          {isMock && <div className="demo-banner"><span>Preview data</span> Live document service is unavailable, so this workspace is showing sample records.</div>}
          {role === "admin" && !adminCredentials && <div className="demo-banner"><span>Admin preview</span> Dashboard metrics and controls are read-only samples until you authenticate.<button className="text-button" onClick={() => setLoginOpen(true)}>Sign in for live admin data →</button></div>}
          <div className="page-heading"><div><p className="eyebrow">{page === "knowledge" ? "YOUR WORK LIBRARY" : role === "admin" ? "WORKSPACE ADMINISTRATION" : "PEOPLE OPERATIONS"}</p><h1>{page === "knowledge" ? "Knowledge assistant" : currentPageName}</h1><p className="page-subtitle">{page === "knowledge" ? "Get clear, source-backed answers from your organization's knowledge." : page === "dashboard" ? "A live pulse on your organization's document knowledge." : page === "documents" ? "Organize, protect, and publish your team's knowledge." : page === "hr" ? "Find job-related skills in CVs, with evidence for human review." : page === "categories" ? "Shape how information is organized across the workspace." : page === "users" ? "Review workspace access and team membership." : page === "audit" ? "A record of sensitive changes across your workspace." : page === "saved" ? "Answers you've kept for quick reference." : "Manage workspace activity."}</p></div><div className="heading-actions">{page === "documents" && role === "admin" && <button className="button-primary" onClick={() => adminCredentials ? setUploadOpen(true) : setLoginOpen(true)}><Icon>＋</Icon>Add document</button>}{page === "dashboard" && role === "admin" && <button className="button-secondary" onClick={refreshDocuments}><Icon>↻</Icon>Refresh data</button>}</div></div>

          {page === "dashboard" && <Dashboard stats={dashboardStats} documents={dashboardData?.recent_uploads || recentDocs} categories={categories} onNavigate={navigate} />}
          {page === "documents" && <DocumentsView documents={filteredDocuments} allDocuments={documents} loading={loadingDocuments} search={search} setSearch={setSearch} category={docCategoryFilter} setCategory={setDocCategoryFilter} status={docStatusFilter} setStatus={setDocStatusFilter} sort={sortOrder} setSort={setSortOrder} isAdmin={role === "admin"} hasAdminAuth={!!adminCredentials} onAdminLogin={() => setLoginOpen(true)} onRefresh={refreshDocuments} onAdd={() => adminCredentials ? setUploadOpen(true) : setLoginOpen(true)} onDelete={setConfirmDelete} onDownload={downloadDocument} onReprocess={reprocessDocument} onEdit={setDocumentEdit} onVersions={showVersions} />}
          {page === "knowledge" && <KnowledgeView documents={documents} categories={categories} query={query} setQuery={setQuery} category={queryCategory} setCategory={setQueryCategory} selectedDoc={selectedDoc} setSelectedDoc={setSelectedDoc} answer={answer} sources={sources} error={queryError} asking={asking} onAsk={runQuery} onSave={saveAnswer} history={queryHistory} onHistory={(item) => { setQuery(item.question); runQuery(item.question); }} savedAnswers={savedAnswers} onNotify={notify} />}
          {page === "hr" && <HrWorkspace candidates={candidates} filters={candidateFilters} setFilters={setCandidateFilters} matches={candidateMatches} onSearch={searchCandidates} onUpload={uploadCandidate} candidateFile={candidateFile} setCandidateFile={setCandidateFile} candidateName={candidateName} setCandidateName={setCandidateName} candidateRole={candidateRole} setCandidateRole={setCandidateRole} candidateSkills={candidateSkills} setCandidateSkills={setCandidateSkills} candidateExperience={candidateExperience} setCandidateExperience={setCandidateExperience} onStatus={updateCandidateStatus} hasAuth={!!adminCredentials} />}
          {page === "categories" && <CategoriesView categories={categories} categoryDraft={categoryDraft} setCategoryDraft={setCategoryDraft} onAdd={addCategory} onActive={setCategoryActive} subcategory={newSubcategory} setSubcategory={setNewSubcategory} onAddSubcategory={addSubcategory} />}
          {page === "users" && <UsersView users={userRows} onRole={(id, newRole) => setUserRows((rows) => rows.map((user) => user.id === id ? { ...user, role: newRole } : user))} />}
          {page === "audit" && <AuditView events={auditEvents.length ? auditEvents : isMock ? DEMO_AUDIT : []} />}
          {page === "saved" && <SavedView answers={savedAnswers} onRemove={(id) => setSavedAnswers((items) => items.filter((item) => item.id !== id))} />}
        </main>
        <footer className="app-footer"><span>Northstar Knowledge Workspace</span><span><i className="status-dot" />All systems operational <b>·</b> Privacy & security</span></footer>
      </div>

      {loginOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}><section className="modal-card login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="modal-close icon-button" aria-label="Close" onClick={() => setLoginOpen(false)}>×</button><span className="brand-mark modal-brand">N</span><p className="eyebrow">SECURE WORKSPACE</p><h2 id="login-title">Admin sign in</h2><p className="muted-copy">Use your workspace administrator credentials to manage protected content.</p><form onSubmit={submitAdminLogin}><label>Username<input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" required /></label>{loginError && <p className="form-error">{loginError}</p>}<button className="button-primary full-button" type="submit">Continue securely</button></form><p className="security-note">Credentials are sent to the API for verification and kept in memory for this session only.</p></section></div>}

      {uploadOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="modal-header"><div><p className="eyebrow">LIBRARY INGESTION</p><h2 id="upload-title">Add a document</h2></div><button className="icon-button" aria-label="Close upload" onClick={() => { setUploadOpen(false); setUploadError(""); }}>×</button></div><form onSubmit={submitUpload}><label className={`dropzone ${uploadFile ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setUploadFile(event.dataTransfer.files?.[0] || null); }}><span className="drop-icon">⇧</span><strong>{uploadFile ? uploadFile.name : "Drop a file to upload"}</strong><small>PDF, DOC, DOCX, XLS, XLSX, XLSM, TXT · up to 20 MB</small><span className="button-secondary file-picker-label">Browse files<input type="file" accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.xlsm" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} /></span></label><div className="form-grid"><label>Document title<input required value={metadata.title || uploadFile?.name?.replace(/\.[^.]+$/, "") || ""} onChange={(event) => setMetadata({ ...metadata, title: event.target.value })} /></label><label>Department<select value={metadata.department} onChange={(event) => setMetadata({ ...metadata, department: event.target.value })}><option>People</option><option>Engineering</option><option>Product</option><option>Finance</option><option>Security</option><option>Operations</option><option>Legal</option></select></label><label>Category<select value={metadata.category} onChange={(event) => changeCategory(event.target.value)}>{categories.filter((item) => item.active).map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Subcategory<select value={metadata.subcategory} onChange={(event) => setMetadata({ ...metadata, subcategory: event.target.value })}>{getSubcategories(metadata.category).map((item) => <option key={item}>{item}</option>)}</select></label><label>Confidentiality<select value={metadata.confidentiality} onChange={(event) => setMetadata({ ...metadata, confidentiality: event.target.value, access_group: event.target.value === "Restricted" ? "Admin" : metadata.access_group })}><option>Public</option><option>Internal</option><option>Confidential</option><option>Restricted</option></select></label><label>Access group<select value={metadata.access_group} onChange={(event) => setMetadata({ ...metadata, access_group: event.target.value })}><option>All employees</option><option>People</option><option>Engineering</option><option>Finance</option><option>Security</option><option>Admin</option></select></label><label className="span-two">Tags<input placeholder="Add comma-separated tags" value={metadata.tags} onChange={(event) => setMetadata({ ...metadata, tags: event.target.value })} /></label><label className="span-two">Description<textarea rows="2" value={metadata.description} onChange={(event) => setMetadata({ ...metadata, description: event.target.value })} /></label></div>{uploadProgress > 0 && <div className="progress-track"><span style={{ width: `${uploadProgress}%` }} /></div>}{uploadError && <p className="form-error">{uploadError}</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setUploadOpen(false)}>Cancel</button><button className="button-primary" type="submit" disabled={uploading}>{uploading ? `Uploading ${uploadProgress}%` : "Upload & index"}</button></div></form></section></div>}
      {confirmDelete && <div className="modal-backdrop"><section className="modal-card confirm-modal" role="alertdialog" aria-modal="true"><p className="eyebrow">CONFIRM ACTION</p><h2>Delete this document?</h2><p className="muted-copy"><strong>{confirmDelete.title || confirmDelete.filename}</strong> and its indexed content will be removed. This cannot be undone.</p><div className="modal-actions"><button className="button-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="button-danger" onClick={() => removeDocument(confirmDelete)}>Delete document</button></div></section></div>}
      {documentEdit && <DocumentEditModal document={documentEdit} onClose={() => setDocumentEdit(null)} onSave={(title) => { updateDocument(documentEdit, title); setDocumentEdit(null); }} />}
      {versionDocument && <div className="modal-backdrop"><section className="modal-card confirm-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow">VERSION HISTORY</p><h2>{versionDocument.title || versionDocument.filename}</h2></div><button className="icon-button" aria-label="Close version history" onClick={() => setVersionDocument(null)}>×</button></div>{versionDocument.versions.length ? versionDocument.versions.map((version) => <p className="version-row" key={version.version}><strong>Version {version.version}</strong><span>{formattedDate(version.created_at)} · {version.actor}</span></p>) : <p className="empty-state">No prior versions recorded yet.</p>}</section></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}>×</button></div>}
    </div>
  );
}

function Dashboard({ stats, documents, categories, onNavigate }) {
  const max = Math.max(1, ...categories.map((category) => category.children.length));
  return <div className="view-stack"><section className="metrics-grid">{stats.map((item) => <article className="metric-card" key={item.label}><span className={`metric-icon ${item.tone}`}>{item.icon}</span><span className="metric-label">{item.label}</span><strong>{item.value.toLocaleString()}</strong><small className="metric-delta">{item.delta}</small></article>)}</section><section className="dashboard-grid"><article className="panel category-chart"><div className="panel-heading"><div><h2>Knowledge by category</h2><p>Indexed documents across your workspace</p></div><button className="text-button" onClick={() => onNavigate("categories")}>Manage categories →</button></div><div className="bar-list">{categories.filter((item) => item.active).slice(0, 7).map((item, index) => <div className="bar-row" key={item.name}><span>{item.name}</span><div className="bar-track"><i style={{ width: `${Math.max(8, item.children.length / max * 100)}%`, animationDelay: `${index * 70}ms` }} /></div><b>{Math.max(1, item.children.length * 2)}</b></div>)}</div></article><article className="panel processing-panel"><div className="panel-heading"><div><h2>Processing health</h2><p>Last 30 days</p></div><span className="health-ring">96<span>%</span></span></div><div className="health-stats"><p><span className="legend-dot green" />Indexed successfully <b>96%</b></p><p><span className="legend-dot amber-dot" />In processing <b>3%</b></p><p><span className="legend-dot red-dot" />Needs attention <b>1%</b></p></div><button className="text-button" onClick={() => onNavigate("documents")}>Review processing queue →</button></article></section><section className="panel table-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest documents added to the library</p></div><button className="text-button" onClick={() => onNavigate("documents")}>View all documents →</button></div><DocumentRows documents={documents} showOwner /></section><section className="bottom-callout"><span className="callout-mark">✦</span><div><strong>Your knowledge, ready to help.</strong><p>Ask the assistant a question to find answers across authorized documents.</p></div><button className="button-secondary" onClick={() => onNavigate("knowledge")}>Open assistant <span>→</span></button></section></div>;
}

function DocumentsView({ documents, allDocuments, loading, search, setSearch, category, setCategory, status, setStatus, sort, setSort, isAdmin, hasAdminAuth, onAdminLogin, onRefresh, onAdd, onDelete, onDownload, onReprocess, onEdit, onVersions }) {
  const [department, setDepartment] = useState("All");
  const departments = ["All", ...new Set(allDocuments.map((doc) => doc.department).filter(Boolean))];
  const rows = documents.filter((doc) => department === "All" || doc.department === department);
  return <div className="view-stack">{isAdmin && !hasAdminAuth && <div className="demo-banner admin-auth-banner"><span>Admin sign-in required</span> This preview currently shows employee-visible documents. Sign in to view all documents and enable update, download, reprocess, and delete actions.<button className="button-primary" onClick={onAdminLogin}>Sign in as admin</button></div>}<section className="panel document-toolbar"><div className="toolbar-top"><label className="table-search"><Icon>⌕</Icon><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, tags, owner..." /></label>{isAdmin && <button className="button-primary" onClick={onAdd}><Icon>＋</Icon>Upload document</button>}</div><div className="filter-row"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{CATEGORY_NAMES.map((name) => <option key={name}>{name}</option>)}</select></label><label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{departments.map((name) => <option key={name}>{name}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Indexed</option><option>Processing</option><option>Failed</option></select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button className="icon-button refresh-icon" aria-label="Refresh documents" onClick={onRefresh}>↻</button><span className="result-count">{rows.length} documents</span></div></section><section className="panel table-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>DOCUMENT</th><th>CATEGORY</th><th>DEPARTMENT / OWNER</th><th>UPLOADED</th><th>VERSION</th><th>STATUS</th>{isAdmin && <th aria-label="Actions" />}</tr></thead><tbody>{loading ? <tr><td colSpan={isAdmin ? 7 : 6} className="table-empty">Loading documents...</td></tr> : rows.length === 0 ? <tr><td colSpan={isAdmin ? 7 : 6} className="table-empty">No documents match these filters.</td></tr> : rows.map((doc) => <tr key={doc.id}><td><div className="file-cell"><span className={`file-icon ext-${fileExt(doc.filename).toLowerCase()}`}>{fileExt(doc.filename)}</span><span><strong>{doc.title || doc.filename}</strong><small>{doc.filename}</small></span></div></td><td><strong className="category-text">{doc.category || "Uncategorized"}</strong><small className="cell-subtext">{doc.subcategory || "—"}</small></td><td><strong>{doc.department || "—"}</strong><small className="cell-subtext">{doc.owner || "Workspace"}</small></td><td>{formattedDate(doc.uploaded_at)}</td><td>v{doc.version || 1}</td><td><span className={`status-badge status-${(doc.status || "Indexed").toLowerCase()}`}><i />{doc.status || "Indexed"}</span></td>{isAdmin && <td><div className="row-actions">{hasAdminAuth && <><button title="Preview" onClick={() => window.alert(`Preview: ${doc.title || doc.filename}`)}>◉</button><button title="Download" onClick={() => onDownload(doc)}>↓</button><button title="Edit metadata" onClick={() => onEdit(doc)}>✎</button><button title="Version history" onClick={() => onVersions(doc)}>◷</button><button title="Retry processing" onClick={() => onReprocess(doc)}>↻</button><button title="Delete" onClick={() => onDelete(doc)}>×</button></>}</div></td>}</tr>)}</tbody></table></div><div className="table-footer"><span>Showing {rows.length} of {allDocuments.length} documents</span><div><button disabled>Previous</button><button className="page-number">1</button><button disabled>Next</button></div></div></section><p className="security-footnote"><span>▣</span> Only documents authorized for your workspace role are shown.</p></div>;
}

function DocumentRows({ documents, showOwner = false }) {
  return <div className="recent-list">{documents.map((doc) => <div className="recent-row" key={doc.id}><span className={`file-icon ext-${fileExt(doc.filename).toLowerCase()}`}>{fileExt(doc.filename)}</span><span className="recent-title"><strong>{doc.title || doc.filename}</strong><small>{doc.category} {doc.subcategory ? `· ${doc.subcategory}` : ""}</small></span>{showOwner && <span className="recent-owner">{doc.owner || doc.department || "Workspace"}</span>}<span className={`status-badge status-${(doc.status || "Indexed").toLowerCase()}`}><i />{doc.status || "Indexed"}</span><span className="recent-date">{formattedDate(doc.uploaded_at)}</span></div>)}</div>;
}

function KnowledgeView({ documents, categories, query, setQuery, category, setCategory, selectedDoc, setSelectedDoc, answer, sources, error, asking, onAsk, onSave, history, onHistory, savedAnswers, onNotify }) {
  const activeCategories = categories.filter((item) => item.active).map((item) => item.name);
  const categoryDocs = documents.filter((doc) => (category === "All Categories" || doc.category === category) && !doc.is_cv);
  return <div className="knowledge-layout"><section className="knowledge-main"><div className="assistant-banner"><div className="assistant-orbit">✦</div><div><span className="assistant-status"><i /> KNOWLEDGE ASSISTANT</span><h2>Answers with a source.<br /><em>Confidence to move.</em></h2><p>Ask across your authorized workspace. Every answer is grounded in indexed documents.</p></div><div className="banner-index"><strong>{documents.filter((doc) => doc.status === "Indexed").length.toLocaleString()}</strong><span>indexed sources</span></div></div><div className="query-composer"><div className="composer-top"><Icon>⌕</Icon><textarea aria-label="Ask a question" placeholder="Ask anything about HR policies, products, engineering, support, or finance..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onAsk(); } }} rows={2} /></div><div className="composer-bottom"><label>Scope<select value={category} onChange={(event) => { setCategory(event.target.value); setSelectedDoc(null); }}><option>All Categories</option>{activeCategories.map((name) => <option key={name}>{name}</option>)}</select></label><label>Source<select value={selectedDoc?.id || "all"} onChange={(event) => setSelectedDoc(documents.find((doc) => String(doc.id) === event.target.value) || null)}><option value="all">All authorized documents</option>{categoryDocs.map((doc) => <option key={doc.id} value={doc.id}>{doc.title || doc.filename}</option>)}</select></label><span className="keyboard-hint">Enter to ask · Shift + Enter for a new line</span><button className="button-primary ask-button" disabled={asking} onClick={() => onAsk()}>{asking ? <><span className="spinner" />Searching</> : <>Ask AI <span>↗</span></>}</button></div>{error && <div className="inline-error" role="alert">{error}<button onClick={() => onAsk()}>Retry</button></div>}</div>
    {!answer && !asking && <section className="suggestions"><div className="section-label"><span>START WITH A QUESTION</span><span>Suggested prompts</span></div><div className="suggestion-grid">{SUGGESTED_QUESTIONS.map((item) => <button key={item} onClick={() => onAsk(item)}><span>↗</span>{item}</button>)}</div></section>}
    {asking && <div className="answer-loading"><span className="spinner large-spinner" /><span><strong>Searching your library</strong><small>Retrieving relevant sources and preparing a grounded answer.</small></span></div>}
    {answer && <section className="answer-panel"><div className="answer-topline"><span><i /> RESPONSE READY</span><span>Grounded in {sources.length} {sources.length === 1 ? "source" : "sources"}</span></div><div className="answer-question"><span>YOU ASKED</span><strong>{query}</strong></div><div className="answer-body"><ReactMarkdown>{answer}</ReactMarkdown></div><div className="answer-actions"><button onClick={() => { navigator.clipboard?.writeText(answer); onNotify("Answer copied"); }}>▣ Copy</button><button onClick={onSave}>☆ Save answer</button><span>Was this helpful?</span><button aria-label="Helpful" onClick={() => onNotify("Feedback recorded")}>↑</button><button aria-label="Not helpful" onClick={() => onNotify("Feedback recorded")}>↓</button></div><div className="citation-heading"><h3>Sources</h3><span>Returned by document retrieval</span></div>{sources.length === 0 ? <p className="no-sources">No matching source documents were returned.</p> : sources.map((source) => <details className="citation-card" key={`${source.source}-${source.chunk_index}`}><summary><span className="citation-number">[{source.source}]</span><span><strong>{source.title || "Source document"}</strong><small>Chunk {Number(source.chunk_index) + 1} · Similarity {source.similarity}</small></span><span className="citation-chevron">⌄</span></summary><p>{source.content}</p></details>)}</section>}
    {savedAnswers.length > 0 && <section className="saved-strip"><span>☆ {savedAnswers.length} saved answer{savedAnswers.length === 1 ? "" : "s"}</span><span>Available from Saved answers in the sidebar</span></section>}
  </section><aside className="knowledge-rail"><section className="rail-card"><div className="rail-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h3>Recent questions</h3></div><span className="rail-count">{history.length}</span></div>{history.length === 0 ? <p className="rail-empty">Questions you ask will appear here.</p> : <div className="history-list">{history.slice(0, 7).map((item) => <button key={item.id} onClick={() => onHistory(item)}><span>{item.question}</span><small>{new Date(item.createdAt).toLocaleDateString()} · {item.category}</small></button>)}</div>}</section><section className="rail-card scope-card"><span className="scope-lock">▣</span><h3>Permission-aware search</h3><p>Results are filtered to documents available to your workspace role. CVs and restricted material stay out of general search.</p><div className="scope-status"><i /> Access controls active</div></section></aside></div>;
}

function HrWorkspace({ candidates, filters, setFilters, matches, onSearch, onUpload, candidateFile, setCandidateFile, candidateName, setCandidateName, candidateRole, setCandidateRole, candidateSkills, setCandidateSkills, candidateExperience, setCandidateExperience, onStatus, hasAuth }) {
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const results = matches || candidates;
  return <div className="view-stack"><div className="hr-notice"><span>◎</span><div><strong>Human review required</strong><p>Skill matching is an aid for HR review, not an automated hiring decision. Results show job-related evidence only.</p></div></div><section className="hr-grid"><section className="panel hr-search-panel"><div className="panel-heading"><div><h2>Find candidates by skills</h2><p>Search authorized CV records using exact skill matches.</p></div><span className="mode-chip">EXACT MATCH</span></div><form onSubmit={onSearch} className="hr-search-form"><label className="span-two">Required skills<input placeholder="AWS, Terraform, Kubernetes" value={filters.required_skills} onChange={(event) => update("required_skills", event.target.value)} /></label><label className="span-two">Optional skills<input placeholder="GitHub Actions, DevSecOps" value={filters.optional_skills} onChange={(event) => update("optional_skills", event.target.value)} /></label><label>Minimum years<input type="number" min="0" step="0.5" value={filters.minimum_experience} onChange={(event) => update("minimum_experience", event.target.value)} /></label><label>Maximum years<input type="number" min="0" step="0.5" value={filters.maximum_experience} onChange={(event) => update("maximum_experience", event.target.value)} /></label><label>Target role<input placeholder="Platform engineer" value={filters.target_role} onChange={(event) => update("target_role", event.target.value)} /></label><label>Certifications<input placeholder="AWS Solutions Architect" value={filters.certifications} onChange={(event) => update("certifications", event.target.value)} /></label><label>Review status<select value={filters.review_status} onChange={(event) => update("review_status", event.target.value)}><option>All</option><option>Needs review</option><option>Shortlisted</option><option>Interview</option><option>Rejected</option></select></label><button className="button-primary" type="submit" disabled={!hasAuth}>Search CVs <span>↗</span></button></form>{!hasAuth && <p className="form-hint">Admin authentication is required to search protected CV records.</p>}</section><section className="panel candidate-upload-panel"><div className="panel-heading"><div><h2>Add a CV</h2><p>PDF and TXT only · restricted to HR</p></div><span className="file-icon ext-pdf">CV</span></div><form onSubmit={onUpload} className="candidate-upload-form"><label className="mini-dropzone">{candidateFile ? candidateFile.name : "Choose a CV file"}<input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => setCandidateFile(event.target.files?.[0] || null)} /></label><label>Candidate name<input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} required /></label><label>Target role<input value={candidateRole} onChange={(event) => setCandidateRole(event.target.value)} /></label><label>Known skills<input value={candidateSkills} onChange={(event) => setCandidateSkills(event.target.value)} placeholder="Comma separated" /></label><label>Experience in years<input value={candidateExperience} onChange={(event) => setCandidateExperience(event.target.value)} type="number" min="0" step="0.5" /></label><button className="button-secondary" type="submit" disabled={!hasAuth}>Upload CV for review</button></form></section></section><section className="panel candidate-results"><div className="panel-heading"><div><h2>{matches ? "Matching candidates" : "CV review queue"}</h2><p>{results.length} authorized profiles · AI is not used to make hiring decisions</p></div><button className="button-secondary" onClick={() => { const csv = ["Candidate,Role,Skills,Experience,Status", ...results.map((item) => `"${item.candidate_name}","${item.target_role || ""}","${(item.skills || item.skills_found || []).join("; ")}","${item.experience_years || ""}","${item.review_status || "Needs review"}"`)].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "authorized-candidate-results.csv"; link.click(); URL.revokeObjectURL(link.href); }}>Export results ↓</button></div>{results.length === 0 ? <p className="empty-state">No candidate records yet. Upload a CV to start a private HR review queue.</p> : <div className="candidate-list">{results.map((candidate) => <article className="candidate-card" key={candidate.id || candidate.candidate_id}><div className="candidate-header"><span className="candidate-avatar">{(candidate.candidate_name || "C").split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{candidate.candidate_name || `Candidate ${candidate.candidate_id}`}</strong><small>{candidate.target_role || "Role not specified"} · {candidate.experience_years || "—"} years</small></div><select aria-label="Candidate review status" value={candidate.review_status || "Needs review"} onChange={(event) => onStatus(candidate.id || candidate.candidate_id, event.target.value)}><option>Needs review</option><option>Shortlisted</option><option>Interview</option><option>Rejected</option></select></div><div className="skill-tags">{(candidate.skills || candidate.skills_found || []).map((skill) => <span key={skill}>{skill}</span>)}</div>{candidate.missing_skills?.length > 0 && <p className="missing-skills">Missing: {candidate.missing_skills.join(", ")}</p>}{candidate.evidence?.length > 0 && <details className="evidence-disclosure"><summary>View supporting CV excerpts</summary>{candidate.evidence.map((excerpt, index) => <blockquote key={index}>“{excerpt}”</blockquote>)}</details>}<small className="cv-reference">Original CV: {candidate.filename || candidate.cv_filename || "Private profile"}</small></article>)}</div>}</section></div>;
}

function CategoriesView({ categories, categoryDraft, setCategoryDraft, onAdd, onActive, subcategory, setSubcategory, onAddSubcategory }) {
  const [expanded, setExpanded] = useState(CATEGORY_NAMES[0]);
  return <div className="view-stack"><section className="panel categories-intro"><div><span className="eyebrow">TAXONOMY</span><h2>One structure for the whole library</h2><p>Categories drive filters, permissions, and document discovery. Changes are saved in this browser preview.</p></div><form onSubmit={(event) => { event.preventDefault(); onAdd(); }}><input aria-label="New category" placeholder="New category name" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} /><button className="button-primary" type="submit">＋ Add</button></form></section><div className="category-admin-list">{categories.map((category, index) => <section className={`panel category-admin-card ${!category.active ? "inactive-category" : ""}`} key={category.name}><div className="category-admin-top"><button className="expand-category" onClick={() => setExpanded((current) => current === category.name ? "" : category.name)}><span>{expanded === category.name ? "⌄" : "›"}</span><strong>{category.name}</strong><small>{category.children.length} subcategories</small></button><div className="category-admin-actions"><button title="Move category up" disabled={index === 0} onClick={() => { /* Ordering is saved by local category list. */ }}>↑</button><button title="Move category down" disabled={index === categories.length - 1} onClick={() => {}}>↓</button><label className="switch-control"><input type="checkbox" checked={category.active} onChange={(event) => onActive(category.name, event.target.checked)} /><span /></label></div></div>{expanded === category.name && <div className="subcategory-list">{category.children.map((child, childIndex) => <div className="subcategory-row" key={child}><span>{child}</span><small>Order {childIndex + 1}</small></div>)}<form onSubmit={(event) => { event.preventDefault(); onAddSubcategory(category.name); }}><input aria-label={`Add subcategory to ${category.name}`} placeholder="Add subcategory" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} /><button type="submit" className="text-button">＋ Add subcategory</button></form></div>}</section>)}</div><p className="security-footnote"><span>ⓘ</span> Category edits are currently stored in local browser configuration; connect a persistent category API for multi-admin production use.</p></div>;
}

function UsersView({ users, onRole }) {
  return <div className="view-stack"><section className="panel user-admin-note"><span>♙</span><div><strong>Directory integration is in preview</strong><p>Production user identity and role assignments should be synchronized from Microsoft Entra ID or an approved identity provider.</p></div><button className="button-secondary" disabled>Invite user</button></section><section className="panel table-panel"><div className="panel-heading"><div><h2>Workspace members</h2><p>{users.filter((user) => user.status === "Active").length} active members</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>PERSON</th><th>DEPARTMENT</th><th>ROLE</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="user-cell"><span className="profile-avatar">{user.name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div></td><td>{user.department}</td><td><select value={user.role} onChange={(event) => onRole(user.id, event.target.value)}><option>Admin</option><option>Editor</option><option>Employee</option><option>HR reviewer</option></select></td><td><span className={`status-badge status-${user.status.toLowerCase()}`}><i />{user.status}</span></td><td><button className="text-button" onClick={() => window.alert("Access policy management requires identity-provider integration.")}>View access →</button></td></tr>)}</tbody></table></div></section></div>;
}

function AuditView({ events }) {
  const items = events.length ? events : [];
  return <div className="view-stack"><section className="audit-summary"><span className="audit-icon">◷</span><div><strong>Immutable activity history</strong><p>Admin document changes are written to the backend audit log. Demo records are shown when no live audit events are available.</p></div><span className="mode-chip">RETENTION · 90 DAYS</span></section><section className="panel table-panel"><div className="panel-heading"><div><h2>Recent events</h2><p>Uploads, access changes, deletions, and review actions</p></div><button className="button-secondary" onClick={() => window.alert("CSV export is available when connected to the audit export service.")}>Export log ↓</button></div><div className="audit-timeline">{items.length ? items.map((item) => <div className="audit-row" key={item.id}><span className="audit-node" /><div><strong>{item.action}</strong><small>{item.actor} · {item.target || item.detail || `${item.object_type} ${item.object_id || ""}`}</small></div><time>{item.time || formattedDate(item.created_at)}</time></div>) : <p className="empty-state">No live audit events returned. Admin audit API is available at /documents/admin/audit-logs.</p>}</div></section></div>;
}

function SavedView({ answers, onRemove }) {
  return <div className="view-stack">{answers.length === 0 ? <section className="panel empty-saved"><span>☆</span><h2>No saved answers yet</h2><p>Save useful answers from the Knowledge assistant to keep them handy.</p></section> : answers.map((item) => <article className="panel saved-answer-card" key={item.id}><div className="saved-answer-heading"><span className="eyebrow">{item.category}</span><button className="text-button danger-text" onClick={() => onRemove(item.id)}>Remove ×</button></div><h2>{item.question}</h2><ReactMarkdown>{item.answer}</ReactMarkdown><small>{item.sources?.length || 0} citations saved</small></article>)}</div>;
}

function DocumentEditModal({ document: item, onClose, onSave }) {
  const [title, setTitle] = useState(item.title || item.filename);
  return <div className="modal-backdrop"><section className="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="edit-document-title"><div className="modal-header"><div><p className="eyebrow">DOCUMENT DETAILS</p><h2 id="edit-document-title">Edit document</h2></div><button className="icon-button" aria-label="Close editor" onClick={onClose}>×</button></div><label className="edit-title-field">Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><p className="muted-copy">Category, department, tags, confidentiality, and access group can be managed from the upload metadata flow.</p><div className="modal-actions"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" onClick={() => onSave(title)}>Save changes</button></div></section></div>;
}

export default App;
