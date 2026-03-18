# Salesforce MCP Server

Custom MCP server for 8x8 AI Studio ↔ Salesforce CRM integration.
Exposes **10 tools** via HTTP + SSE transport.

**Org:** `https://d6a0000002fgdua2-dev-ed.my.salesforce.com`
**Auth to server:** Bearer token (`MCP_API_KEY` env var)
**Auth to Salesforce:** SOAP Partner login (auto-refreshes on session expiry)

---

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/sse` | GET | MCP SSE connection (AI Studio connects here) |
| `/messages?sessionId=<id>` | POST | MCP message channel |
| `/health` | GET | Status check — no auth required |

---

## Tool Set A — Generic SObject Tools

These mirror the functionality of Salesforce's standard `sobject-reads` and `sobject-mutations` MCP servers.

| Tool | Description | Key Parameters |
|---|---|---|
| `query_records` | Execute any SOQL query and return matching records. Use for any data retrieval — contacts, accounts, opportunities, cases, custom objects. | `soql` (string), `limit` (int, optional) |
| `get_record_by_id` | Fetch a single record by its Salesforce ID. Returns all fields or a specified subset. | `sobject`, `id`, `fields` (array, optional) |
| `search_records` | Full-text SOSL search across Salesforce objects. Use when you have a name or keyword but not a specific ID. | `searchTerm`, `sobjects` (optional), `fields` (optional), `limit` (optional) |
| `create_record` | Create a new record in any Salesforce object. Returns the new record ID. | `sobject`, `fields` (object of field→value pairs) |
| `update_record` | Update an existing record by Salesforce ID. | `sobject`, `id`, `fields` (fields to update) |
| `describe_object` | Get field metadata (names, types, labels) for any Salesforce object. Use to discover available fields before querying. | `sobject` |

### Example — `query_records`
```json
{
  "soql": "SELECT Id, FirstName, LastName, Phone FROM Contact WHERE Phone = '+15144469113' LIMIT 1"
}
```

### Example — `create_record`
```json
{
  "sobject": "Case",
  "fields": {
    "Subject": "Login issue reported on call",
    "Status": "New",
    "Origin": "Phone",
    "Priority": "High",
    "AccountId": "001Kg00000DVlN4IAL"
  }
}
```

---

## Tool Set B — Purpose-Built CRM Tools

Optimised for the voice/call-centre screen-pop use case. Return structured data with a pre-built summary string for the AI.

| Tool | Description | Key Parameters | Returns |
|---|---|---|---|
| `ContactLookupByPhone` | Look up a Contact and their Account by phone number (CLI). Checks Phone, MobilePhone, and HomePhone fields. Primary screen-pop tool for inbound calls. | `phoneNumber` (e.g. `+15144469113`) | Contact details, account info, all custom fields, `summary` string |
| `GetAccountSummary` | Full account overview — details, open opportunity pipeline (count + total value), and open cases. | `accountId` | Account fields, `openOpportunities`, `openCases`, `summary` string |
| `GetOpenOpportunities` | List all open (not closed) Opportunities for an account with stage, amount, and close date. | `accountId` | Count, total value, opportunity list |
| `CreateCaseFromCall` | Create a new Case with `Status=New`, `Origin=Phone`, linked to an account and/or contact. | `subject`, `description` (opt), `accountId` (opt), `contactId` (opt), `priority` (High/Medium/Low) | `caseId`, `caseNumber`, confirmation message |

### Example — `ContactLookupByPhone`
```json
{ "phoneNumber": "+15144469113" }
```
Returns:
```json
{
  "found": true,
  "fullName": "Tony Stark",
  "title": "CFO",
  "accountName": "Fantastic Finance",
  "accountIndustry": "Finance",
  "kycVerified": true,
  "summary": "Tony Stark (CFO) · Account: Fantastic Finance | Finance · Email: ... · KYC: Verified"
}
```

### Example — `CreateCaseFromCall`
```json
{
  "subject": "Account statement discrepancy",
  "description": "Caller reports March statement shows incorrect balance",
  "accountId": "001Kg00000DVlN4IAL",
  "contactId": "003Kg00000A8k06IAB",
  "priority": "Medium"
}
```

---

## Test Phone Numbers

| Phone | Contact | Account |
|---|---|---|
| `+15144469113` | Tony Stark | Fantastic Finance |
| `+15147718726` | Bruce Banner (Phone) or Tony Stark (Mobile) | Marvelous Healthcare / FF |
| `+15149876543` | Thor Odinson | Happy Hour Beverages |
| `+441135550501` | Vision Maximoff | Vision Specs |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SF_USERNAME` | ✅ | Salesforce username (`alton2020@8x8.com`) |
| `SF_PASSWORD` | ✅ | Salesforce password |
| `SF_SECURITY_TOKEN` | ✅ | Salesforce security token |
| `MCP_API_KEY` | Recommended | Bearer token AI Studio sends to authenticate. If unset, no auth check. |
| `PORT` | Optional | HTTP port (default `3001`) |

---

## AI Studio MCP Connector Setup

| Field | Value |
|---|---|
| **Connector name** | `salesforce-crm` |
| **URL** | `https://<render-app-name>.onrender.com/sse` |
| **Auth type** | Bearer token |
| **Token** | Value of `MCP_API_KEY` |

After adding, click **Sync Tools** — all 10 tools should appear.

---

## Deployment (Render.com)

Free tier web service. Sleeps after 15 min inactivity, wakes on first call (~30s cold start).

Build command: `npm install`
Start command: `node server.js`
Node version: 22

Set all env vars under Environment in the Render dashboard.
