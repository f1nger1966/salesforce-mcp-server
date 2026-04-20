# Salesforce MCP Server

Custom MCP server for 8x8 AI Studio ↔ Salesforce CRM integration.
Exposes **12 tools** via HTTP + SSE transport.

**Org:** `https://d6a0000002fgdua2-dev-ed.my.salesforce.com`
**Auth to server:** Bearer token (`MCP_API_KEY` env var — value `8x8-sf-mcp-2026`)
**Auth to Salesforce:** SOAP Partner login (auto-refreshes on session expiry)
**Live endpoint:** `https://salesforce-mcp-server-xftl.onrender.com/mcp`

---

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/mcp` | POST | MCP Streamable HTTP — **primary, used by AI Studio** |
| `/sse` | GET | MCP SSE (legacy clients only) |
| `/messages?sessionId=<id>` | POST | Legacy SSE message channel |
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

## Tool Set C — Demo Store Locator

Organised under `DEMO_STORES` in `server.js`. Add new demo customer brands as additional keys (e.g. `DEMO_STORES.acme`). Each entry stores lat/lon so distance is calculated without additional API calls to geocoding services — only the **caller's** location is geocoded at runtime via Nominatim (OpenStreetMap, no API key required).

| Tool | Description | Key Parameters | Returns |
|---|---|---|---|
| `findGallsStore` | Find nearest Galls retail stores by caller zip code, city/state, or address. Uses Haversine formula for distance. | `location` (zip/city/address), `limit` (default 3, max 5) | Up to 3 nearest stores with name, full address, phone, **hours**, distance in miles |

### Galls Store Data (20 locations, 17 states)

| # | Store | Address | Phone | Hours |
|---|---|---|---|---|
| 1 | Galls Lexington | 1300 Russell Cave Rd, Lexington, KY 40505 | (859) 787-0420 | Mon-Fri 9am-6pm, Sat 9am-1:30pm, Sun Closed |
| 2 | Galls Los Angeles | 2543 W 6th St, Los Angeles, CA 90057 | (213) 351-9632 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 3 | Galls San Francisco | 2200 Jerrold Ave Unit J, San Francisco, CA 94124 | (415) 647-7077 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 4 | Galls Riverside | 1865 Iowa Ave, Riverside, CA 92507 | (951) 781-6366 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 5 | Galls Albany | 230 Central Ave, Albany, NY 12206 | (518) 434-1376 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 6 | Galls Richmond | 2124 Tomlynn St, Richmond, VA 23230 | (804) 355-4455 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 7 | Galls Houston | 1314 Houston Ave, Houston, TX 77007 | (713) 222-0765 | Mon-Fri 7am-4pm, Sat-Sun Closed |
| 8 | Galls Des Moines | 5801 Thornton Ave, Des Moines, IA 50321 | (515) 283-1985 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 9 | Galls Minneapolis | 2220 Lyndale Ave S, Minneapolis, MN 55405 | (612) 377-0011 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 10 | Galls Columbus | 3889 Business Park Dr, Columbus, OH 43204 | (614) 351-1566 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 11 | Galls Oak Creek | 500 E Oak St, Oak Creek, WI 53154 | (414) 762-7300 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 12 | Galls Grand Prairie | 2636 W Pioneer Pkwy, Grand Prairie, TX 75051 | (972) 641-4400 | Mon-Fri 8:30am-5pm, Sat-Sun Closed |
| 13 | Galls Atlanta | 1794 Cheshire Bridge Rd NE, Atlanta, GA 30324 | (404) 873-0381 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 14 | Galls Orlando | 2516 N Orange Blossom Trail, Orlando, FL 32804 | (407) 425-0755 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 15 | Galls Phoenix | 2201 E University Dr, Phoenix, AZ 85034 | (602) 275-8500 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 16 | Galls Denver | 1391 N Federal Blvd, Denver, CO 80204 | (303) 893-2211 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 17 | Galls Kansas City | 10328 Metcalf Ave, Overland Park, KS 66212 | (913) 381-3200 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 18 | Galls Nashville | 2608 Nolensville Pike, Nashville, TN 37211 | (615) 832-0557 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 19 | Galls Charlotte | 4730 Old Pineville Rd, Charlotte, NC 28217 | (704) 523-0655 | Mon-Fri 9am-5pm, Sat-Sun Closed |
| 20 | Galls Chicago | 4647 W 47th St, Chicago, IL 60632 | (773) 254-1100 | Mon-Fri 9am-5pm, Sat-Sun Closed |

---

## Tool Set D — Uniform Inventory (1 tool, added 2026-04-20)

Inventory is stored as JSON in the `Description` field of Salesforce `Product2` records using the prefix `INVENTORY:`. The tool queries live Salesforce data — no hardcoded values in server code.

| Tool | Description | Key Parameters | Returns |
|---|---|---|---|
| `getUniformInventory` | Look up uniform/gear stock levels showing online qty and per-store qty for each location. | `category` (optional: Pants/Shirts/Jackets/Footwear/Duty Gear), `sku` (optional) | Products with `onlineStock`, `storeStock[]` per location, `totalStoreStock` |

### Products in Salesforce (Product2) — created 2026-04-20

| SKU | Product Name | Category | Online | Lexington KY | Key Store Stock |
|---|---|---|---|---|---|
| GL-TFP-M | Galls Pro Men's Tac Force Tactical Pants | Pants | 38 | **0** | Charlotte 14, Houston 11, Chicago 9, Atlanta 8 |
| GL-BDU-6P | Galls 6-Pocket BDU Ripstop Pants | Pants | 52 | 16 | Houston 14, LA 12, Chicago 9 |
| GL-CA-LS | Galls Men's Class A Long Sleeve Security Shirt | Shirts | 65 | 20 | LA 18, Chicago 14, Atlanta 11 |
| GL-CB-SS | Galls Men's Class B Short Sleeve Security Shirt | Shirts | 78 | 24 | Houston 16, Minneapolis 12, Charlotte 10 |
| LP-WB-SEC | LawPro Security Windbreaker | Jackets | 29 | 8 | Chicago 11, Orlando 9, Phoenix 7 |
| GL-SSH-JKT | Galls Security Softshell Jacket | Jackets | 31 | 7 | Albany 9, Des Moines 8, SF 6 |
| MR-MOAB2-TRB | Merrell MOAB 2 Tactical Response Boot | Footwear | 43 | 11 | LA 15, Nashville 10, Columbus 8 |
| BT-8TSB-M | Bates Men's 8-Inch Tactical Sport Boot | Footwear | 35 | 9 | Chicago 13, Houston 8, Richmond 7 |
| BL-GDB-5R | Boston Leather Garrison Duty Belt | Duty Gear | 58 | 15 | Charlotte 12, LA 11, Denver 9 |
| SF-ALS-OT | Safariland ALS Open Top Duty Holster | Duty Gear | 44 | 13 | Columbus 9, Richmond 8, Minneapolis 7 |

**Tac Force Pants demo note (for Catie Garvis / Galls scenario):** Lexington has zero stock — agent should direct caller to nearest stocked store or online ordering.

### Inventory data format (in Product2.Description)

```
INVENTORY:{"online":38,"Charlotte NC":14,"Chicago IL":9,"Houston TX":11}
```

To update stock levels: update the `Description` field of the Product2 record via Salesforce UI or `update_record` MCP tool. No server code changes needed.

---

### Adding a new demo customer's stores

In `server.js`, add a new key under `DEMO_STORES` and a corresponding tool + handler:

```js
const DEMO_STORES = {
  galls: [ /* existing */ ],
  acme:  [ { name: "Acme NYC", address: "...", city: "New York", state: "NY", zip: "10001", phone: "...", lat: 40.7128, lon: -74.0060 } ],
};
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

