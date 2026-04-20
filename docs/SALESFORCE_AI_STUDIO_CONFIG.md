# Salesforce CRM + 8x8 AI Studio Configuration

## Purpose
Set up the same demo database as the Creatio session (2026-03-13/16) in Salesforce, then
connect it to 8x8 AI Studio via an MCP Connector for a screen-pop / caller lookup use case.

---

## Salesforce Connection Details

| Setting | Value |
|---|---|
| **Instance (UI)** | `https://d6a0000002fgdua2-dev-ed.lightning.force.com/` |
| **API Base URL** | `https://d6a0000002fgdua2-dev-ed.my.salesforce.com` |
| **REST API Base** | `https://d6a0000002fgdua2-dev-ed.my.salesforce.com/services/data/v62.0` |
| **Username** | `alton2020@8x8.com` *(not a real email address — Salesforce username format)* |
| **Auth method** | SOAP Partner API login (no Connected App required) |

> Credentials (password + security token) stored as environment variables — never hardcoded.
> The effective API password is `<SF_PASSWORD><SF_SECURITY_TOKEN>` concatenated.

---

## Authentication — Recommended Method (SOAP Partner Login)

**Use this in all Claude Code scripts.** No Connected App setup required — works immediately with
admin credentials. Returns a `sessionId` that acts as a Bearer token for all subsequent REST calls.

```python
import requests, re, os

USERNAME = os.environ["SF_USERNAME"]          # alton2020@8x8.com
PASSWORD = os.environ["SF_PASSWORD"]          # password only
TOKEN    = os.environ["SF_SECURITY_TOKEN"]    # security token only

def sf_login():
    soap = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body><urn:login>
    <urn:username>{USERNAME}</urn:username>
    <urn:password>{PASSWORD}{TOKEN}</urn:password>
  </urn:login></soapenv:Body>
</soapenv:Envelope>"""
    resp = requests.post("https://login.salesforce.com/services/Soap/u/62.0",
        data=soap, headers={"Content-Type": "text/xml", "SOAPAction": "login"})
    session_id = re.search(r"<sessionId>(.*?)</sessionId>", resp.text).group(1)
    instance   = re.search(r"https://[^/]+",
                   re.search(r"<serverUrl>(.*?)</serverUrl>", resp.text).group(1)).group(0)
    meta_url   = re.search(r"<metadataServerUrl>(.*?)</metadataServerUrl>", resp.text).group(1)
    return session_id, instance, meta_url

SESSION_ID, INSTANCE, META_URL = sf_login()
HEADERS = {"Authorization": f"Bearer {SESSION_ID}", "Content-Type": "application/json"}
API     = f"{INSTANCE}/services/data/v62.0"
```

### REST API Helpers

```python
def sf_post(sobject, payload):
    r = requests.post(f"{API}/sobjects/{sobject}", headers=HEADERS, json=payload)
    if not r.ok: raise Exception(f"{r.status_code}: {r.text}")
    return r.json()   # {"id": "...", "success": true}

def sf_patch(sobject, record_id, payload):
    r = requests.patch(f"{API}/sobjects/{sobject}/{record_id}", headers=HEADERS, json=payload)
    if r.status_code not in (200, 204):
        raise Exception(f"PATCH {r.status_code}: {r.text}")
    return True

def sf_query(soql):
    r = requests.get(f"{API}/query", headers=HEADERS, params={"q": soql})
    if not r.ok: raise Exception(f"{r.status_code}: {r.text}")
    return r.json()["records"]
```

---

## Salesforce Object Mapping (Creatio → Salesforce)

| Creatio Entity | Salesforce Object | Notes |
|---|---|---|
| Account | Account | Direct equivalent |
| Contact | Contact | Direct equivalent |
| Order | Opportunity | Simpler than SF Order (which requires Pricebook setup) |
| Case | Case | Direct equivalent |
| Product | Product2 | Not yet created — would require Pricebook2 + PricebookEntry |

---

## Custom Fields on Contact — Deployed 2026-03-17

All 7 fields are **live** in the org. Created via Metadata SOAP API `createMetadata` + FLS deployed
via Profile metadata zip (see API Notes below for the full story).

