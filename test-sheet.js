// Script to check service account access to Google Sheets
const fs = require("fs");
const { GoogleSpreadsheet } = require("google-spreadsheet");

async function testSheetAccess() {
  try {
    // Read the service account key
    console.log("Reading service account key...");
    const serviceAccountKey = JSON.parse(fs.readFileSync("keys.json", "utf8"));

    // Log service account email (useful for sharing)
    console.log(`Service account email: ${serviceAccountKey.client_email}`);

    // Test access to the specified sheet
    const sheetId = "1wxWyiGMUALQD_W5aNEALhLsxLYDfDeM5QA6IYkuXWgo";
    console.log(`Testing access to sheet: ${sheetId}`);

    // Initialize the Google Spreadsheet instance
    const doc = new GoogleSpreadsheet(sheetId);

    // Authenticate with the service account
    await doc.useServiceAccountAuth({
      client_email: serviceAccountKey.client_email,
      private_key: serviceAccountKey.private_key,
    });

    // Load document properties
    console.log("Loading document info...");
    await doc.loadInfo();

    // Sheet exists and we have access
    console.log(`Successfully accessed: ${doc.title}`);
    console.log(`URL: https://docs.google.com/spreadsheets/d/${sheetId}/`);
    console.log(`Sheet has ${doc.sheetCount} sheets`);

    // List available sheets
    console.log("\nAvailable sheets:");
    doc.sheetsByIndex.forEach((sheet, i) => {
      console.log(
        `${i + 1}. ${sheet.title} (${sheet.rowCount} rows x ${
          sheet.columnCount
        } columns)`
      );
    });

    // Testing specific sheet access
    const testTabName = "Test Tab";
    console.log(`\nLooking for tab named "${testTabName}"...`);

    let testSheet = doc.sheetsByTitle[testTabName];
    if (!testSheet) {
      console.log(`Sheet "${testTabName}" not found, creating it...`);
      testSheet = await doc.addSheet({ title: testTabName });
      console.log(`Created new sheet: ${testSheet.title}`);
    } else {
      console.log(`Found existing sheet: ${testSheet.title}`);
    }

    // Add headers if sheet is empty
    await testSheet.loadCells("A1:C1");
    const a1 = testSheet.getCell(0, 0);
    if (!a1.value) {
      console.log("Sheet has no headers, adding them...");
      await testSheet.setHeaderRow(["Name", "Value", "Description"]);
      console.log("Headers added successfully");
    } else {
      console.log("Headers already exist:", a1.value);
    }

    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("Error accessing sheet:", error.message);
    console.error(error);
  }
}

// Check if google-spreadsheet module is installed
try {
  require.resolve("google-spreadsheet");
  testSheetAccess();
} catch (e) {
  console.error("google-spreadsheet module not found. Please install it with:");
  console.error("npm install google-spreadsheet");
}
