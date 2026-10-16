import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = "http://localhost:8000";

const basicAuthHeader = ({ username, password }) =>
  `Basic ${btoa(`${username}:${password}`)}`;

function App() {
  const [documents, setDocuments] = useState([]);
  const [view, setView] = useState("ask");
  const [adminCredentials, setAdminCredentials] = useState(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [selectedDocument, setSelectedDocument] = useState(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const [deletingId, setDeletingId] = useState(null);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents`);
      const data = await response.json();

      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/documents`)
      .then((response) => response.json())
      .then((data) => {
        if (active) setDocuments(data.documents || []);
      })
      .catch((error) => console.error("Failed to fetch documents:", error));
    return () => {
      active = false;
    };
  }, []);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setAdminError("");

    const credentials = {
      username: adminUsername,
      password: adminPassword,
    };

    try {
      const response = await fetch(`${API_URL}/documents/admin/verify`, {
        headers: { Authorization: basicAuthHeader(credentials) },
      });
      if (!response.ok) {
        setAdminError("Admin username or password is incorrect.");
        return;
      }
      setAdminCredentials(credentials);
      setAdminPassword("");
    } catch (error) {
      console.error("Admin login error:", error);
      setAdminError("Could not reach the server. Try again.");
    }
  };

  const handleAdminLogout = () => {
    setAdminCredentials(null);
    setAdminPassword("");
    setSelectedFile(null);
    setMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Choose a PDF, TXT, or DOC file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setUploading(true);
      setMessage("");

      const response = await fetch(
        `${API_URL}/documents/upload`,
        {
          method: "POST",
          headers: {
            Authorization: basicAuthHeader(adminCredentials),
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.detail || "Upload failed.");
        return;
      }

      setMessage("Document uploaded successfully.");
      setSelectedFile(null);

      await fetchDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      setMessage("Something went wrong while uploading.");
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async () => {
    if (!selectedDocument) {
      setAskError("Please select a document first.");
      return;
    }

    if (!question.trim()) {
      setAskError("Please enter a question.");
      return;
    }

    try {
      setAsking(true);
      setAskError("");
      setAnswer("");
      setSources([]);

      const response = await fetch(
        `${API_URL}/documents/${selectedDocument.id}/ask`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: question.trim(),
            top_k: 3,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setAskError(data.detail || "Failed to get an answer.");
        return;
      }

      setAnswer(data.answer || "");
      setSources(data.sources || []);
    } catch (error) {
      console.error("Question error:", error);
      setAskError(
        "Something went wrong while asking the question."
      );
    } finally {
      setAsking(false);
    }
  };

  const handleDelete = async (document, event) => {
    event.stopPropagation();

    const confirmed = window.confirm(
      `Delete "${document.filename}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(document.id);
      setMessage("");

      const response = await fetch(
        `${API_URL}/documents/${document.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: basicAuthHeader(adminCredentials),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          data.detail || "Failed to delete document."
        );
        return;
      }

      if (selectedDocument?.id === document.id) {
        setSelectedDocument(null);
        setQuestion("");
        setAnswer("");
        setSources([]);
        setAskError("");
      }

      setMessage("Document deleted successfully.");

      await fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      setMessage(
        "Something went wrong while deleting the document."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectDocument = (document) => {
    setSelectedDocument(document);
    setQuestion("");
    setAnswer("");
    setSources([]);
    setAskError("");
  };

  return (
    <div className="app">
      <header className="portal-header">
        <div>
          <p className="eyebrow">DOCUMENT INTELLIGENCE</p>
          <h1>DocuQuery</h1>
          <p>Search and ask questions across your team’s documents.</p>
        </div>
        {adminCredentials && view === "admin" && (
          <button className="signout-button" onClick={handleAdminLogout}>
            Sign out
          </button>
        )}
      </header>

      <nav className="portal-tabs" aria-label="Portal views">
        <button
          className={view === "ask" ? "active-tab" : ""}
          onClick={() => setView("ask")}
        >
          Ask documents
        </button>
        <button
          className={view === "admin" ? "active-tab" : ""}
          onClick={() => setView("admin")}
        >
          Admin portal
        </button>
      </nav>

      {view === "ask" ? (
        <>
          <section className="portal-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">KNOWLEDGE BASE</p>
                <h2>Choose a document</h2>
              </div>
              <button className="refresh-button" onClick={fetchDocuments}>
                Refresh list
              </button>
            </div>

            {documents.length === 0 ? (
              <p className="empty-state">No documents have been added yet.</p>
            ) : (
              <div className="documents">
                {documents.map((document) => (
                  <button
                    className={`document-item ${selectedDocument?.id === document.id ? "selected-document" : ""}`}
                    key={document.id}
                    onClick={() => handleSelectDocument(document)}
                  >
                    <span className="file-type">{document.filename.split(".").pop().toUpperCase()}</span>
                    <span className="document-copy">
                      <strong>{document.filename}</strong>
                      <small>Document #{document.id}</small>
                    </span>
                    <span className="document-arrow" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedDocument && (
            <section className="portal-section query-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ASK THE LIBRARY</p>
                  <h2>{selectedDocument.filename}</h2>
                </div>
              </div>
              <div className="question-area">
                <textarea
                  placeholder="Ask a question about this document..."
                  value={question}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    setAskError("");
                  }}
                  rows={4}
                />
                <button onClick={handleAsk} disabled={asking}>
                  {asking ? "Thinking..." : "Ask question"}
                </button>
              </div>
              {askError && <p className="error-message">{askError}</p>}
              {answer && (
                <div className="answer-section">
                  <h3>Answer</h3>
                  <div className="answer-text"><ReactMarkdown>{answer}</ReactMarkdown></div>
                </div>
              )}
              {sources.length > 0 && (
                <div className="sources-section">
                  <h3>Sources</h3>
                  {sources.map((source) => (
                    <details className="source-item" key={`${source.source}-${source.chunk_index}`}>
                      <summary>
                        <strong>Source {source.source}</strong>
                        <span>Similarity: {source.similarity}</span>
                      </summary>
                      <p>{source.content}</p>
                    </details>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          {!adminCredentials ? (
            <section className="portal-section admin-login">
              <p className="eyebrow">RESTRICTED ACCESS</p>
              <h2>Admin sign in</h2>
              <form onSubmit={handleAdminLogin}>
                <label>
                  Username
                  <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" required />
                </label>
                <label>
                  Password
                  <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" required />
                </label>
                {adminError && <p className="error-message">{adminError}</p>}
                <button type="submit">Sign in</button>
              </form>
            </section>
          ) : (
            <>
              <section className="portal-section admin-upload">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">ADMINISTRATOR</p>
                    <h2>Add to the library</h2>
                  </div>
                </div>
                <p className="supporting-copy">Upload a PDF, plain-text TXT, or legacy Word DOC file. Each upload is indexed for search.</p>
                <input
                  type="file"
                  accept=".pdf,.txt,.doc,application/pdf,text/plain,application/msword"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] || null);
                    setMessage("");
                  }}
                />
                {selectedFile && <p className="selected-file">Selected: {selectedFile.name}</p>}
                <button onClick={handleUpload} disabled={uploading || !selectedFile}>
                  {uploading ? "Indexing document..." : "Upload and index"}
                </button>
                {message && <p className="message">{message}</p>}
              </section>

              <section className="portal-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">LIBRARY CONTROLS</p>
                    <h2>Manage documents</h2>
                  </div>
                  <button className="refresh-button" onClick={fetchDocuments}>Refresh list</button>
                </div>
                {documents.length === 0 ? (
                  <p className="empty-state">No documents have been added yet.</p>
                ) : (
                  <div className="documents">
                    {documents.map((document) => (
                      <div className="document-item admin-document" key={document.id}>
                        <span className="file-type">{document.filename.split(".").pop().toUpperCase()}</span>
                        <span className="document-copy">
                          <strong>{document.filename}</strong>
                          <small>Document #{document.id}</small>
                        </span>
                        <button className="delete-button" onClick={(event) => handleDelete(document, event)} disabled={deletingId === document.id}>
                          {deletingId === document.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {message && <p className="message">{message}</p>}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;