// Script to create a new Google Sheet
const fs = require("fs");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

async function createNewSpreadsheet() {
  try {
    // Read the service account key
    console.log("Reading service account key...");
    const serviceAccountKey = JSON.parse(fs.readFileSync("keys.json", "utf8"));

    // Output service account email (for sharing)
    console.log(`Service account email: ${serviceAccountKey.client_email}`);

    console.log(
      "\nIMPORTANT: You need to manually create a Google Sheet and share it with the service account email above."
    );
    console.log(
      'Make sure to give the service account "Editor" access to the sheet.\n'
    );

    console.log(
      "After creating and sharing the sheet, update your .env file and the test script with the new sheet ID."
    );
    console.log(
      "The sheet ID is the long string in the sheet URL: https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit"
    );

    // Ask for the sheet ID
    console.log(
      "\nEnter the ID of your Google Sheet when ready, or press Enter to exit:"
    );
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", async function (sheetId) {
      // Remove whitespace
      sheetId = sheetId.toString().trim();

      if (!sheetId) {
        console.log("No sheet ID provided. Exiting.");
        process.exit(0);
      }

      console.log(`Testing access to sheet: ${sheetId}`);

      try {
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
        console.log(`\nSUCCESS! Successfully accessed: ${doc.title}`);
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

        // Create our test tab if it doesn't exist
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

        // Update test scripts with the new sheet ID
        console.log("\nUpdating test scripts with the new sheet ID...");

        // Update test-deployed-function.sh
        let deployedTestScript = fs.readFileSync(
          "test-deployed-function.sh",
          "utf8"
        );
        deployedTestScript = deployedTestScript.replace(
          /"sheetId": "[^"]+"/g,
          `"sheetId": "${sheetId}"`
        );
        fs.writeFileSync("test-deployed-function.sh", deployedTestScript);

        // Create/update .env file with the sheet ID
        let envContent = "";
        try {
          envContent = fs.readFileSync(".env", "utf8");
        } catch (e) {
          // File doesn't exist, create it
        }

        // Add or update GOOGLE_SHEET_ID
        if (envContent.includes("GOOGLE_SHEET_ID=")) {
          envContent = envContent.replace(
            /GOOGLE_SHEET_ID=.*/g,
            `GOOGLE_SHEET_ID=${sheetId}`
          );
        } else {
          envContent += `\nGOOGLE_SHEET_ID=${sheetId}\n`;
        }

        fs.writeFileSync(".env", envContent);

        console.log("Test scripts updated with the new sheet ID");
        console.log(
          "\nTry running your test script now: bash test-deployed-function.sh"
        );

        process.exit(0);
      } catch (error) {
        console.error("Error accessing sheet:", error.message);
        console.error(
          "Make sure you have shared the sheet with the service account email and the sheet ID is correct."
        );
        console.log(
          "\nEnter the ID of your Google Sheet when ready, or press Enter to exit:"
        );
      }
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Check if google-spreadsheet module is installed
try {
  require.resolve("google-spreadsheet");
  require.resolve("google-auth-library");

  createNewSpreadsheet();
} catch (e) {
  console.error("Required module not found. Please install dependencies with:");
  console.error("npm install google-spreadsheet google-auth-library");
}