| Field Label | API Name | Type | Contact | Value |
|---|---|---|---|---|
| Insurance Member ID | `Insurance_Member_ID__c` | Text(250) | Bruce Banner | `BCB-2847391` |
| Insurance Plan | `Insurance_Plan__c` | Text(250) | Bruce Banner | `BlueCross PPO Gold` |
| Last Appointment Date | `Last_Appointment_Date__c` | Date | Bruce Banner | `2025-11-14` |
| KYC Verified | `KYC_Verified__c` | Checkbox | Tony Stark | `true` |
| Prescription Reference | `Prescription_Reference__c` | Text(250) | Vision Maximoff | `VS-RX-2025-00441` |
| Last Eye Exam Date | `Last_Eye_Exam_Date__c` | Date | Vision Maximoff | `2025-09-22` |
| Preferred Store | `Preferred_Store__c` | Text(250) | Vision Maximoff | `Leeds City Centre` |

**FLS granted to:** System Administrator (Admin), Standard User, Custom: Marketing Profile,
Custom: Sales Profile, Custom: Support Profile.

---

## Demo Data — Record IDs (created 2026-03-17)

### Accounts

| Account | Salesforce ID |
|---|---|
| Fantastic Finance | `001Kg00000DVlN4IAL` |
| Happy Hour Beverages | `001Kg00000DVlN9IAL` |
| Marvelous Healthcare | `001Kg00000DVlNEIA1` |
| Vision Specs | `001Kg00000DVlNJIA1` |

### Contacts

| Contact | Account | Phone | Mobile | Email | Mailing Address | Salesforce ID |
|---|---|---|---|---|---|---|
| Tony Stark | Fantastic Finance | +15144469113 | — *(cleared)* | alton.harewood+TonySF@8x8.com | — | `003Kg00000A8k06IAB` |
| Bruce Banner | Marvelous Healthcare | +15147718726 | — | alton.harewood+BruceSF@8x8.com | 215 Woodland Ave, Lexington, KY 40508 | `003Kg00000A8k0BIAR` |
| Vision Maximoff | Vision Specs | +441135550501 | +441135550502 | alton.harewood+VisionSF@8x8.com | — | `003Kg00000A8k0GIAR` |
| Thor Odinson | Happy Hour Beverages | — | +15149876543 | alton.harewood+ThorSF@8x8.com | — | `003Kg00000A8k0LIAR` |

### Local Guard / Galls Demo Contact

| Contact | Account | Mobile | Title | Mailing Address | Salesforce ID |
|---|---|---|---|---|---|
| Catie Garvis | Local Guard | +15405393326 | Senior Procurement Officer | 750 New Circle Rd NE, Lexington, KY 40505 | `003Kg00000A8kSNIAZ` |

### Opportunities

**Open (March 2026) — 12 total, 3 per account**

| Account | Opportunity Name | Amount | Stage |
|---|---|---|---|
| Fantastic Finance | Portfolio Management Annual Fee | $12,500 | Negotiation/Review |
| Fantastic Finance | Wealth Advisory Retainer – Q1 2026 | $8,750 | Proposal/Price Quote |
| Fantastic Finance | Compliance Reporting Service Pack | $3,200 | Value Proposition |
| Happy Hour Beverages | Craft Lager Seasonal Batch – 500 cases | $4,800 | Negotiation/Review |
| Happy Hour Beverages | Premium Spirits Distribution Bundle | $7,200 | Proposal/Price Quote |
| Happy Hour Beverages | Point-of-Sale Display Materials | $950 | Value Proposition |
| Marvelous Healthcare | Diagnostic Imaging Service Contract | $18,500 | Negotiation/Review |
| Marvelous Healthcare | Telehealth Platform Licence – Q1 2026 | $6,400 | Proposal/Price Quote |
| Marvelous Healthcare | Medical Consumables Restocking Order | $2,100 | Value Proposition |
| Vision Specs | Progressive Lens Frames – Spring Collection | $3,600 | Negotiation/Review |
| Vision Specs | Contact Lens Subscription – 6-month supply | $1,850 | Proposal/Price Quote |
| Vision Specs | In-store Optical Equipment Maintenance Pack | $2,750 | Value Proposition |

