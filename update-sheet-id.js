// Script to update sheet ID in all relevant files
const fs = require("fs");

// Ask for the new sheet ID
console.log("Enter your new Google Sheet ID:");
process.stdin.resume();
process.stdin.setEncoding("utf8");

process.stdin.on("data", function (sheetId) {
  // Remove whitespace
  sheetId = sheetId.toString().trim();

  if (!sheetId) {
    console.log("No sheet ID provided. Exiting.");
    process.exit(0);
  }

  console.log(`Using sheet ID: ${sheetId}`);

  // Update test-deployed-function.sh
  try {
    let deployedTestScript = fs.readFileSync(
      "test-deployed-function.sh",
      "utf8"
    );
    deployedTestScript = deployedTestScript.replace(
      /"sheetId": "[^"]+"/g,
      `"sheetId": "${sheetId}"`
    );
    fs.writeFileSync("test-deployed-function.sh", deployedTestScript);
    console.log("Updated test-deployed-function.sh");
  } catch (error) {
    console.error("Error updating test-deployed-function.sh:", error.message);
  }

  // Create/update .env file with the sheet ID
  try {
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
    console.log("Updated .env file");
  } catch (error) {
    console.error("Error updating .env file:", error.message);
  }

  console.log("\nSheet ID updated in all files.");
  console.log(
    "Now try running your test script: bash test-deployed-function.sh"
  );

  process.exit(0);
});
