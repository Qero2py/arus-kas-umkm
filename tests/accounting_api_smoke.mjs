import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.ACCOUNTING_TEST_URL;
const publishableKey = process.env.ACCOUNTING_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.ACCOUNTING_TEST_SERVICE_KEY;
if (!url || !publishableKey || !serviceKey) throw new Error("Development test credentials are missing.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `accounting-api-${randomUUID()}@example.org`;
const password = `${randomBytes(24).toString("base64url")}A!8`;
let userId;
let otherUserId;

function expectData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function todayInJakarta() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

try {
  const created = expectData(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "Create temporary user");
  userId = created.user.id;
  expectData(await client.auth.signInWithPassword({ email, password }), "Sign in temporary user");
  const business = expectData(await client.from("businesses").insert({
    owner_id: userId, name: "Accounting API smoke test",
  }).select("id").single(), "Create business");
  const accounts = expectData(await client.from("accounting_accounts").select("code")
    .eq("business_id", business.id), "Read account template");
  assert.equal(accounts.length, 15);

  const date = todayInJakarta();
  const month = `${date.slice(0, 7)}-01`;
  const opening = {
    p_business_id: business.id, p_entry_date: date, p_source_type: "opening_balance",
    p_source_id: "initial", p_description: "Saldo pembuka API test",
    p_lines: [
      { accountCode: "1010", debit: 100_000, credit: 0 },
      { accountCode: "3100", debit: 0, credit: 100_000 },
    ],
  };
  expectData(await client.rpc("post_accounting_journal", opening), "Post opening balances");
  const sale = {
    p_business_id: business.id, p_entry_date: date, p_source_type: "cash_sale",
    p_source_id: randomUUID(), p_description: "Penjualan API test",
    p_lines: [
      { accountCode: "1010", debit: 50_000, credit: 0 },
      { accountCode: "4100", debit: 0, credit: 50_000 },
    ],
  };
  expectData(await client.rpc("post_accounting_journal", sale), "Post sale");
  const duplicate = await client.rpc("post_accounting_journal", sale);
  assert.ok(duplicate.error, "Duplicate source must be rejected");

  const trial = expectData(await client.rpc("get_accounting_trial_balance", {
    p_business_id: business.id, p_as_of_date: date,
  }), "Read trial balance");
  assert.equal(trial.find((row) => row.code === "1010")?.ending_debit, "150000");
  assert.equal(trial.find((row) => row.code === "3100")?.ending_credit, "100000");
  assert.equal(trial.find((row) => row.code === "4100")?.ending_credit, "50000");
  const ledger = expectData(await client.rpc("get_accounting_ledger", {
    p_business_id: business.id, p_account_code: "1010", p_as_of_date: date,
    p_limit: 101, p_offset: 0,
  }), "Read general ledger");
  assert.equal(ledger.length, 2);
  assert.equal(ledger.at(-1).running_balance, "150000");

  const customer = expectData(await client.from("accounting_contacts").insert({
    business_id: business.id, kind: "customer", name: "Pelanggan Uji",
  }).select("id").single(), "Create customer");
  const supplier = expectData(await client.from("accounting_contacts").insert({
    business_id: business.id, kind: "supplier", name: "Pemasok Uji",
  }).select("id").single(), "Create supplier");
  const due = new Date(`${date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 7);
  const dueDate = due.toISOString().slice(0, 10);
  const saleId = randomUUID();
  const purchaseId = randomUUID();
  const saleDocument = {
    p_business_id: business.id, p_document_id: saleId, p_kind: "sale",
    p_contact_id: customer.id, p_document_no: `INV-${saleId.slice(0, 8)}`,
    p_issue_date: date, p_due_date: dueDate, p_description: "Jasa tempo API test",
    p_amount: 250_000, p_recognition_account_code: "4200", p_control_account_code: "1100",
  };
  const purchaseDocument = {
    p_business_id: business.id, p_document_id: purchaseId, p_kind: "purchase",
    p_contact_id: supplier.id, p_document_no: `BILL-${purchaseId.slice(0, 8)}`,
    p_issue_date: date, p_due_date: dueDate, p_description: "Beban tempo API test",
    p_amount: 180_000, p_recognition_account_code: "6100", p_control_account_code: "2100",
  };
  expectData(await client.rpc("create_accounting_credit_document", saleDocument), "Create credit sale");
  expectData(await client.rpc("create_accounting_credit_document", purchaseDocument), "Create credit purchase");
  const wrongContact = await client.rpc("create_accounting_credit_document", {
    ...saleDocument, p_document_id: randomUUID(), p_document_no: `BAD-${randomUUID().slice(0, 8)}`,
    p_contact_id: supplier.id,
  });
  assert.ok(wrongContact.error, "Supplier-only contact cannot be used for a sale");
  const duplicateInvoice = await client.rpc("create_accounting_credit_document", {
    ...saleDocument, p_document_id: randomUUID(),
  });
  assert.ok(duplicateInvoice.error, "Document numbers must be unique per business and kind");

  const customerPayment = {
    p_business_id: business.id, p_payment_id: randomUUID(), p_document_id: saleId,
    p_paid_date: date, p_amount: 100_000, p_cash_account_code: "1020",
  };
  const supplierPayment = {
    p_business_id: business.id, p_payment_id: randomUUID(), p_document_id: purchaseId,
    p_paid_date: date, p_amount: 80_000, p_cash_account_code: "1020",
  };
  expectData(await client.rpc("record_accounting_credit_payment", customerPayment), "Receive partial payment");
  expectData(await client.rpc("record_accounting_credit_payment", supplierPayment), "Pay supplier partially");
  expectData(await client.rpc("record_accounting_credit_payment", customerPayment), "Repeat identical payment safely");
  const overpayment = await client.rpc("record_accounting_credit_payment", {
    ...customerPayment, p_payment_id: randomUUID(), p_amount: 200_000,
  });
  assert.ok(overpayment.error, "Payment above outstanding must be rejected");

  expectData(await client.from("accounting_contacts").update({ name: "Pelanggan Berganti Nama" })
    .eq("id", customer.id), "Rename customer");
  const documents = expectData(await client.rpc("get_accounting_credit_documents", {
    p_business_id: business.id, p_limit: 51, p_offset: 0,
  }), "Read outstanding documents");
  assert.equal(documents.length, 2);
  assert.equal(documents.find((row) => row.id === saleId)?.outstanding, "150000");
  assert.equal(documents.find((row) => row.id === purchaseId)?.outstanding, "100000");
  assert.equal(documents.find((row) => row.id === saleId)?.contact_name, "Pelanggan Uji");

  const cashWorkspace = expectData(await client.rpc("get_accounting_cash_workspace", {
    p_business_id: business.id,
  }), "Read unified cash workspace");
  assert.equal(cashWorkspace.openingBalance, "100000");
  assert.equal(cashWorkspace.entries.filter((entry) => entry.type === "in")
    .reduce((sum, entry) => sum + Number(entry.amount), 0), 150_000);
  assert.equal(cashWorkspace.entries.filter((entry) => entry.type === "out")
    .reduce((sum, entry) => sum + Number(entry.amount), 0), 80_000);
  assert.equal(cashWorkspace.obligations.find((item) => item.id === saleId)?.settled, "100000");
  assert.equal(cashWorkspace.obligations.find((item) => item.id === purchaseId)?.settled, "80000");

  const otherEmail = `accounting-other-${randomUUID()}@example.org`;
  const otherPassword = `${randomBytes(24).toString("base64url")}A!8`;
  const otherCreated = expectData(await admin.auth.admin.createUser({
    email: otherEmail, password: otherPassword, email_confirm: true,
  }), "Create second temporary user");
  otherUserId = otherCreated.user.id;
  const otherClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expectData(await otherClient.auth.signInWithPassword({ email: otherEmail, password: otherPassword }), "Sign in second user");
  const crossBusinessCash = await otherClient.rpc("get_accounting_cash_workspace", { p_business_id: business.id });
  assert.ok(crossBusinessCash.error, "Another owner cannot read the cash workspace");
  const otherBusiness = expectData(await otherClient.from("businesses").insert({
    owner_id: otherUserId, name: "Accounting stock opening test",
  }).select("id").single(), "Create second business");
  expectData(await otherClient.rpc("post_accounting_journal", {
    p_business_id: otherBusiness.id, p_entry_date: date, p_source_type: "opening_balance",
    p_source_id: "initial", p_description: "Saldo awal stok",
    p_lines: [
      { accountCode: "1200", debit: 5_000, credit: 0 },
      { accountCode: "1500", debit: 120_000, credit: 0 },
      { accountCode: "1590", debit: 0, credit: 30_000 },
      { accountCode: "3100", debit: 0, credit: 95_000 },
    ],
  }), "Post nonzero inventory opening balance");
  const openingProductId = expectData(await otherClient.rpc("create_inventory_product", {
    p_business_id: otherBusiness.id, p_kind: "stock", p_sku: `OPEN-${randomUUID().slice(0, 8)}`,
    p_name: "Barang Awal", p_unit: "pcs", p_purchase_price: 5_000, p_sale_price: 10_000,
    p_min_qty_milli: 0, p_inventory_account_code: "1200", p_cogs_account_code: "5100",
    p_revenue_account_code: "4100",
  }), "Create opening stock product");
  expectData(await otherClient.rpc("activate_inventory", {
    p_business_id: otherBusiness.id,
    p_openings: [{ productId: openingProductId, qtyMilli: "1000", value: "5000" }],
  }), "Reconcile nonzero opening stock with inventory GL");
  const openingReady = new Date(`${month}T00:00:00Z`);
  openingReady.setUTCMonth(openingReady.getUTCMonth() - 3);
  const openingReadyDate = openingReady.toISOString().slice(0, 10);
  const openingAssetId = randomUUID();
  const badAssetActivation = await otherClient.rpc("activate_fixed_assets", { p_business_id: otherBusiness.id });
  assert.ok(badAssetActivation.error, "Unallocated opening asset value must be rejected");
  expectData(await otherClient.rpc("register_fixed_asset", {
    p_business_id: otherBusiness.id, p_asset_id: openingAssetId,
    p_payload: { sourceKind: "opening", category: "equipment", assetCode: "OPEN-EQUIP",
      name: "Peralatan Awal", acquiredOn: openingReadyDate, readyOn: openingReadyDate,
      cost: "120000", initialAccumulated: "30000", lifeMonths: "12",
      assetAccountCode: "1500", accumulatedAccountCode: "1590", expenseAccountCode: "6200" },
  }), "Register opening asset");
  expectData(await otherClient.rpc("activate_fixed_assets", { p_business_id: otherBusiness.id }),
    "Reconcile gross asset and accumulated depreciation with GL");
  assert.equal(expectData(await otherClient.rpc("run_fixed_asset_depreciation", {
    p_business_id: otherBusiness.id, p_month: month,
  }), "Depreciate opening asset"), 1);
  const openingAsset = expectData(await otherClient.from("accounting_fixed_assets")
    .select("accumulated").eq("id", openingAssetId).single(), "Read opening asset depreciation");
  assert.equal(Number(openingAsset.accumulated), 40_000);
  const cheapProductId = expectData(await otherClient.rpc("create_inventory_product", {
    p_business_id: otherBusiness.id, p_kind: "stock", p_sku: `CHEAP-${randomUUID().slice(0, 8)}`,
    p_name: "Barang Murah", p_unit: "pcs", p_purchase_price: 1, p_sale_price: 1,
    p_min_qty_milli: 0, p_inventory_account_code: "1200", p_cogs_account_code: "5100",
    p_revenue_account_code: "4100",
  }), "Create low-value product");
  const cheapEvent = (kind, qtyMilli, amount) => ({
    p_business_id: otherBusiness.id, p_event_id: randomUUID(),
    p_payload: { kind, productId: cheapProductId, date, qtyMilli: String(qtyMilli),
      amount: String(amount), payment: "cash", cashAccountCode: "1010", expenseAccountCode: "6100" },
  });
  expectData(await otherClient.rpc("post_inventory_event", cheapEvent("purchase", 100_000, 1)), "Buy low-value stock");
  expectData(await otherClient.rpc("post_inventory_event", cheapEvent("opname", 99_000, 0)), "Count zero-Rupiah stock loss");
  const cheapAfterCount = expectData(await otherClient.from("inventory_products")
    .select("qty_milli,stock_value").eq("id", cheapProductId).single(), "Read low-value stock");
  assert.equal(Number(cheapAfterCount.qty_milli), 99_000);
  assert.equal(Number(cheapAfterCount.stock_value), 1);
  expectData(await otherClient.rpc("post_inventory_event", cheapEvent("sale", 98_000, 98)), "Sell low-value stock while preserving final Rupiah");
  const cheapBeforeFinal = expectData(await otherClient.from("inventory_products")
    .select("qty_milli,stock_value").eq("id", cheapProductId).single(), "Read remaining low-value stock");
  assert.equal(Number(cheapBeforeFinal.qty_milli), 1_000);
  assert.equal(Number(cheapBeforeFinal.stock_value), 1);
  expectData(await otherClient.rpc("post_inventory_event", cheapEvent("sale", 1_000, 1)), "Consume final Rupiah on final sale");
  const hiddenContacts = expectData(await otherClient.from("accounting_contacts").select("id")
    .eq("business_id", business.id), "Check cross-user contact access");
  assert.equal(hiddenContacts.length, 0, "Another user must not read this business's contacts");
  const otherDocuments = await otherClient.rpc("get_accounting_credit_documents", {
    p_business_id: business.id, p_limit: 51, p_offset: 0,
  });
  assert.ok(otherDocuments.error, "Another user must not read this business's credit documents");
  const otherPayment = await otherClient.rpc("record_accounting_credit_payment", {
    ...customerPayment, p_payment_id: randomUUID(), p_amount: 1,
  });
  assert.ok(otherPayment.error, "Another user must not settle this business's credit document");

  const forgedSource = await client.rpc("post_accounting_journal", {
    ...sale, p_source_type: "credit_sale", p_source_id: randomUUID(),
  });
  assert.ok(forgedSource.error, "Reserved credit source needs a matching document");
  const finalTrial = expectData(await client.rpc("get_accounting_trial_balance", {
    p_business_id: business.id, p_as_of_date: date,
  }), "Read trial balance after credit payments");
  assert.equal(finalTrial.find((row) => row.code === "1100")?.ending_debit, "150000");
  assert.equal(finalTrial.find((row) => row.code === "2100")?.ending_credit, "100000");
  assert.equal(finalTrial.find((row) => row.code === "4200")?.ending_credit, "250000");
  assert.equal(finalTrial.find((row) => row.code === "6100")?.ending_debit, "180000");
  assert.equal(finalTrial.find((row) => row.code === "1020")?.ending_debit, "20000");
  expectData(await client.rpc("record_accounting_credit_payment", {
    ...customerPayment, p_payment_id: randomUUID(), p_amount: 150_000,
  }), "Settle remaining customer balance");
  const settled = expectData(await client.rpc("get_accounting_credit_documents", {
    p_business_id: business.id, p_limit: 51, p_offset: 0,
  }), "Read fully settled document");
  assert.equal(settled.find((row) => row.id === saleId)?.outstanding, "0");
  const settledTrial = expectData(await client.rpc("get_accounting_trial_balance", {
    p_business_id: business.id, p_as_of_date: date,
  }), "Read trial balance after full settlement");
  assert.equal(settledTrial.find((row) => row.code === "1100")?.ending_debit, "0");
  assert.equal(settledTrial.find((row) => row.code === "4200")?.ending_credit, "250000");

  const stockProductId = expectData(await client.rpc("create_inventory_product", {
    p_business_id: business.id, p_kind: "stock", p_sku: `STK-${randomUUID().slice(0, 8)}`,
    p_name: "Bahan Uji", p_unit: "pcs", p_purchase_price: 5_000, p_sale_price: 10_000,
    p_min_qty_milli: 2_000, p_inventory_account_code: "1200", p_cogs_account_code: "5100",
    p_revenue_account_code: "4100",
  }), "Create stock product");
  expectData(await client.rpc("create_inventory_product", {
    p_business_id: business.id, p_kind: "service", p_sku: `SVC-${randomUUID().slice(0, 8)}`,
    p_name: "Jasa Uji", p_unit: "layanan", p_purchase_price: 0, p_sale_price: 25_000,
    p_min_qty_milli: 0, p_inventory_account_code: null, p_cogs_account_code: null,
    p_revenue_account_code: "4200",
  }), "Create service without stock");
  const badOpening = await client.rpc("activate_inventory", {
    p_business_id: business.id, p_openings: [{ productId: stockProductId, qtyMilli: "1000", value: "5000" }],
  });
  assert.ok(badOpening.error, "Opening stock value must reconcile with inventory GL");
  expectData(await client.rpc("activate_inventory", {
    p_business_id: business.id, p_openings: [{ productId: stockProductId, qtyMilli: "0", value: "0" }],
  }), "Activate inventory at zero opening value");

  const stockEvent = (kind, qtyMilli, amount, extra = {}) => ({
    p_business_id: business.id, p_event_id: randomUUID(), p_payload: {
      kind, productId: stockProductId, date, qtyMilli: String(qtyMilli), amount: String(amount),
      payment: "cash", cashAccountCode: "1010", expenseAccountCode: "6100", ...extra,
    },
  });
  expectData(await client.rpc("post_inventory_event", stockEvent("purchase", 10_000, 50_000)), "Buy stock for cash");
  expectData(await client.rpc("post_inventory_event", stockEvent("sale", 3_000, 30_000)), "Sell stock for cash");
  const stockSupplier = stockEvent("purchase", 5_000, 40_000, {
    payment: "credit", contactId: supplier.id, documentNo: `STKB-${randomUUID().slice(0, 8)}`,
    dueDate, controlAccountCode: "2100",
  });
  expectData(await client.rpc("post_inventory_event", stockSupplier), "Buy stock on supplier credit");
  const stockCustomer = stockEvent("sale", 2_000, 20_000, {
    payment: "credit", contactId: customer.id, documentNo: `STKS-${randomUUID().slice(0, 8)}`,
    dueDate, controlAccountCode: "1100",
  });
  expectData(await client.rpc("post_inventory_event", stockCustomer), "Sell stock on customer credit");
  expectData(await client.rpc("post_inventory_event", stockEvent("opname", 9_000, 0)), "Count one unit lost");
  const stock = expectData(await client.from("inventory_products").select("qty_milli,stock_value")
    .eq("id", stockProductId).single(), "Read stock product");
  assert.equal(Number(stock.qty_milli), 9_000);
  assert.equal(Number(stock.stock_value), 56_250);
  const movements = expectData(await client.from("inventory_movements").select("event_kind,value_delta")
    .eq("product_id", stockProductId), "Read stock card");
  assert.equal(movements.length, 5);
  const stockTrial = expectData(await client.rpc("get_accounting_trial_balance", {
    p_business_id: business.id, p_as_of_date: date,
  }), "Reconcile stock and HPP");
  assert.equal(stockTrial.find((row) => row.code === "1200")?.ending_debit, "56250");
  assert.equal(stockTrial.find((row) => row.code === "5100")?.ending_debit, "27500");
  const oversell = await client.rpc("post_inventory_event", stockEvent("sale", 10_000, 100_000));
  assert.ok(oversell.error, "Sale above available stock must be rejected");
  const untrackedInventory = await client.rpc("post_accounting_journal", {
    ...sale, p_source_id: randomUUID(), p_lines: [
      { accountCode: "1200", debit: 1_000, credit: 0 },
      { accountCode: "1010", debit: 0, credit: 1_000 },
    ],
  });
  assert.ok(untrackedInventory.error, "Inventory GL change without stock movement must be rejected");
  const hiddenStock = expectData(await otherClient.from("inventory_products").select("id")
    .eq("business_id", business.id), "Check cross-user stock access");
  assert.equal(hiddenStock.length, 0);

  expectData(await client.rpc("activate_fixed_assets", { p_business_id: business.id }),
    "Activate empty fixed-asset register at zero GL balance");
  const assetBase = { acquiredOn: date, readyOn: date, initialAccumulated: "0",
    assetAccountCode: "1500", accumulatedAccountCode: "1590", expenseAccountCode: "6200" };
  const equipmentId = randomUUID();
  expectData(await client.rpc("register_fixed_asset", { p_business_id: business.id,
    p_asset_id: equipmentId, p_payload: { ...assetBase, sourceKind: "cash",
      category: "equipment", assetCode: `EQ-${equipmentId.slice(0, 8)}`, name: "Mesin Uji",
      cost: "120000", lifeMonths: "12", cashAccountCode: "1010" },
  }), "Buy equipment for cash");
  const landId = randomUUID();
  expectData(await client.rpc("register_fixed_asset", { p_business_id: business.id,
    p_asset_id: landId, p_payload: { ...assetBase, sourceKind: "cash", category: "land",
      assetCode: `LAND-${landId.slice(0, 8)}`, name: "Tanah Uji", cost: "50000",
      lifeMonths: "0", cashAccountCode: "1010" },
  }), "Buy nondepreciating land");
  const vehicleId = randomUUID();
  expectData(await client.rpc("register_fixed_asset", { p_business_id: business.id,
    p_asset_id: vehicleId, p_payload: { ...assetBase, sourceKind: "credit", category: "vehicle",
      assetCode: `VEH-${vehicleId.slice(0, 8)}`, name: "Kendaraan Uji", cost: "240000",
      lifeMonths: "24", contactId: supplier.id, documentNo: `ASSET-${vehicleId.slice(0, 8)}`,
      dueDate, payableAccountCode: "2100" },
  }), "Buy vehicle on supplier credit");
  assert.equal(expectData(await client.rpc("run_fixed_asset_depreciation", {
    p_business_id: business.id, p_month: month,
  }), "Run monthly depreciation"), 2);
  assert.equal(expectData(await client.rpc("run_fixed_asset_depreciation", {
    p_business_id: business.id, p_month: month,
  }), "Repeat depreciation safely"), 0);
  const assets = expectData(await client.from("accounting_fixed_assets")
    .select("id,cost,accumulated").eq("business_id", business.id), "Read fixed assets");
  assert.equal(assets.length, 3);
  assert.equal(Number(assets.find((row) => row.id === landId)?.accumulated), 0);
  const assetTrial = expectData(await client.rpc("get_accounting_trial_balance", {
    p_business_id: business.id, p_as_of_date: date,
  }), "Reconcile fixed assets and depreciation");
  assert.equal(assetTrial.find((row) => row.code === "1500")?.ending_debit, "410000");
  assert.equal(assetTrial.find((row) => row.code === "1590")?.ending_credit, "20000");
  assert.equal(assetTrial.find((row) => row.code === "6200")?.ending_debit, "20000");
  const lateSameMonthId = randomUUID();
  expectData(await client.rpc("register_fixed_asset", { p_business_id: business.id,
    p_asset_id: lateSameMonthId, p_payload: { ...assetBase, sourceKind: "cash",
      category: "equipment", assetCode: `LATE-${lateSameMonthId.slice(0, 8)}`,
      name: "Peralatan Bulan Berjalan", cost: "12000", lifeMonths: "12",
      cashAccountCode: "1010" },
  }), "Register asset after current month depreciation was first run");
  assert.equal(expectData(await client.rpc("run_fixed_asset_depreciation", {
    p_business_id: business.id, p_month: month,
  }), "Depreciate newly registered asset in the same month"), 1);
  const lateSameMonth = expectData(await client.from("accounting_fixed_assets")
    .select("accumulated").eq("id", lateSameMonthId).single(), "Read late same-month asset");
  assert.equal(Number(lateSameMonth.accumulated), 1_000);
  const unregisteredCreditAsset = await client.rpc("create_accounting_credit_document", {
    ...purchaseDocument, p_document_id: randomUUID(),
    p_document_no: `UNREG-${randomUUID().slice(0, 8)}`,
    p_recognition_account_code: "1500",
  });
  assert.ok(unregisteredCreditAsset.error, "Asset credit purchase without register must be rejected");
  const manualAsset = await client.rpc("post_accounting_journal", {
    ...sale, p_source_id: randomUUID(), p_lines: [
      { accountCode: "1500", debit: 1_000, credit: 0 },
      { accountCode: "1010", debit: 0, credit: 1_000 },
    ],
  });
  assert.ok(manualAsset.error, "Unregistered fixed-asset GL change must be rejected");
  const hiddenAssets = expectData(await otherClient.from("accounting_fixed_assets")
    .select("id").eq("business_id", business.id), "Check cross-user asset access");
  assert.equal(hiddenAssets.length, 0);
  const otherDepreciation = await otherClient.rpc("run_fixed_asset_depreciation", {
    p_business_id: business.id, p_month: month,
  });
  assert.ok(otherDepreciation.error, "Another user must not book this business's depreciation");
  console.log("Accounting API smoke test passed: credit, inventory/HPP, assets/depreciation, GL reconciliation, and access isolation.");
} finally {
  if (otherUserId) {
    const deletedOther = await admin.auth.admin.deleteUser(otherUserId);
    if (deletedOther.error) throw new Error(`Second temporary user cleanup failed: ${deletedOther.error.message}`);
  }
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error(`Temporary development user cleanup failed: ${deleted.error.message}`);
    console.log("Temporary development user deleted.");
  }
}