**Billing History (Dec 2025 – Feb 2026) — 32 total, 8 per account**

Stage mapping: Paid/Delivered → `Closed Won` | Unpaid Overdue → `Needs Analysis` | Unpaid Upcoming → `Perception Analysis`
Payment and delivery detail stored in the `Description` field as `Payment: ... | Delivery: ... | POD: ...`

Per account: 6 × Closed Won + 1 × Needs Analysis (overdue, CloseDate 2026-02-28) + 1 × Perception Analysis (upcoming, CloseDate 2026-03-31)

### Cases

**Open — 4 total (Status: New)**

| Subject | Account | Contact | Priority |
|---|---|---|---|
| Account statement discrepancy – March 2026 | Fantastic Finance | Tony Stark | Medium |
| Delivery delay – March seasonal batch | Happy Hour Beverages | Thor Odinson | Medium |
| Telehealth platform login failure for clinical staff | Marvelous Healthcare | Bruce Banner | High |
| Incorrect prescription lens delivered – order correction required | Vision Specs | Vision Maximoff | Medium |

**Closed Historical — 12 total (Status: Closed, dated 2024)**

3 per account. Descriptions contain resolution details. All linked to primary contact of the account.

---

## Screen Pop — SOQL Lookup Query

```sql
SELECT
  Id, FirstName, LastName, Title, Phone, MobilePhone, Email,
  Insurance_Member_ID__c, Insurance_Plan__c, Last_Appointment_Date__c,
  KYC_Verified__c, Prescription_Reference__c, Last_Eye_Exam_Date__c, Preferred_Store__c,
  Account.Name, Account.Phone, Account.Website, Account.AccountNumber,
  Account.AnnualRevenue, Account.Description, Account.Industry
FROM Contact
WHERE Phone = '{CLI}'
   OR MobilePhone = '{CLI}'
   OR HomePhone = '{CLI}'
LIMIT 1
```

### Python lookup function

```python
def lookup_contact_by_phone(phone_number):
    soql = f"""
        SELECT Id, FirstName, LastName, Title, Phone, MobilePhone, Email,
               Insurance_Member_ID__c, Insurance_Plan__c, Last_Appointment_Date__c,
               KYC_Verified__c, Prescription_Reference__c, Last_Eye_Exam_Date__c, Preferred_Store__c,
               Account.Name, Account.Phone, Account.Website, Account.AccountNumber,
               Account.AnnualRevenue, Account.Description
        FROM Contact
        WHERE Phone = '{phone_number}' OR MobilePhone = '{phone_number}'
        LIMIT 1
    """
    records = sf_query(soql)
    if not records:
        return "No CRM record found for this caller."
    c = records[0]
    return {
        "name":           f"{c['FirstName']} {c['LastName']}",
        "title":          c.get("Title"),
        "phone":          c.get("Phone"),
        "mobile":         c.get("MobilePhone"),
        "email":          c.get("Email"),
        "account":        c.get("Account", {}).get("Name"),
        # custom fields — only surface if populated
        "insurance_id":   c.get("Insurance_Member_ID__c") or None,
        "insurance_plan": c.get("Insurance_Plan__c") or None,
        "last_appointment":c.get("Last_Appointment_Date__c") or None,
        "kyc_verified":   c.get("KYC_Verified__c") or None,
        "prescription":   c.get("Prescription_Reference__c") or None,
        "last_eye_exam":  c.get("Last_Eye_Exam_Date__c") or None,
        "preferred_store":c.get("Preferred_Store__c") or None,
    }
```

### Test Phone Numbers

| Phone | Contact | Account |
|---|---|---|
| `+15147718726` | Bruce Banner (Phone) or Tony Stark (Mobile) | Marvelous Healthcare / Fantastic Finance |
| `+15144469113` | Tony Stark (Phone) | Fantastic Finance |
| `+15149876543` | Thor Odinson (Mobile) | Happy Hour Beverages |
| `+441135550501` | Vision Maximoff (Phone) | Vision Specs |

