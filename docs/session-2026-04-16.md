# Salesforce Demo Data Session — 2026-04-16

Work done via Claude Code to populate the Salesforce Developer Edition org with demo data for Local Guard and updates to Marvelous Healthcare (Bruce Banner).

---

## 1. Add a new contact

**Prompt:**
> "let's test adding a customer: Catie Garvis mobile phone number: 1 540 539 3326"

**Result:** Contact created.

| Field | Value |
|---|---|
| Name | Catie Garvis |
| Salesforce ID | `003Kg00000A8kSNIAZ` |
| Mobile | +15405393326 |

---

## 2. Create account, cases, orders and assign contact

**Prompt:**
> "let's create an account called Local Guard and at the same time let's create some cases or 'tickets' related to uniform products relevant to products on this page - they can be missing item, defective item, need to return an item (include an RMA in that one) https://www.galls.com/ - also create some orders that relate to products from this page or this page https://www.galls.com/security-uniform-gear including some that are completed and at least two that are still open one shipped and the other on back order - make Catie their senior procurement officer"

**Result:** Account, contact role, 3 cases and 6 orders created.

### Account

| Field | Value |
|---|---|
| Name | Local Guard |
| Salesforce ID | `001Kg00000DWGkAIAX` |
| Industry | Security |
| Phone | +1 540 555 0100 |
| Location | Roanoke, VA, US |

### Contact update

| Field | Value |
|---|---|
| Name | Catie Garvis |
| Title | Senior Procurement Officer |
| Account | Local Guard |

### Cases

