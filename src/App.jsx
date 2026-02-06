import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

// const API_BASE = "/api";
const API_BASE = import.meta.env.VITE_API_BASE || "https://rapid-email-verifier.fly.dev/api";

function normalizeEmail(value) {
  if (value == null) return "";
  return String(value).trim();
}

function statusBadgeClass(status) {
  switch (status) {
    case "VALID":
      return "pill pill-valid";
    case "INVALID":
      return "pill pill-invalid";
    case "RISKY":
      return "pill pill-risky";
    default:
      return "pill";
  }
}

export default function App() {
  // Single
  const [singleEmail, setSingleEmail] = useState("");
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleResult, setSingleResult] = useState(null);
  const [singleError, setSingleError] = useState("");

  // Batch
  const [fileName, setFileName] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchSummary, setBatchSummary] = useState(null);
  const [downloadBlobUrl, setDownloadBlobUrl] = useState("");

  const canDownload = useMemo(() => Boolean(downloadBlobUrl), [downloadBlobUrl]);

  async function validateSingle(e) {
    e.preventDefault();
    setSingleError("");
    setSingleResult(null);

    const email = normalizeEmail(singleEmail);
    if (!email) {
      setSingleError("Please enter an email address.");
      return;
    }

    setSingleLoading(true);
    try {
      const url = `${API_BASE}/validate?email=${encodeURIComponent(email)}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setSingleResult(data);
    } catch (err) {
      setSingleError(err?.message || "Something went wrong.");
    } finally {
      setSingleLoading(false);
    }
  }

  function cleanupOldDownloadUrl() {
    if (downloadBlobUrl) URL.revokeObjectURL(downloadBlobUrl);
    setDownloadBlobUrl("");
  }

  async function onUploadExcel(ev) {
    setBatchError("");
    setBatchSummary(null);
    cleanupOldDownloadUrl();

    const file = ev.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    let workbook;
    try {
      const arrayBuffer = await file.arrayBuffer();
      workbook = XLSX.read(arrayBuffer, { type: "array" });
    } catch {
      setBatchError("Could not read the file. Please upload a valid Excel (.xlsx/.xls).");
      return;
    }

    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
      setBatchError("No sheets found in the uploaded file.");
      return;
    }

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (!rows.length) {
      setBatchError("The sheet is empty.");
      return;
    }

    const headerRow = rows[0].map((h) => String(h).trim());
    let emailColIndex = headerRow.findIndex((h) => h.toLowerCase() === "email");
    if (emailColIndex === -1) emailColIndex = headerRow.findIndex((h) => h.toLowerCase().includes("email"));
    if (emailColIndex === -1) emailColIndex = 0;

    const dataRows = rows.slice(1);
    const emails = dataRows.map((r) => normalizeEmail(r[emailColIndex])).filter(Boolean);
    const uniqueEmails = Array.from(new Set(emails));

    if (!uniqueEmails.length) {
      setBatchError("No emails found in the sheet.");
      return;
    }

    setBatchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/validate/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "*/*" },
        body: JSON.stringify({ emails: uniqueEmails }),
      });

      if (!res.ok) throw new Error(`Batch request failed (${res.status})`);

      const data = await res.json();
      const results = data?.results || [];
      const byEmail = new Map(results.map((r) => [normalizeEmail(r.email), r]));

      const outHeader = [...headerRow, "Validation Status", "Score"];
      const outRows = [outHeader];

      let validCount = 0;
      let invalidCount = 0;
      let otherCount = 0;

      for (const r of dataRows) {
        const email = normalizeEmail(r[emailColIndex]);
        const hit = email ? byEmail.get(email) : null;
        const status = hit?.status || (email ? "UNKNOWN" : "");
        const score = hit?.score ?? "";

        if (status === "VALID") validCount++;
        else if (status === "INVALID") invalidCount++;
        else if (status) otherCount++;

        outRows.push([...r, status, score]);
      }

      const outWs = XLSX.utils.aoa_to_sheet(outRows);
      const outWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(outWb, outWs, "Validated");

      const outArrayBuffer = XLSX.write(outWb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([outArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      setDownloadBlobUrl(url);

      setBatchSummary({
        totalRows: dataRows.length,
        uniqueEmails: uniqueEmails.length,
        validCount,
        invalidCount,
        otherCount,
        emailColumnUsed: headerRow[emailColIndex] || `(Column ${emailColIndex + 1})`,
      });
    } catch (err) {
      setBatchError(err?.message || "Batch validation failed.");
    } finally {
      setBatchLoading(false);
    }
  }

  function downloadExcel() {
    if (!downloadBlobUrl) return;
    const a = document.createElement("a");
    a.href = downloadBlobUrl;
    a.download = "validated_emails.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="page">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          {/* ✅ IMPORTANT: logo in /public => src="/minematics.png" */}
          <img className="logo" src="/minematics.png" alt="Minematics"/>
          <div className="brandText">
            <div className="appTitle">Email Validator</div>
            <div className="appSubtitle">Validate single emails or upload Excel for batch validation.</div>
          </div>
        </div>
      </header>

      {/* Center content */}
      <main className="main">
        <div className="cards">
          {/* Single */}
          <section className="card">
            <div className="cardHead">
              <h2>Single Email Validation</h2>
              {singleResult?.status && (
                <span className={statusBadgeClass(singleResult.status)}>{singleResult.status}</span>
              )}
            </div>

            <form className="formRow" onSubmit={validateSingle}>
              <input
                className="input"
                type="email"
                placeholder="Enter email (e.g., name@gmail.com)"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
              />
              <button className="btn" type="submit" disabled={singleLoading}>
                {singleLoading ? "Validating..." : "Validate"}
              </button>
            </form>

            {singleError && <div className="alert alertError">{singleError}</div>}

            {singleResult && (
              <div className="details">
                <div className="detailRow">
                  <span className="label">Email</span>
                  <span className="value mono">{singleResult.email}</span>
                </div>
                <div className="detailRow">
                  <span className="label">Score</span>
                  <span className="value mono">{singleResult.score}</span>
                </div>

                <div className="miniGrid">
                  <div className="mini">
                    <div className="miniLabel">Syntax</div>
                    <div className="miniValue">{String(singleResult?.validations?.syntax)}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Domain</div>
                    <div className="miniValue">{String(singleResult?.validations?.domain_exists)}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">MX</div>
                    <div className="miniValue">{String(singleResult?.validations?.mx_records)}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Mailbox</div>
                    <div className="miniValue">{String(singleResult?.validations?.mailbox_exists)}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Disposable</div>
                    <div className="miniValue">{String(singleResult?.validations?.is_disposable)}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Role-based</div>
                    <div className="miniValue">{String(singleResult?.validations?.is_role_based)}</div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Batch */}
          <section className="card">
            <div className="cardHead">
              <h2>Batch Validation via Excel Upload</h2>
              {batchLoading ? <span className="pill">RUNNING</span> : batchSummary ? <span className="pill">READY</span> : null}
            </div>

            <p className="help">
              Upload an Excel file (.xlsx/.xls). The app searches for a column named <b>Email</b>. If not found, it uses
              the first column.
            </p>

            <div className="formRow">
              <label className="fileWrap">
                <input className="file" type="file" accept=".xlsx,.xls" onChange={onUploadExcel} />
                <span className="fileBtn">Choose File</span>
                <span className="fileName">{fileName || "No file chosen"}</span>
              </label>

              <button className="btn btnSecondary" onClick={downloadExcel} disabled={!canDownload}>
                Download Result
              </button>
            </div>

            {batchError && <div className="alert alertError">{batchError}</div>}
            {batchLoading && <div className="alert">Validating emails from your sheet…</div>}

            {batchSummary && (
              <div className="details">
                <div className="detailRow">
                  <span className="label">Email column used</span>
                  <span className="value mono">{batchSummary.emailColumnUsed}</span>
                </div>

                <div className="miniGrid">
                  <div className="mini">
                    <div className="miniLabel">Rows</div>
                    <div className="miniValue">{batchSummary.totalRows}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Unique</div>
                    <div className="miniValue">{batchSummary.uniqueEmails}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">VALID</div>
                    <div className="miniValue">{batchSummary.validCount}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">INVALID</div>
                    <div className="miniValue">{batchSummary.invalidCount}</div>
                  </div>
                  <div className="mini">
                    <div className="miniLabel">Other</div>
                    <div className="miniValue">{batchSummary.otherCount}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="footer">
        <span>Powered by Rapid Email Verifier</span>
      </footer>
    </div>
  );
}