---

## API Notes — Issues Encountered & Best Paths for Claude Code

### Authentication — SOAP Partner Login is the right approach

**Use `https://login.salesforce.com/services/Soap/u/62.0`** with username + `password+token` concatenated.
Returns a `sessionId` that works as a Bearer token on all REST API calls. The response also returns
`serverUrl` (for the REST API instance) and `metadataServerUrl` (for Metadata SOAP API) — extract
all three at login time and store them for the session.

- No Connected App, OAuth client ID/secret, or pre-configuration needed
- Works immediately for any org where you have admin credentials
- Session is valid for the org's configured session timeout (typically 2 hours)
- The `metadataServerUrl` from the login response is the endpoint for all Metadata API SOAP calls

### DML (create/update/delete records) — REST API works cleanly

`POST /services/data/v62.0/sobjects/<Object>` is reliable for Account, Contact, Opportunity, Case.
No issues encountered. Standard fields work without any setup.

### Custom Fields — Three-step process required

Creating custom fields via API in Salesforce is **not a single call**. There are three distinct APIs
involved, and using the wrong one creates fields in an unusable draft state.

#### ❌ What NOT to do — Tooling API direct POST

```python
# This looks right but creates fields in a non-deployable draft state
requests.post(f"{TOOLING}/sobjects/CustomField", headers=HEADERS, json={
    "FullName": "Contact.Insurance_Member_ID__c",
    "Metadata": {"type": "Text", "label": "Insurance Member ID", "length": 250}
})
```

The field appears in `listMetadata` and the Tooling API query but is **invisible to SOQL and
`describeSObject`**. It cannot be deleted via REST either (returns 400 cross-reference error).
Subsequent Metadata API deploys report `success=true` with `created=false, changed=false` — the
field exists in metadata but is permanently stuck in draft. The only way out is `deleteMetadata`
via SOAP.

#### ❌ What NOT to do — Metadata deploy zip without FLS

Even if you deploy field definitions correctly via a zip file, the fields remain invisible if you
haven't also granted Field-Level Security (FLS). Salesforce does NOT auto-grant FLS when fields
are created via API (it does in the UI). Fields without FLS are invisible to `describeSObject` and
SOQL returns `No such column` — which looks identical to the field not existing at all. This is
misleading.

#### ✅ The correct two-step approach

**Step 1 — Create each field synchronously via Metadata SOAP `createMetadata`:**

```python
def create_custom_field(meta_url, session_id, full_name, label, ftype, length=None):
    length_xml = f"<met:length>{length}</met:length>" if length else ""
    required_xml = "<met:required>false</met:required>" if ftype != "Checkbox" else ""
    unique_xml = "<met:unique>false</met:unique>" if ftype == "Text" else ""
    default_xml = "<met:defaultValue>false</met:defaultValue>" if ftype == "Checkbox" else ""

    soap = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header>
    <met:SessionHeader><met:sessionId>{session_id}</met:sessionId></met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:createMetadata>
      <met:metadata xsi:type="met:CustomField">
        <met:fullName>{full_name}</met:fullName>
        <met:label>{label}</met:label>
        <met:type>{ftype}</met:type>
        {length_xml}{required_xml}{unique_xml}{default_xml}
      </met:metadata>
    </met:createMetadata>
  </soapenv:Body>
</soapenv:Envelope>"""
    r = requests.post(meta_url, data=soap,
        headers={"Content-Type": "text/xml", "SOAPAction": "createMetadata"})
    success = re.search(r"<success>(.*?)</success>", r.text)
    err     = re.search(r"<message>(.*?)</message>", r.text)
    return success and success.group(1) == "true", err.group(1) if err else None
```

**Step 2 — Deploy a Profile metadata zip granting FLS for the new fields:**