| Case # | Salesforce ID | Subject | Priority |
|---|---|---|---|
| 00001084 | `500Kg00000BksmwIAB` | Missing items — Propper Class A Uniform Shirts (Order #LG-2026-0312) | Medium |
| 00001085 | `500Kg00000Bksn1IAB` | Defective item — Merrell MOAB 2 Tactical Response Boots, sole separation | High |
| 00001086 | `500Kg00000Bksn6IAB` | Return request — LawPro Duty Belts \| RMA-LG-2026-0089 | Medium |

**Case detail:**
- **00001084** — 6 of 20 Propper Class A Uniform Shirts missing from order received 2026-04-08. Requesting fulfillment or credit.
- **00001085** — 5 of 8 Merrell MOAB 2 Tactical Boots showing sole delamination within 30 days. Requesting replacement and quality escalation.
- **00001086** — 10× LawPro Garrison Duty Belts wrong size (38 received, 34 required). RMA: `RMA-LG-2026-0089`. Unused, original packaging. Credit preferred.

### Orders

| Order # | Salesforce ID | Description | Amount | Status |
|---|---|---|---|---|
| ORD-0001 | `006Kg000002VGCRIA4` | Propper Class A Uniform Shirts x20 | $1,240.00 | Closed Won |
| ORD-0002 | `006Kg000002VGCWIA4` | 5.11 Tactical TDU Pants x25 | $1,875.00 | Closed Won |
| ORD-0003 | `006Kg000002VGCbIAO` | Streamlight Stinger Flashlights x10 | $680.00 | Closed Won |
| ORD-0004 | `006Kg000002VGCgIAO` | LawPro Garrison Duty Belts x15 | $525.00 | Closed Won |
| ORD-0005 | `006Kg000002VGCDIA4` | Merrell MOAB 2 Tactical Boots x12 | $2,160.00 | Shipped |
| ORD-0006 | `006Kg000002VGClIAO` | Propper Performance Polo Shirts x30 | $1,350.00 | Backordered |

**Order detail:**
- **ORD-0001 to ORD-0004** — Closed/delivered. POD signed by C. Garvis. Payment paid.
- **ORD-0005** — Shipped 2026-04-14. Tracking: UPS `1Z9X2F456789012345`. Expected delivery 2026-04-17. Payment pending on delivery.
- **ORD-0006** — On backorder. ETA 2026-05-12. Supplier stock shortage confirmed by Galls. Payment pending.

---

## 3. Add order numbers to opportunities

**Prompt:**
> "do we have the concept of order numbers in the salesforce tenant yet? If not, how difficult would it be to set that up for the items you have created and provide order numbers rather than Salesforce ID for the Orders"

**Discussion:** Standard Salesforce Opportunities have no auto-generated order number. Three options were discussed:
1. Custom auto-number field on Opportunity — sequential `ORD-0000` format, retroactive on future records
2. Custom text field with manually set values
3. Native Salesforce Order object — high effort, requires Products/Pricebooks

Option 1 selected.

**Prompt:**
> "sure option 1 works"

**Result:** Custom auto-number field created on Opportunity object.

| Field Label | API Name | Type | Format |
|---|---|---|---|
| Order Number | `Order_Number__c` | AutoNumber | `ORD-{0000}` |

FLS granted to: Admin, Standard, Sales Profile, Support Profile, Marketing Profile.

Existing Local Guard opportunities were deleted and recreated to trigger auto-number assignment (Salesforce only assigns auto-numbers at record creation).

---

## 4. Bruce Banner — shipped order and RMA case

**Prompt:**
> "okay for user bruce banner create 1 order shipped and 1 case open about a request for an RMA"

**Result:**

| Order # | Salesforce ID | Description | Amount | Status |
|---|---|---|---|---|
| ORD-0007 | `006Kg000002VGCqIAO` | Disposable Surgical Gloves x500 | $875.00 | Shipped |

| Case # | Salesforce ID | Subject | Priority |
|---|---|---|---|
| 00001087 | `500Kg00000BksnBIAR` | RMA Request — Faulty Pulse Oximeters \| RMA-MH-2026-0031 | High |

**Case detail:** 12× finger-tip pulse oximeters from order MH-2026-0298 (received 2026-03-31) showing intermittent sensor failure. Flagged unsafe for clinical use. RMA: `RMA-MH-2026-0031`. Replacement units needed urgently.

---

## 5. Phone lookup collision — fix and test

**Prompt:**
> "when i call from my mobile 514 771 8726 the ANI matches but the system cannot see Salesforce linked to the orders on that account for Bruce Banner - can you check the orders are associated with the right account Marvelous Healthcare please?"

**Finding:** `+15147718726` was stored on two contacts:
- Bruce Banner — `Phone` field → Marvelous Healthcare
- Tony Stark — `MobilePhone` field → Fantastic Finance

`ContactLookupByPhone` uses `LIMIT 1`, so Salesforce was returning Tony Stark first, causing the agent to pull Fantastic Finance's data instead of Marvelous Healthcare's.

**Fix:** Tony Stark's `MobilePhone` field cleared.

**Prompt:**
> "yes and test the orders that come up for bruce banner"

**Test result — orders returned for +15147718726 after fix:**

| Order # | Description | Amount | Stage |
|---|---|---|---|
| — | Diagnostic Imaging Service Contract | $18,500 | Negotiation/Review |
| — | Telehealth Platform Licence – Q1 2026 | $6,400 | Proposal/Price Quote |
| — | Medical Consumables Restocking Order | $2,100 | Value Proposition |
| — | Telehealth Consultation Bundle x20 – Feb | $1,700 | Needs Analysis |
| — | Urgent Care Visit Pack x8 | $1,560 | Perception Analysis |
| ORD-0007 | Disposable Surgical Gloves x500 — Shipped | $875 | Perception Analysis |

Orders without an Order # predate the `Order_Number__c` field creation and were not recreated.

---

## Salesforce Instance

| Setting | Value |
|---|---|
| Instance | `https://d6a0000002fgdua2-dev-ed.my.salesforce.com` |
| API Version | v62.0 |
| Auth method | SOAP Partner Login (`SF_USERNAME` / `SF_PASSWORD` / `SF_SECURITY_TOKEN`) |

---

## 6. 2026-04-20 Updates

### Mailing addresses added

Fake addresses set near Galls Lexington (40505) to support the store locator demo scenario.

| Contact | Salesforce ID | Address added |
|---|---|---|
| Catie Garvis | `003Kg00000A8kSNIAZ` | 750 New Circle Rd NE, Lexington, KY 40505 |
| Bruce Banner | `003Kg00000A8k0BIAR` | 215 Woodland Ave, Lexington, KY 40508 |

Both resolve to Galls Lexington (1300 Russell Cave Rd) as nearest store — 0.2 mi.

### MCP Server additions (committed to main, pending Render deploy)

| Tool | What it does |
|---|---|
| `findGallsStore` | Geocodes caller zip/city via Nominatim, ranks 20 Galls locations by Haversine distance, returns nearest stores with address, phone, and hours |
| `getUniformInventory` | Queries Salesforce Product2 records, parses per-location stock from Description field, returns online + store quantities |

### Galls uniform products — 10 Product2 records created

2 per category: Pants, Shirts, Jackets, Footwear, Duty Gear. Inventory stored as `INVENTORY:{...}` JSON in `Description` field.

**Demo callout — Tac Force Tactical Pants (GL-TFP-M):** No Lexington stock. Online and distant stores stocked. Agent directs caller to Charlotte, Houston, Chicago or online.

### Containerisation

`Dockerfile` and `platform.yaml` added to repo for future Vibe8/Rancher hosting. Not yet deployed — walkthrough pending.