## Deployment — Render.com (current)

Free tier web service. Sleeps after 15 min inactivity, wakes on first call (~30s cold start).

| Setting | Value |
|---|---|
| GitHub repo | `https://github.com/f1nger1966/salesforce-mcp-server` |
| Branch | `main` |
| Build command | `npm install` |
| Start command | `node server.js` |
| Node version | 22 |
| Auto-deploy | On commit |

Set all env vars under **Environment** in the Render dashboard.

---

## Deployment — Vibe8 via Rancher (planned)

Files: `Dockerfile` and `platform.yaml` in repo root — ready but not yet deployed.

### Build & push the Docker image

```bash
# Build
docker build -t salesforce-mcp-server:latest .

# Tag for Rancher registry
docker tag salesforce-mcp-server:latest <RANCHER_REGISTRY>/8x8-demos/salesforce-mcp-server:latest

# Push
docker push <RANCHER_REGISTRY>/8x8-demos/salesforce-mcp-server:latest
```

Replace `<RANCHER_REGISTRY>` with your Rancher registry hostname before running.

### platform.yaml secrets to configure in Vibe8

| Secret name | Value |
|---|---|
| `SF_USERNAME` | `alton2020@8x8.com` |
| `SF_PASSWORD` | Salesforce password |
| `SF_SECURITY_TOKEN` | Salesforce security token |
| `MCP_API_KEY` | `8x8-sf-mcp-2026` |

### After deploying to Vibe8

Update the AI Studio MCP Connector URL from:
`https://salesforce-mcp-server-xftl.onrender.com/mcp`
to the Vibe8-assigned hostname — bearer token remains the same.

**Advantage over Render free tier:** No cold-start spin-down; always-on service.