```python
import base64, zipfile, io, time

def grant_fls_to_profiles(meta_url, session_id, fields, profiles=("Admin","Standard")):
    """Deploy a Profile zip granting read+edit FLS for the given field API names."""
    fls_entries = "\n".join(
        f"""    <fieldPermissions>
        <editable>true</editable>
        <field>{f}</field>
        <readable>true</readable>
    </fieldPermissions>""" for f in fields
    )
    profile_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
{fls_entries}
</Profile>"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        members = "\n".join(f"    <members>{p}</members>" for p in profiles)
        zf.writestr("package.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>{members}<name>Profile</name></types>
  <version>62.0</version>
</Package>""")
        for p in profiles:
            zf.writestr(f"profiles/{p}.profile", profile_xml)

    zip_b64 = base64.b64encode(buf.getvalue()).decode()
    deploy_soap = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader><met:sessionId>{session_id}</met:sessionId></met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:deploy>
      <met:ZipFile>{zip_b64}</met:ZipFile>
      <met:DeployOptions>
        <met:checkOnly>false</met:checkOnly>
        <met:ignoreWarnings>true</met:ignoreWarnings>
        <met:rollbackOnError>false</met:rollbackOnError>
        <met:runAllTests>false</met:runAllTests>
        <met:singlePackage>true</met:singlePackage>
      </met:DeployOptions>
    </met:deploy>
  </soapenv:Body>
</soapenv:Envelope>"""
    r = requests.post(meta_url, data=deploy_soap,
        headers={"Content-Type": "text/xml", "SOAPAction": "deploy"})
    deploy_id = re.search(r"<id>(.*?)</id>", r.text).group(1)

    # Poll until done
    check = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header><met:SessionHeader><met:sessionId>{session_id}</met:sessionId></met:SessionHeader></soapenv:Header>
  <soapenv:Body><met:checkDeployStatus>
    <met:asyncProcessId>{deploy_id}</met:asyncProcessId>
    <met:includeDetails>true</met:includeDetails>
  </met:checkDeployStatus></soapenv:Body>
</soapenv:Envelope>"""
    for _ in range(20):
        time.sleep(3)
        r = requests.post(meta_url, data=check,
            headers={"Content-Type": "text/xml", "SOAPAction": "checkDeployStatus"})
        if re.search(r"<done>true</done>", r.text):
            return "Succeeded" in r.text
    return False
```

#### Recovering from stuck draft fields (Tooling API leftovers)

If fields were previously created via the Tooling API and are stuck, delete them via Metadata SOAP
`deleteMetadata` before recreating:

```python
def delete_custom_fields(meta_url, session_id, full_names):
    members = "\n".join(f"      <met:fullNames>{f}</met:fullNames>" for f in full_names)
    soap = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader><met:sessionId>{session_id}</met:sessionId></met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:deleteMetadata>
      <met:type>CustomField</met:type>
{members}
    </met:deleteMetadata>
  </soapenv:Body>
</soapenv:Envelope>"""
    r = requests.post(meta_url, data=soap,
        headers={"Content-Type": "text/xml", "SOAPAction": "deleteMetadata"})
    return r.status_code == 200
```

> **Note:** REST DELETE on `/tooling/sobjects/CustomField/{id}` returns 400
> `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` for fields in draft state.
> The Metadata SOAP `deleteMetadata` is the only reliable way to remove them.

### Opportunity Stages — valid picklist values

Standard stages in this org (query via `describeSObject` if unsure):
`Prospecting`, `Qualification`, `Needs Analysis`, `Value Proposition`, `Id. Decision Makers`,
`Perception Analysis`, `Proposal/Price Quote`, `Negotiation/Review`, `Closed Won`, `Closed Lost`

There are no custom stages. For billing history demo purposes:
- **Paid / Delivered** → `Closed Won`
- **Unpaid overdue** → `Needs Analysis` + note in `Description`
- **Unpaid upcoming** → `Perception Analysis` + note in `Description`

### Page Layouts — Contact

4 layouts exist: `Contact Layout` (default), `Contact (Marketing) Layout`, `Contact (Sales) Layout`,
`Contact (Support) Layout`. No record types are configured — all contacts use the default layout.

Custom fields are not automatically added to layouts when created via API. They are accessible via
SOQL and the API immediately after FLS is granted, but will not appear in the UI until added to the
layout via Setup → Object Manager → Contact → Page Layouts. For the AI Studio demo this is not
required (only API access matters for the screen-pop tool).

