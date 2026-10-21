# Inventory and cooking plan

Open **Inventory & Cooking** in the sidebar. The page is available to active Super Admins and Data Entry Staff and uses the shared order directory, so orders entered by different staff are included together. It adds no stock writes or database migration.

The default **Today’s orders** view totals orders placed on the current Indian calendar day. For daily fresh cooking, choose **Due today**, **Due tomorrow**, or set **Plan by → Collection date** and the required date range. Date endpoints are inclusive. Use **Refresh records** to load orders saved by other staff before sharing the plan. Category and Marathi product-name filters update both the table and its totals.

The four summary cards show distinct orders, total ordered kg, kg awaiting collection and kg already collected. The product table groups quantities by product ID, keeps the approved Marathi catalogue names and retains demand for inactive or historical products. Drafts and deleted orders are excluded. Legacy Ready orders count as Confirmed. Collected quantities remain visible for reconciliation and are excluded from the cook sheet.

From 21 October, product rows and kitchen sheets follow the client's printed 1–26 rate-card sequence. Additional or historical products appear after that list; sorting never changes recorded quantities or prices.

**Orders** on each product opens the contributing receipt numbers, collection dates, kg and statuses. Links use permanent order UUIDs, so reused receipt numbers cannot mix archived and current orders. **Pending order quantities** shows the quantities requested per outstanding order, such as `4 × 0.25 kg + 2 × 1 kg`. These are order sizes, not a prescribed packaging split.

Choose **Print cook sheet** to print or save as PDF using the browser. **Export kitchen CSV** provides a UTF-8 spreadsheet. Both include every filtered product with pending demand, independently of table pagination. They include the date basis/range, Marathi product names, pending kg, pending order counts and quantity breakdowns. Customer/student names, phone numbers, prices and payment details are omitted from the kitchen sheet. Invalid ranges or invalid source quantities prevent sharing an incomplete plan.

This page reports order demand awaiting collection. It does not infer that this quantity is still uncooked. Check prepared stock before cooking a new batch. No arbitrary buffer, recipe ingredient estimate, extra product or surplus quantity is added.

## Examples

- Ten confirmed outstanding orders containing 1 kg मोतीचूर लाडू and 2 kg बारीक शेव each produce requirements of 10 kg and 20 kg respectively, with ten distinct orders overall.
- If 4 kg of a product's 10 kg ordered quantity has already been collected, the cook sheet shows only the 6 kg awaiting collection.
- Deleting a test order removes its quantities from the next refreshed plan. Its retained historical bill and payments are unchanged.

## Verification and release

The calculation tests cover the ten-order example, quarter-kg and large totals, status/deletion rules, Indian date boundaries, independent collection dates, product/category filters, inactive products, reused receipts, invalid data, complete private-data-free exports and tomorrow's calendar boundaries. Browser cases cover saved orders/collection updates, the receipt breakdown, phone layout, print/PDF output and all 26 products across table pages. The existing Supabase-mode staff-access test includes the new route.

Passed: 72 backend tests, 131 frontend unit tests, 22 inventory/responsive/scrolling browser checks, eight simulated Supabase browser checks and the production build. After the final print validation and wording changes, the three inventory browser cases and production build passed again. Browser checks use Chromium and local fixtures; they do not modify production orders.

Run checks from the corresponding package folders. No production migration is required. Publish the frontend through the existing GitHub/Cloudflare integration after verification; check that `/inventory` and its lazy-loaded page bundle belong to the released commit.
