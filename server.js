/**
 * Salesforce MCP Server — 8x8 AI Studio Demo
 *
 * Two toolsets in one server:
 *
 * A) Generic SObject tools (like Salesforce's sobject-reads + sobject-mutations):
 *    - query_records       SOQL query, returns records
 *    - get_record_by_id    Fetch single record by Salesforce ID
 *    - search_records      SOSL full-text search
 *    - create_record       Create any SObject record
 *    - update_record       Update any SObject record by ID
 *    - describe_object     Get field metadata for any SObject
 *
 * B) Purpose-built CRM tools (screen-pop / call handling):
 *    - ContactLookupByPhone   Screen-pop by CLI number
 *    - GetAccountSummary      Account + open opps + open cases
 *    - GetOpenOpportunities   List open opps for an account
 *    - CreateCaseFromCall     Create Case linked to account/contact
 *
 * Transport: HTTP + SSE (compatible with 8x8 AI Studio MCP Connectors)
 * Auth:      Optional Bearer token (set MCP_API_KEY env var)
 *
 * Required env vars:
 *   SF_USERNAME          alton2020@8x8.com
 *   SF_PASSWORD          Salesforce password
 *   SF_SECURITY_TOKEN    Salesforce security token
 *   MCP_API_KEY          Static bearer token for AI Studio auth (optional)
 *   PORT                 HTTP port (default 3001)
 */

import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ── Salesforce Auth ──────────────────────────────────────────────────────────

let sfSession = null;

async function sfLogin() {
  const u = process.env.SF_USERNAME;
  const p = process.env.SF_PASSWORD;
  const t = process.env.SF_SECURITY_TOKEN;
  if (!u || !p || !t) throw new Error("SF_USERNAME / SF_PASSWORD / SF_SECURITY_TOKEN required");

  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body><urn:login>
    <urn:username>${u}</urn:username>
    <urn:password>${p}${t}</urn:password>
  </urn:login></soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch("https://login.salesforce.com/services/Soap/u/62.0", {
    method: "POST",
    headers: { "Content-Type": "text/xml", "SOAPAction": "login" },
    body: soap,
  });
  const text = await resp.text();
  if (text.includes("<faultcode>")) {
    const msg = text.match(/<faultstring>(.*?)<\/faultstring>/)?.[1] || "Login failed";
    throw new Error(`SF login: ${msg}`);
  }
  const sessionId = text.match(/<sessionId>(.*?)<\/sessionId>/)?.[1];
  const serverUrl = text.match(/<serverUrl>(.*?)<\/serverUrl>/)?.[1];
  const instance  = serverUrl?.match(/https:\/\/[^/]+/)?.[0];
  if (!sessionId || !instance) throw new Error("Could not parse SF login response");
  sfSession = { sessionId, instance };
  console.log(`[SF] Authenticated → ${instance}`);
  return sfSession;
}

async function sfHeaders() {
  if (!sfSession) await sfLogin();
  return { Authorization: `Bearer ${sfSession.sessionId}`, "Content-Type": "application/json" };
}

async function sfFetch(path, options = {}) {
  let headers = await sfHeaders();
  const url = `${sfSession.instance}${path}`;
  let resp = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (resp.status === 401) {
    sfSession = null;
    headers = await sfHeaders();
    resp = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  }
  return resp;
}