---

## Custom MCP Server — Deployed on Render.com

Built 2026-03-18. Node.js ESM server with **12 tools** exposing the Salesforce org directly to AI Studio.

### Server Details

| Setting | Value |
|---|---|
| **GitHub repo** | `https://github.com/f1nger1966/salesforce-mcp-server` |
| **Render service** | `salesforce-mcp-server-xftl` (srv-d6tfn9qa214c73ci5fc0) |
| **Public URL** | `https://salesforce-mcp-server-xftl.onrender.com` |
| **MCP endpoint (AI Studio)** | `https://salesforce-mcp-server-xftl.onrender.com/mcp` |
| **MCP endpoint (legacy SSE)** | `https://salesforce-mcp-server-xftl.onrender.com/sse` |
| **Health check** | `https://salesforce-mcp-server-xftl.onrender.com/health` |
| **Auth header** | `Authorization: Bearer 8x8-sf-mcp-2026` |
| **Transport** | Streamable HTTP (`POST /mcp`) + SSE (`GET /sse`) |
| **Node version** | 22 |
| **Render tier** | Free (sleeps after 15 min inactivity, ~30s cold start) |

### Render Environment Variables

| Variable | Value |
|---|---|
| `SF_USERNAME` | `alton2020@8x8.com` |
| `SF_PASSWORD` | *(set in Render dashboard)* |
| `SF_SECURITY_TOKEN` | *(set in Render dashboard)* |
| `MCP_API_KEY` | `8x8-sf-mcp-2026` |

### Tool Set A — Generic SObject (6 tools)

| Tool | Description |
|---|---|
| `query_records` | Execute any SOQL query |
| `get_record_by_id` | Fetch a single record by Salesforce ID |
| `search_records` | Full-text SOSL search |
| `create_record` | Create a new record in any SObject |
| `update_record` | Update an existing record by ID |
| `describe_object` | Get field metadata for any SObject |

### Tool Set B — Purpose-Built CRM (4 tools)

| Tool | Description |
|---|---|
| `ContactLookupByPhone` | Look up Contact + Account by phone (CLI). Checks Phone, MobilePhone, HomePhone. Primary screen-pop tool. |
| `GetAccountSummary` | Full account overview — open opportunity pipeline + open cases |
| `GetOpenOpportunities` | List open Opportunities for an account with stage, amount, close date |
| `CreateCaseFromCall` | Create a new Case linked to account/contact with Status=New, Origin=Phone |

### Tool Set C — Demo Store Locator (1 tool, added 2026-04-20)

Hardcoded store data lives in `DEMO_STORES` in `server.js` — extensible by brand for future demo customers.

| Tool | Description |
|---|---|
| `findGallsStore` | Find nearest Galls retail stores by caller zip/city/address. Geocodes caller location via Nominatim, ranks by Haversine distance. Returns up to 3 stores with name, address, phone, hours, miles. |

Demo customer: **Galls** — 20 locations across 17 US states.
Triggered for: **Catie Garvis** (Galls demo scenario) and **Bruce Banner** (Marvelous Healthcare — also Lexington KY area).
Agent flow: caller asks for nearest store → agent asks for zip/city → calls `findGallsStore` → reads back nearest store + hours → offers to SMS details via `sendSMS`.

### Tool Set D — Uniform Inventory (1 tool, added 2026-04-20)

Inventory data lives in Salesforce `Product2.Description` as `INVENTORY:{...}` JSON. No hardcoded values in server code — update stock via SF UI or `update_record` tool.

| Tool | Description |
|---|---|
| `getUniformInventory` | Query Galls uniform/gear stock by category or SKU. Returns online qty + per-store qty for all locations. |

### Galls Uniform Products (Product2 — 10 records, 2 per category)

