# Local Guard — Salesforce Demo Data

*Created: 2026-04-16*

---

## Account

| Field | Value |
|---|---|
| **Name** | Local Guard |
| **Salesforce ID** | `001Kg00000DWGkAIAX` |
| **Industry** | Security |
| **Phone** | +1 540 555 0100 |
| **Billing Location** | Roanoke, VA, US |

---

## Contact

| Field | Value |
|---|---|
| **Name** | Catie Garvis |
| **Salesforce ID** | `003Kg00000A8kSNIAZ` |
| **Title** | Senior Procurement Officer |
| **Account** | Local Guard |
| **Mobile** | +1 540 539 3326 |
| **Mailing Address** | 750 New Circle Rd NE, Lexington, KY 40505 *(added 2026-04-20 for store locator demo)* |

---

## Cases

| Case # | Salesforce ID | Subject | Priority | Status |
|---|---|---|---|---|
| 00001084 | `500Kg00000BksmwIAB` | Missing items — Propper Class A Uniform Shirts (Order #LG-2026-0312) | Medium | New |
| 00001085 | `500Kg00000Bksn1IAB` | Defective item — Merrell MOAB 2 Tactical Response Boots, sole separation | High | New |
| 00001086 | `500Kg00000Bksn6IAB` | Return request — LawPro Duty Belts \| RMA-LG-2026-0089 | Medium | New |

### Case Details

**00001084 — Missing Items**
- Order #LG-2026-0312 received 2026-04-08
- 20 units of Propper Class A Long Sleeve Uniform Shirts ordered; only 14 received
- 6 units outstanding — requesting fulfillment or credit note

**00001085 — Defective Item**
- Order #LG-2026-0287 received 2026-03-28
- 8 pairs of Merrell MOAB 2 Tactical Response Boots; 5 of 8 showing sole delamination at toe cap junction after fewer than 30 days of field use
- Requesting replacement units and quality escalation

**00001086 — Return / RMA**
- Order #LG-2026-0271 — 10× LawPro Garrison Duty Belts
- Incorrect size ordered (38 received, 34 required); items unused, original packaging
- RMA: **RMA-LG-2026-0089** | Return shipping label requested | Credit to account preferred

---

## Orders (Opportunities)

| Order # | Salesforce ID | Description | Amount | Status |
|---|---|---|---|---|
| ORD-0001 | `006Kg000002VGCRIA4` | Propper Class A Uniform Shirts x20 | $1,240.00 | Closed Won |
| ORD-0002 | `006Kg000002VGCWIA4` | 5.11 Tactical TDU Pants x25 | $1,875.00 | Closed Won |
| ORD-0003 | `006Kg000002VGCbIAO` | Streamlight Stinger Flashlights x10 | $680.00 | Closed Won |
| ORD-0004 | `006Kg000002VGCgIAO` | LawPro Garrison Duty Belts x15 | $525.00 | Closed Won |
| ORD-0005 | `006Kg000002VGCDIA4` | Merrell MOAB 2 Tactical Boots x12 | $2,160.00 | **Shipped** |
| ORD-0006 | `006Kg000002VGClIAO` | Propper Performance Polo Shirts x30 | $1,350.00 | **Backordered** |

### Order Details

**ORD-0001 — Propper Class A Uniform Shirts x20** `Closed Won`
- 20× Propper Long Sleeve Class A Uniform Shirts (Navy, mixed sizes M–XL)
- Delivered: 2026-02-14 | POD: Signed by C. Garvis | Payment: Paid

**ORD-0002 — 5.11 Tactical TDU Pants x25** `Closed Won`
- 25× 5.11 Tactical TDU Pants (Black, mixed sizes)
- Delivered: 2026-02-28 | POD: Signed by C. Garvis | Payment: Paid

**ORD-0003 — Streamlight Stinger Flashlights x10** `Closed Won`
- 10× Streamlight Stinger DS LED Flashlights
- Delivered: 2026-03-07 | POD: Signed by C. Garvis | Payment: Paid

**ORD-0004 — LawPro Garrison Duty Belts x15** `Closed Won`
- 15× LawPro Garrison Duty Belts (Black)
- Delivered: 2026-03-21 | POD: Signed by C. Garvis | Payment: Paid

**ORD-0005 — Merrell MOAB 2 Tactical Boots x12** `Shipped — In Transit`
- 12× Merrell MOAB 2 Tactical Response Boots (Black, sizes 9–13)
- Shipped: 2026-04-14 | Tracking: UPS 1Z9X2F456789012345 | Expected delivery: 2026-04-17
- Payment: Pending on delivery

**ORD-0006 — Propper Performance Polo Shirts x30** `Backordered`
- 30× Propper ICE Performance Polo Shirts (Navy, mixed sizes S–XXL)
- On backorder — ETA: 2026-05-12 | Supplier stock shortage confirmed by Galls
- Payment: Pending

---

## Custom Field — Opportunity

| Field Label | API Name | Type | Notes |
|---|---|---|---|
| Order Number | `Order_Number__c` | AutoNumber (`ORD-{0000}`) | FLS granted to Admin, Standard, Sales, Support, Marketing profiles |

---

---

## 2026-04-20 Updates — Galls Store Locator & Uniform Inventory Demo

### Catie Garvis — mailing address added

Fake address set near Galls Lexington store so the store locator demo returns a meaningful nearest-store result when Catie calls.

| Field | Value |
|---|---|
| Mailing address | 750 New Circle Rd NE, Lexington, KY 40505 |
| Nearest Galls store | Galls Lexington — 1300 Russell Cave Rd, Lexington KY 40505 — 0.2 mi |
| Store hours | Mon-Fri 9am-6pm, Sat 9am-1:30pm, Sun Closed |
| Store phone | (859) 787-0420 |

### findGallsStore MCP tool

Agent can call `findGallsStore` with Catie's zip/city to return nearest stores with address, phone, and hours. She can then be offered an SMS with the details via `sendSMS`.

### Uniform Inventory — `getUniformInventory` MCP tool

10 Galls uniform products created as `Product2` records in Salesforce (2 per category). Stock levels stored as JSON in `Product2.Description`.

**Key demo callout — Tac Force Tactical Pants (GL-TFP-M):**
- Lexington: **0 stock**
- Online: 38 | Charlotte NC: 14 | Houston TX: 11 | Chicago IL: 9 | Atlanta GA: 8
- Agent flow: Catie asks about Tac Force Pants → tool shows no Lexington stock → agent directs her to online ordering or nearest stocked store

| Category | SKU | Product |
|---|---|---|
| Pants | GL-TFP-M | Galls Pro Men's Tac Force Tactical Pants |
| Pants | GL-BDU-6P | Galls 6-Pocket BDU Ripstop Pants |
| Shirts | GL-CA-LS | Galls Men's Class A Long Sleeve Security Shirt |
| Shirts | GL-CB-SS | Galls Men's Class B Short Sleeve Security Shirt |
| Jackets | LP-WB-SEC | LawPro Security Windbreaker |
| Jackets | GL-SSH-JKT | Galls Security Softshell Jacket |
| Footwear | MR-MOAB2-TRB | Merrell MOAB 2 Tactical Response Boot |
| Footwear | BT-8TSB-M | Bates Men's 8-Inch Tactical Sport Boot |
| Duty Gear | BL-GDB-5R | Boston Leather Garrison Duty Belt |
| Duty Gear | SF-ALS-OT | Safariland ALS Open Top Duty Holster |

---

## Salesforce Instance

| Setting | Value |
|---|---|
| **Instance** | `https://d6a0000002fgdua2-dev-ed.my.salesforce.com` |
| **API Version** | v62.0 |