async function sfQuery(soql) {
  const resp = await sfFetch(`/services/data/v62.0/query?q=${encodeURIComponent(soql)}`);
  if (!resp.ok) throw new Error(`SOQL failed (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  return { records: data.records ?? [], totalSize: data.totalSize ?? 0, done: data.done };
}

async function sfCreate(sobject, body) {
  const resp = await sfFetch(`/services/data/v62.0/sobjects/${sobject}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Create ${sobject} failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

async function sfUpdate(sobject, id, body) {
  const resp = await sfFetch(`/services/data/v62.0/sobjects/${sobject}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (resp.status !== 204 && !resp.ok)
    throw new Error(`Update ${sobject}/${id} failed (${resp.status}): ${await resp.text()}`);
  return { success: true, id };
}

async function sfDescribe(sobject) {
  const resp = await sfFetch(`/services/data/v62.0/sobjects/${sobject}/describe`);
  if (!resp.ok) throw new Error(`Describe ${sobject} failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

// ── A) Generic SObject Tools ─────────────────────────────────────────────────

async function tool_query_records({ soql, limit }) {
  const safeSoql = limit && !soql.toUpperCase().includes(" LIMIT ")
    ? `${soql} LIMIT ${limit}`
    : soql;
  const result = await sfQuery(safeSoql);
  return { totalSize: result.totalSize, done: result.done, records: result.records };
}

async function tool_get_record_by_id({ sobject, id, fields }) {
  const fieldList = fields?.length ? fields.join(",") : null;
  const path = `/services/data/v62.0/sobjects/${sobject}/${id}${fieldList ? `?fields=${fieldList}` : ""}`;
  const resp = await sfFetch(path);
  if (!resp.ok) throw new Error(`Get ${sobject}/${id} failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

async function tool_search_records({ searchTerm, sobjects, fields, limit }) {
  const inClause = sobjects?.length
    ? sobjects.map(s => `FIND {${searchTerm}} IN ALL FIELDS RETURNING ${s}(${(fields || ["Id","Name"]).join(",")} LIMIT ${limit || 10})`).join(" ")
    : `FIND {${searchTerm}} IN ALL FIELDS RETURNING Contact(Id,FirstName,LastName,Phone,MobilePhone LIMIT ${limit || 10}), Account(Id,Name,Phone LIMIT ${limit || 10})`;

  const sosl = sobjects?.length
    ? `FIND {${searchTerm}} IN ALL FIELDS RETURNING ${sobjects.map(s => `${s}(${(fields || ["Id","Name"]).join(",")} LIMIT ${limit || 10})`).join(", ")}`
    : `FIND {${searchTerm}} IN ALL FIELDS RETURNING Contact(Id,FirstName,LastName,Phone,MobilePhone LIMIT ${limit || 10}), Account(Id,Name,Phone LIMIT ${limit || 10})`;

  const resp = await sfFetch(`/services/data/v62.0/search?q=${encodeURIComponent(sosl)}`);
  if (!resp.ok) throw new Error(`Search failed (${resp.status}): ${await resp.text()}`);
  return await resp.json();
}

async function tool_create_record({ sobject, fields }) {
  const result = await sfCreate(sobject, fields);
  return { success: result.success, id: result.id, sobject };
}

async function tool_update_record({ sobject, id, fields }) {
  return await sfUpdate(sobject, id, fields);
}

async function tool_describe_object({ sobject }) {
  const desc = await sfDescribe(sobject);
  return {
    name: desc.name,
    label: desc.label,
    fields: desc.fields.map(f => ({
      name: f.name,
      label: f.label,
      type: f.type,
      length: f.length || null,
      required: !f.nillable,
      updateable: f.updateable,
    })),
    recordTypeInfos: desc.recordTypeInfos?.map(r => ({ name: r.name, id: r.recordTypeId })),
  };
}

// ── B) Purpose-Built CRM Tools ───────────────────────────────────────────────

async function tool_contact_lookup_by_phone({ phoneNumber }) {
  const phone = phoneNumber.trim();
  const { records } = await sfQuery(`
    SELECT Id, FirstName, LastName, Title, Phone, MobilePhone, HomePhone, Email,
           Insurance_Member_ID__c, Insurance_Plan__c, Last_Appointment_Date__c,
           KYC_Verified__c, Prescription_Reference__c, Last_Eye_Exam_Date__c, Preferred_Store__c,
           Account.Id, Account.Name, Account.Phone, Account.Website,
           Account.AccountNumber, Account.AnnualRevenue, Account.Description, Account.Industry
    FROM Contact
    WHERE Phone = '${phone}' OR MobilePhone = '${phone}' OR HomePhone = '${phone}'
    LIMIT 1`);

  if (!records.length) return { found: false, message: `No CRM record found for ${phone}.` };
  const c = records[0];
  const acc = c.Account || {};

  const parts = [`${c.FirstName} ${c.LastName}${c.Title ? ` (${c.Title})` : ""}`];
  if (acc.Name) parts.push(`Account: ${acc.Name}${acc.Industry ? ` | ${acc.Industry}` : ""}`);
  if (c.Email)  parts.push(`Email: ${c.Email}`);
  const custom = [
    c.Insurance_Member_ID__c    && `Insurance ID: ${c.Insurance_Member_ID__c}`,
    c.Insurance_Plan__c         && `Plan: ${c.Insurance_Plan__c}`,
    c.Last_Appointment_Date__c  && `Last Appt: ${c.Last_Appointment_Date__c}`,
    c.KYC_Verified__c === true  && "KYC: Verified",
    c.Prescription_Reference__c && `Rx: ${c.Prescription_Reference__c}`,
    c.Last_Eye_Exam_Date__c     && `Eye Exam: ${c.Last_Eye_Exam_Date__c}`,
    c.Preferred_Store__c        && `Store: ${c.Preferred_Store__c}`,
  ].filter(Boolean);
  if (custom.length) parts.push(custom.join(" | "));

  return {
    found: true,
    contactId: c.Id, firstName: c.FirstName, lastName: c.LastName,
    fullName: `${c.FirstName} ${c.LastName}`, title: c.Title || null,
    phone: c.Phone || null, mobile: c.MobilePhone || null, email: c.Email || null,
    accountId: acc.Id || null, accountName: acc.Name || null,
    accountIndustry: acc.Industry || null, accountPhone: acc.Phone || null,
    accountAnnualRevenue: acc.AnnualRevenue || null,
    insuranceMemberId: c.Insurance_Member_ID__c || null,
    insurancePlan: c.Insurance_Plan__c || null,
    lastAppointmentDate: c.Last_Appointment_Date__c || null,
    kycVerified: c.KYC_Verified__c ?? null,
    prescriptionReference: c.Prescription_Reference__c || null,
    lastEyeExamDate: c.Last_Eye_Exam_Date__c || null,
    preferredStore: c.Preferred_Store__c || null,
    summary: parts.join(" · "),
  };
}

async function tool_get_account_summary({ accountId }) {
  const { records } = await sfQuery(`
    SELECT Id, Name, Phone, Website, AccountNumber, AnnualRevenue, Industry, Description,
           BillingCity, BillingCountry,
      (SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunities
       WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 20),
      (SELECT Id, Subject, Status, Priority FROM Cases
       WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 10)
    FROM Account WHERE Id = '${accountId}' LIMIT 1`);

  if (!records.length) return { found: false, message: `Account ${accountId} not found.` };
  const a = records[0];
  const opps  = a.Opportunities?.records || [];
  const cases = a.Cases?.records || [];
  const openOppValue = opps.reduce((s, o) => s + (o.Amount || 0), 0);

  return {
    found: true, accountId: a.Id, name: a.Name,
    phone: a.Phone || null, website: a.Website || null,
    accountNumber: a.AccountNumber || null, annualRevenue: a.AnnualRevenue || null,
    industry: a.Industry || null, description: a.Description || null,
    openOpportunities: {
      count: opps.length, totalValue: openOppValue,
      items: opps.map(o => ({ id: o.Id, name: o.Name, stage: o.StageName, amount: o.Amount, closeDate: o.CloseDate })),
    },
    openCases: {
      count: cases.length,
      items: cases.map(c => ({ id: c.Id, subject: c.Subject, status: c.Status, priority: c.Priority })),
    },
    summary: `${a.Name} | ${a.Industry || "—"} | ${opps.length} open opps ($${openOppValue.toLocaleString()}) | ${cases.length} open cases`,
  };
}

async function tool_get_open_opportunities({ accountId }) {
  const { records } = await sfQuery(`
    SELECT Id, Name, StageName, Amount, CloseDate, Description
    FROM Opportunity WHERE AccountId = '${accountId}' AND IsClosed = false
    ORDER BY CloseDate ASC`);
  return {
    accountId, count: records.length,
    totalValue: records.reduce((s, o) => s + (o.Amount || 0), 0),
    opportunities: records.map(o => ({
      id: o.Id, name: o.Name, stage: o.StageName,
      amount: o.Amount || null, closeDate: o.CloseDate, description: o.Description || null,
    })),
  };
}

async function tool_create_case_from_call({ subject, description, accountId, contactId, priority }) {
  const body = { Subject: subject, Description: description || "", Status: "New", Origin: "Phone", Priority: priority || "Medium" };
  if (accountId) body.AccountId = accountId;
  if (contactId) body.ContactId = contactId;
  const result = await sfCreate("Case", body);
  const { records } = await sfQuery(`SELECT Id, CaseNumber, Subject, Status FROM Case WHERE Id = '${result.id}' LIMIT 1`);
  const c = records[0] || {};
  return {
    success: true, caseId: result.id, caseNumber: c.CaseNumber || null,
    subject: c.Subject || subject, status: c.Status || "New",
    message: `Case ${c.CaseNumber || result.id} created successfully.`,
  };
}

// ── MCP Server Builder ───────────────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: "salesforce-crm", version: "1.0.0" });

  // ── A) Generic SObject Tools ──

  server.tool("query_records",
    "Execute a SOQL query against Salesforce and return matching records. Use for any data retrieval including contacts, accounts, opportunities, cases, and custom objects.",
    {
      soql:  z.string().describe("Full SOQL query, e.g. SELECT Id, Name FROM Account WHERE Industry = 'Finance'"),
      limit: z.number().int().min(1).max(2000).optional().describe("Max records to return if LIMIT not already in query (default: no limit added)"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_query_records(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("get_record_by_id",
    "Fetch a single Salesforce record by its ID. Returns all or specified fields.",
    {
      sobject: z.string().describe("Salesforce object API name, e.g. Account, Contact, Case, Opportunity"),
      id:      z.string().describe("Salesforce record ID, e.g. 001Kg00000DVlN4IAL"),
      fields:  z.array(z.string()).optional().describe("List of field API names to return. If omitted, returns all fields."),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_get_record_by_id(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("search_records",
    "Full-text SOSL search across Salesforce objects. Use when you have a name or keyword but not a specific ID or field value.",
    {
      searchTerm: z.string().describe("Text to search for, e.g. 'Tony Stark' or 'Fantastic Finance'"),
      sobjects:   z.array(z.string()).optional().describe("Objects to search in, e.g. ['Contact','Account']. Defaults to Contact + Account."),
      fields:     z.array(z.string()).optional().describe("Fields to return per object. Defaults to Id, Name."),
      limit:      z.number().int().min(1).max(200).optional().default(10).describe("Max results per object"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_search_records(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("create_record",
    "Create a new record in any Salesforce object. Returns the new record ID.",
    {
      sobject: z.string().describe("Salesforce object API name, e.g. Case, Contact, Opportunity"),
      fields:  z.record(z.unknown()).describe("Field API names and values, e.g. {\"Subject\": \"Login issue\", \"Status\": \"New\"}"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_create_record(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("update_record",
    "Update an existing Salesforce record by ID.",
    {
      sobject: z.string().describe("Salesforce object API name"),
      id:      z.string().describe("Salesforce record ID"),
      fields:  z.record(z.unknown()).describe("Fields to update with new values"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_update_record(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("describe_object",
    "Get field metadata (names, types, labels) for any Salesforce object. Use to discover available fields before querying.",
    {
      sobject: z.string().describe("Salesforce object API name, e.g. Contact, Account, Case"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_describe_object(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  // ── B) Purpose-Built CRM Tools ──

  server.tool("ContactLookupByPhone",
    "Look up a CRM Contact and their Account by phone number (CLI). Returns contact details, account info, and all custom fields (insurance, KYC, prescription, etc.). Primary tool for caller screen-pop on inbound calls.",
    { phoneNumber: z.string().describe("Caller phone number, e.g. +15144469113 or +441135550501") },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_contact_lookup_by_phone(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("GetAccountSummary",
    "Retrieve full account details including open opportunities (count, total pipeline value, list) and open cases for a given Salesforce Account ID.",
    { accountId: z.string().describe("Salesforce Account ID, e.g. 001Kg00000DVlN4IAL") },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_get_account_summary(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("GetOpenOpportunities",
    "List all open (not closed) Opportunities for a Salesforce Account, with name, stage, amount, and close date.",
    { accountId: z.string().describe("Salesforce Account ID") },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_get_open_opportunities(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  server.tool("CreateCaseFromCall",
    "Create a new Salesforce Case with Status=New and Origin=Phone, linked to an Account and optionally a Contact. Use this to log a support case from an inbound call.",
    {
      subject:     z.string().describe("Case subject / title"),
      description: z.string().optional().describe("Detailed description of the issue"),
      accountId:   z.string().optional().describe("Salesforce Account ID"),
      contactId:   z.string().optional().describe("Salesforce Contact ID"),
      priority:    z.enum(["High", "Medium", "Low"]).optional().default("Medium"),
    },
    async (args) => {
      try { return { content: [{ type: "text", text: JSON.stringify(await tool_create_case_from_call(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
    }
  );

  return server;
}

// ── Express + Transports ─────────────────────────────────────────────────────

const app     = express();
const PORT    = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.MCP_API_KEY;

function checkAuth(req, res, next) {
  if (!API_KEY) return next();
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Streamable HTTP transport (AI Studio / modern MCP clients) ──
// Single endpoint: POST /mcp  (also handles GET for SSE streaming)
const httpSessions = new Map(); // sessionId → { transport, server }

app.all("/mcp", checkAuth, express.json(), async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];

    if (req.method === "POST" && !sessionId) {
      // New session — stateful mode
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          httpSessions.set(id, { transport, server: mcpServerInstance });
          console.log(`[HTTP] Session created: ${id}`);
        },
      });
      const mcpServerInstance = buildMcpServer();
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) { httpSessions.delete(id); console.log(`[HTTP] Session closed: ${id}`); }
      };
      await mcpServerInstance.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId && httpSessions.has(sessionId)) {
      const { transport } = httpSessions.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // No matching session
    res.status(400).json({ error: "Invalid or missing session ID" });
  } catch (e) {
    console.error("[HTTP] Error:", e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Legacy SSE transport (older MCP clients) ──
const sseTransports = new Map();

app.get("/sse", checkAuth, async (req, res) => {
  console.log(`[SSE] Connect from ${req.ip}`);
  const transport = new SSEServerTransport("/messages", res);
  const server = buildMcpServer();
  sseTransports.set(transport.sessionId, transport);
  res.on("close", () => {
    console.log(`[SSE] Disconnect: ${transport.sessionId}`);
    sseTransports.delete(transport.sessionId);
  });
  await server.connect(transport);
});

app.post("/messages", checkAuth, express.json(), async (req, res) => {
  const transport = sseTransports.get(req.query.sessionId);
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handlePostMessage(req, res, req.body);
});

// ── Health ──
app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "salesforce-mcp-server",
  sfConnected: !!sfSession,
  sfInstance: sfSession?.instance || null,
  transports: ["streamable-http (POST /mcp)", "sse (GET /sse)"],
  tools: {
    generic: ["query_records", "get_record_by_id", "search_records", "create_record", "update_record", "describe_object"],
    crm:     ["ContactLookupByPhone", "GetAccountSummary", "GetOpenOpportunities", "CreateCaseFromCall"],
  },
  timestamp: new Date().toISOString(),
}));

app.listen(PORT, async () => {
  console.log(`[MCP] Salesforce MCP Server on http://localhost:${PORT}`);
  console.log(`[MCP] Streamable HTTP : http://localhost:${PORT}/mcp  ← AI Studio uses this`);
  console.log(`[MCP] SSE (legacy)    : http://localhost:${PORT}/sse`);
  console.log(`[MCP] Health check    : http://localhost:${PORT}/health`);
  console.log(`[MCP] Tools           : 6 generic SObject + 4 CRM-specific`);
  try { await sfLogin(); }
  catch (e) { console.error(`[SF] Pre-auth failed: ${e.message}`); }
});