| SKU | Product | Category | Online | Lexington KY |
|---|---|---|---|---|
| GL-TFP-M | Galls Pro Men's Tac Force Tactical Pants | Pants | 38 | **0** — Charlotte 14, Houston 11, Chicago 9 |
| GL-BDU-6P | Galls 6-Pocket BDU Ripstop Pants | Pants | 52 | 16 |
| GL-CA-LS | Galls Men's Class A Long Sleeve Security Shirt | Shirts | 65 | 20 |
| GL-CB-SS | Galls Men's Class B Short Sleeve Security Shirt | Shirts | 78 | 24 |
| LP-WB-SEC | LawPro Security Windbreaker | Jackets | 29 | 8 |
| GL-SSH-JKT | Galls Security Softshell Jacket | Jackets | 31 | 7 |
| MR-MOAB2-TRB | Merrell MOAB 2 Tactical Response Boot | Footwear | 43 | 11 |
| BT-8TSB-M | Bates Men's 8-Inch Tactical Sport Boot | Footwear | 35 | 9 |
| BL-GDB-5R | Boston Leather Garrison Duty Belt | Duty Gear | 58 | 15 |
| SF-ALS-OT | Safariland ALS Open Top Duty Holster | Duty Gear | 44 | 13 |

**Demo callout — Tac Force Pants:** Lexington stock is intentionally 0. Agent directs Catie Garvis to Charlotte, Houston, or Chicago stores, or to order online (38 available).

### Salesforce Auth in Server

The server uses SOAP Partner login (same as all scripts in this project) — no Connected App required.
Session auto-refreshes on 401. Env vars: `SF_USERNAME`, `SF_PASSWORD`, `SF_SECURITY_TOKEN`.

### Containerisation — Vibe8 via Rancher (prepared 2026-04-20, not yet deployed)

`Dockerfile` and `platform.yaml` added to repo root. No cold-start delay vs Render free tier.

| File | Path |
|---|---|
| Dockerfile | `mcp-server/Dockerfile` |
| Vibe8 platform config | `mcp-server/platform.yaml` |

Rancher image path pattern:
```
<RANCHER_REGISTRY>/8x8-demos/salesforce-mcp-server:latest
```

Build commands:
```bash
docker build -t salesforce-mcp-server:latest .
docker tag salesforce-mcp-server:latest <RANCHER_REGISTRY>/8x8-demos/salesforce-mcp-server:latest
docker push <RANCHER_REGISTRY>/8x8-demos/salesforce-mcp-server:latest
```

When deployed, update AI Studio MCP Connector URL to Vibe8 hostname. Bearer token unchanged.

---

### External Client App (Created but not used by MCP server)

A Connected App was also created in Salesforce for future use with OAuth Client Credentials Flow.
It is **not** used by the custom MCP server (which uses SOAP login instead).

| Field | Value |
|---|---|
| **App Name** | `ahSalesforce MCP` |
| **OAuth Flow** | Client Credentials (machine-to-machine) |
| **Token Endpoint** | `https://d6a0000002fgdua2-dev-ed.my.salesforce.com/services/oauth2/token` |
| **Consumer Key** | *(stored in Salesforce org — not committed to git)* |
| **Consumer Secret** | *(stored in Salesforce org — not committed to git)* |

Note: MuleSoft Anypoint Platform (paid) is required to use Salesforce Hosted MCP Servers. The native
Salesforce MCP Beta is not functional in Developer Edition orgs without that connection. Custom server
on Render is the working solution for DE.

---

## AI Studio — MCP Connector Setup

### Connector Configuration

| Field | Value |
|---|---|
| **Connector name** | `salesforce-crm` |
| **URL** | `https://salesforce-mcp-server-xftl.onrender.com/mcp` |
| **Auth type** | Bearer token |
| **Token** | `8x8-sf-mcp-2026` |

After saving, click **Sync Tools** — all 12 tools should appear.

> **Note:** AI Studio uses Streamable HTTP transport (`POST /mcp`), not SSE. The `/mcp` endpoint is correct.
> The old `/sse` endpoint also exists for legacy clients but AI Studio should use `/mcp`.

### Postman Collection

`/Users/aharewood/Documents/Code/Salesforce/mcp-server/Salesforce-MCP-Server.postman_collection.json`

Variables: `base_url = https://salesforce-mcp-server-xftl.onrender.com`, `api_key = 8x8-sf-mcp-2026`

