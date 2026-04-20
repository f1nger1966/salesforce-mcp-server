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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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

// ── C) Demo Store Locator ────────────────────────────────────────────────────
// Add new demo customers here as additional keys under DEMO_STORES.

const DEMO_STORES = {
  galls: [
    { name: "Galls Lexington",    address: "1300 Russell Cave Rd",             city: "Lexington",    state: "KY", zip: "40505", phone: "(859) 787-0420", lat: 38.0712, lon: -84.4584 },
    { name: "Galls Los Angeles",  address: "2543 W 6th St",                    city: "Los Angeles",  state: "CA", zip: "90057", phone: "(213) 351-9632", lat: 34.0574, lon: -118.2785 },
    { name: "Galls San Francisco",address: "2200 Jerrold Ave, Unit J",         city: "San Francisco",state: "CA", zip: "94124", phone: "(415) 647-7077", lat: 37.7393, lon: -122.3938 },
    { name: "Galls Riverside",    address: "1865 Iowa Ave",                    city: "Riverside",    state: "CA", zip: "92507", phone: "(951) 781-6366", lat: 33.9806, lon: -117.3755 },
    { name: "Galls Albany",       address: "230 Central Ave",                  city: "Albany",       state: "NY", zip: "12206", phone: "(518) 434-1376", lat: 42.6560, lon: -73.7695 },
    { name: "Galls Richmond",     address: "2124 Tomlynn St",                  city: "Richmond",     state: "VA", zip: "23230", phone: "(804) 355-4455", lat: 37.5726, lon: -77.4769 },
    { name: "Galls Houston",      address: "1314 Houston Ave",                 city: "Houston",      state: "TX", zip: "77007", phone: "(713) 222-0765", lat: 29.7725, lon: -95.3878 },
    { name: "Galls Des Moines",   address: "5801 Thornton Ave",                city: "Des Moines",   state: "IA", zip: "50321", phone: "(515) 283-1985", lat: 41.5516, lon: -93.6535 },
    { name: "Galls Minneapolis",  address: "2220 Lyndale Ave S",               city: "Minneapolis",  state: "MN", zip: "55405", phone: "(612) 377-0011", lat: 44.9582, lon: -93.2920 },
    { name: "Galls Columbus",     address: "3889 Business Park Dr",            city: "Columbus",     state: "OH", zip: "43204", phone: "(614) 351-1566", lat: 39.9658, lon: -83.0878 },
    { name: "Galls Oak Creek",    address: "500 E Oak St",                     city: "Oak Creek",    state: "WI", zip: "53154", phone: "(414) 762-7300", lat: 42.8848, lon: -87.8594 },
    { name: "Galls Grand Prairie",address: "2636 W Pioneer Pkwy",              city: "Grand Prairie",state: "TX", zip: "75051", phone: "(972) 641-4400", lat: 32.7459, lon: -97.0281 },
    { name: "Galls Atlanta",      address: "1794 Cheshire Bridge Rd NE",       city: "Atlanta",      state: "GA", zip: "30324", phone: "(404) 873-0381", lat: 33.8134, lon: -84.3574 },
    { name: "Galls Orlando",      address: "2516 N Orange Blossom Trail",      city: "Orlando",      state: "FL", zip: "32804", phone: "(407) 425-0755", lat: 28.5611, lon: -81.4012 },
    { name: "Galls Phoenix",      address: "2201 E University Dr",             city: "Phoenix",      state: "AZ", zip: "85034", phone: "(602) 275-8500", lat: 33.4235, lon: -111.9974 },
    { name: "Galls Denver",       address: "1391 N Federal Blvd",              city: "Denver",       state: "CO", zip: "80204", phone: "(303) 893-2211", lat: 39.7426, lon: -105.0185 },
    { name: "Galls Kansas City",  address: "10328 Metcalf Ave",                city: "Overland Park",state: "KS", zip: "66212", phone: "(913) 381-3200", lat: 38.9458, lon: -94.6687 },
    { name: "Galls Nashville",    address: "2608 Nolensville Pike",            city: "Nashville",    state: "TN", zip: "37211", phone: "(615) 832-0557", lat: 36.0904, lon: -86.7529 },
    { name: "Galls Charlotte",    address: "4730 Old Pineville Rd",            city: "Charlotte",    state: "NC", zip: "28217", phone: "(704) 523-0655", lat: 35.1688, lon: -80.8854 },
    { name: "Galls Chicago",      address: "4647 W 47th St",                   city: "Chicago",      state: "IL", zip: "60632", phone: "(773) 254-1100", lat: 41.8081, lon: -87.7406 },
  ],
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function geocodeLocation(location) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&countrycodes=us`;
  const resp = await fetch(url, { headers: { "User-Agent": "salesforce-mcp-server/1.0" } });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function tool_find_galls_store({ location, limit }) {
  const stores = DEMO_STORES.galls;
  const maxResults = Math.min(limit || 3, stores.length);

  // Try geocoding first
  let coords = await geocodeLocation(location);

  // Fallback: match by state abbreviation or city name from the query
  if (!coords) {
    const q = location.trim().toUpperCase();
    const byState = stores.filter(s => s.state === q || s.state === q.replace(/[^A-Z]/g, ""));
    if (byState.length) {
      return {
        found: true,
        query: location,
        geocoded: false,
        note: `Could not geocode — showing ${byState.length} store(s) in ${q}`,
        stores: byState.map(s => ({
          name: s.name,
          address: `${s.address}, ${s.city}, ${s.state} ${s.zip}`,
          phone: s.phone,
          distanceMiles: null,
        })),
      };
    }
    return { found: false, query: location, message: "Could not locate that address or zip code. Please try a zip code or city, state." };
  }

  const sorted = stores
    .map(s => ({ ...s, distanceMiles: parseFloat(haversineDistance(coords.lat, coords.lon, s.lat, s.lon).toFixed(1)) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, maxResults);

  return {
    found: true,
    query: location,
    geocoded: true,
    stores: sorted.map(s => ({
      name: s.name,
      address: `${s.address}, ${s.city}, ${s.state} ${s.zip}`,
      phone: s.phone,
      distanceMiles: s.distanceMiles,
    })),
  };
}

// ── MCP Server Builder ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "query_records",
    description: "Execute a SOQL query against Salesforce and return matching records. Use for any data retrieval including contacts, accounts, opportunities, cases, and custom objects.",
    inputSchema: {
      type: "object",
      properties: {
        soql:  { type: "string", description: "Full SOQL query, e.g. SELECT Id, Name FROM Account WHERE Industry = 'Finance'" },
        limit: { type: "integer", minimum: 1, maximum: 2000, description: "Max records to return if LIMIT not already in query" },
      },
      required: ["soql"],
    },
  },
  {
    name: "get_record_by_id",
    description: "Fetch a single Salesforce record by its ID. Returns all or specified fields.",
    inputSchema: {
      type: "object",
      properties: {
        sobject: { type: "string", description: "Salesforce object API name, e.g. Account, Contact, Case, Opportunity" },
        id:      { type: "string", description: "Salesforce record ID, e.g. 001Kg00000DVlN4IAL" },
        fields:  { type: "array", items: { type: "string" }, description: "Field API names to return. If omitted, returns all fields." },
      },
      required: ["sobject", "id"],
    },
  },
  {
    name: "search_records",
    description: "Full-text SOSL search across Salesforce objects. Use when you have a name or keyword but not a specific ID or field value.",
    inputSchema: {
      type: "object",
      properties: {
        searchTerm: { type: "string", description: "Text to search for, e.g. 'Tony Stark' or 'Fantastic Finance'" },
        sobjects:   { type: "array", items: { type: "string" }, description: "Objects to search in, e.g. ['Contact','Account']. Defaults to Contact + Account." },
        fields:     { type: "array", items: { type: "string" }, description: "Fields to return per object. Defaults to Id, Name." },
        limit:      { type: "integer", minimum: 1, maximum: 200, default: 10, description: "Max results per object" },
      },
      required: ["searchTerm"],
    },
  },
  {
    name: "create_record",
    description: "Create a new record in any Salesforce object. Returns the new record ID.",
    inputSchema: {
      type: "object",
      properties: {
        sobject: { type: "string", description: "Salesforce object API name, e.g. Case, Contact, Opportunity" },
        fields:  { type: "object", description: "Field API names and values, e.g. {\"Subject\": \"Login issue\", \"Status\": \"New\"}", additionalProperties: true },
      },
      required: ["sobject", "fields"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing Salesforce record by ID.",
    inputSchema: {
      type: "object",
      properties: {
        sobject: { type: "string", description: "Salesforce object API name" },
        id:      { type: "string", description: "Salesforce record ID" },
        fields:  { type: "object", description: "Fields to update with new values", additionalProperties: true },
      },
      required: ["sobject", "id", "fields"],
    },
  },
  {
    name: "describe_object",
    description: "Get field metadata (names, types, labels) for any Salesforce object. Use to discover available fields before querying.",
    inputSchema: {
      type: "object",
      properties: {
        sobject: { type: "string", description: "Salesforce object API name, e.g. Contact, Account, Case" },
      },
      required: ["sobject"],
    },
  },
  {
    name: "ContactLookupByPhone",
    description: "Look up a CRM Contact and their Account by phone number (CLI). Returns contact details, account info, and all custom fields (insurance, KYC, prescription, etc.). Primary tool for caller screen-pop on inbound calls.",
    inputSchema: {
      type: "object",
      properties: {
        phoneNumber: { type: "string", description: "Caller phone number, e.g. +15144469113 or +441135550501" },
      },
      required: ["phoneNumber"],
    },
  },
  {
    name: "GetAccountSummary",
    description: "Retrieve full account details including open opportunities (count, total pipeline value, list) and open cases for a given Salesforce Account ID.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Salesforce Account ID, e.g. 001Kg00000DVlN4IAL" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "GetOpenOpportunities",
    description: "List all open (not closed) Opportunities for a Salesforce Account, with name, stage, amount, and close date.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Salesforce Account ID" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "CreateCaseFromCall",
    description: "Create a new Salesforce Case with Status=New and Origin=Phone, linked to an Account and optionally a Contact. Use this to log a support case from an inbound call.",
    inputSchema: {
      type: "object",
      properties: {
        subject:     { type: "string", description: "Case subject / title" },
        description: { type: "string", description: "Detailed description of the issue" },
        accountId:   { type: "string", description: "Salesforce Account ID" },
        contactId:   { type: "string", description: "Salesforce Contact ID" },
        priority:    { type: "string", enum: ["High", "Medium", "Low"], default: "Medium", description: "Case priority" },
      },
      required: ["subject"],
    },
  },

  // ── Galls Store Locator ──
  {
    name: "findGallsStore",
    description: "Find the nearest Galls retail store locations given a zip code, city/state, or address. Returns up to 3 closest stores with name, address, phone, and distance in miles. Use this when a Galls customer asks about the nearest store location.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Caller's location — zip code (e.g. '40505'), city and state (e.g. 'Louisville, KY'), or full address" },
        limit:    { type: "integer", minimum: 1, maximum: 5, default: 3, description: "Number of nearest stores to return (default 3)" },
      },
      required: ["location"],
    },
  },
];

const TOOL_HANDLERS = {
  query_records:        tool_query_records,
  get_record_by_id:     tool_get_record_by_id,
  search_records:       tool_search_records,
  create_record:        tool_create_record,
  update_record:        tool_update_record,
  describe_object:      tool_describe_object,
  ContactLookupByPhone: tool_contact_lookup_by_phone,
  GetAccountSummary:    tool_get_account_summary,
  GetOpenOpportunities: tool_get_open_opportunities,
  CreateCaseFromCall:   tool_create_case_from_call,
  findGallsStore:       tool_find_galls_store,
};

function buildMcpServer() {
  const server = new Server(
    { name: "salesforce-crm", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      const result = await handler(args || {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  });

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
    generic:  ["query_records", "get_record_by_id", "search_records", "create_record", "update_record", "describe_object"],
    crm:      ["ContactLookupByPhone", "GetAccountSummary", "GetOpenOpportunities", "CreateCaseFromCall"],
    stores:   { galls: ["findGallsStore"] },
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
