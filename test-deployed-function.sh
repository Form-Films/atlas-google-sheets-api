#!/bin/bash

# Extract just the SUPABASE_ANON_KEY from .env without sourcing the entire file
if [ -f .env ]; then
  SUPABASE_ANON_KEY=$(grep "^SUPABASE_ANON_KEY=" .env | cut -d '=' -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')
  echo "SUPABASE_ANON_KEY (first 10 chars): ${SUPABASE_ANON_KEY:0:10}..."
fi

# Check if SUPABASE_ANON_KEY is set
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Error: SUPABASE_ANON_KEY is not set in .env file"
  exit 1
fi

# Set the Google Sheet ID
SHEET_ID="1AqLYr4BI6UXWjGELSzs2NLagGsGwCiViwcXH5hBBack"

echo "Testing deployed Google Sheets API with appending rows..."

# Test appending rows to a sheet
curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{
    "sheetId": "1AqLYr4BI6UXWjGELSzs2NLagGsGwCiViwcXH5hBBack",
    "tabName": "Test Tab",
    "append": true,
    "values": [
      {"Header1": "Name", "Header2": "Value", "Header3": "Description"},
      {"Header1": "Test 1", "Header2": "123", "Header3": "Test description 1"},
      {"Header1": "Test 2", "Header2": "456", "Header3": "Test description 2"}
    ]
  }'

echo -e "\n\nTesting deployed Google Sheets API with updating specific cells..."

# Test updating specific cells
curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{
    "sheetId": "1AqLYr4BI6UXWjGELSzs2NLagGsGwCiViwcXH5hBBack",
    "tabName": "Test Tab",
    "append": false,
    "values": [
      [0, 0, "Updated Header"],
      [1, 1, "Updated Value"]
    ]
  }' 