Folders: Health Check, MCP Handshake, ContactLookupByPhone, GetAccountSummary, GetOpenOpportunities,
CreateCaseFromCall, Auth Tests

### Copilot Instructions (Screen-Pop Use Case)

```
When a caller connects, use the ContactLookupByPhone tool with their phone number (CLI).
The tool returns a summary string and structured contact data including account details and custom fields.

Greet the caller by first name if found. Mention their company name.
Surface custom fields only if populated (insurance info, KYC status, prescription details, etc.).

If no record found: "I don't have a CRM record for your number — let me take your details."

To create a case during the call, use CreateCaseFromCall with the contactId and accountId from the lookup.
```

---

## Key Considerations

| Topic | Notes |
|---|---|
| **Session expiry** | SOAP login sessions expire per org timeout (default 2h). Re-authenticate if session goes stale. |
| **Credentials** | Store as env vars: `SF_USERNAME`, `SF_PASSWORD`, `SF_SECURITY_TOKEN`. Never hardcode. |
| **API version** | Using v62.0 (Spring '25). Check `Setup → Apex → API` if version needs updating. |
| **Dev Edition limits** | 15,000 API calls/day. Sufficient for demos. |
| **Custom field deployment** | Must use `createMetadata` SOAP + Profile FLS zip deploy — not the Tooling API direct POST. |
| **No new users** | Working with admin user only. No additional user creation planned. |
| **MCP latency** | Agent → AI Studio → MCP server → Salesforce adds ~200–500ms. Acceptable for voice demo. |
| **Opportunity stages** | Standard stages only. Payment/delivery status stored in `Description` field. |

---

## Action List

| # | Task | Status |
|---|---|---|
| 1 | Confirm SOAP login access | ✅ Completed 2026-03-17 |
| 2 | Create 7 custom fields on Contact (with FLS) | ✅ Completed 2026-03-17 |
| 3 | Create 4 Accounts | ✅ Completed 2026-03-17 |
| 4 | Create 4 Contacts with custom field data | ✅ Completed 2026-03-17 |
| 5 | Create open Opportunities (12 total, 3 per account) | ✅ Completed 2026-03-17 |
| 6 | Create billing history Opportunities (32 total, 8 per account) | ✅ Completed 2026-03-17 |
| 7 | Create open Cases (4) and closed historical Cases (12) | ✅ Completed 2026-03-17 |
| 8 | Choose / deploy Salesforce MCP server | ✅ Completed 2026-03-18 — custom Node.js server on Render.com |
| 9 | Create MCP Connector in AI Studio | ✅ Completed 2026-03-19 — `/mcp` endpoint, Bearer `8x8-sf-mcp-2026`, 10 tools synced |
| 10 | Build and test AI Studio Agent with screen-pop tool call | ✅ Completed 2026-03-19 — Agent built, tested end-to-end with live calls |
| 11 | Add `findGallsStore` tool — 20 Galls locations + hours, Nominatim geocoding, Haversine distance | ✅ Completed 2026-04-20 |
| 12 | Add `DEMO_STORES` structure for extensible multi-customer store data | ✅ Completed 2026-04-20 |
| 13 | Create Dockerfile + platform.yaml for Vibe8/Rancher containerisation | ✅ Completed 2026-04-20 — files in repo, deploy walkthrough pending |
| 14 | Update Catie Garvis (003Kg00000A8kSNIAZ) mailing address — 750 New Circle Rd NE, Lexington KY 40505 | ✅ Completed 2026-04-20 |
| 15 | Update Bruce Banner (003Kg00000A8k0BIAR) mailing address — 215 Woodland Ave, Lexington KY 40508 | ✅ Completed 2026-04-20 |
| 16 | Create 10 Galls uniform Product2 records with per-location inventory in Description field | ✅ Completed 2026-04-20 |
| 17 | Add `getUniformInventory` tool — queries Product2, parses INVENTORY: JSON from Description | ✅ Completed 2026-04-20 |
| 18 | Migrate hosting from Render to Vibe8 | 🔲 Pending — walk through with Rancher registry details |

---

*Last updated: 2026-04-20 (session 2)*
