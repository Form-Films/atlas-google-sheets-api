#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk NF | sed -e 's/\r$//' | xargs)
fi

# Check if SUPABASE_ANON_KEY is set
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Error: SUPABASE_ANON_KEY is not set in .env file"
  exit 1
fi

# Check if SUPABASE_URL is set
if [ -z "$SUPABASE_URL" ]; then
  echo "Error: SUPABASE_URL is not set in .env file. Format: https://<project-ref>.supabase.co"
  exit 1
fi

# Set the Google Sheet ID
# This is the actual Google Sheet ID to use
SHEET_ID="1AqLYr4BI6UXWjGELSzs2NLagGsGwCiViwcXH5hBBack"

# Format the function URL using SUPABASE_URL
FUNCTION_URL="${SUPABASE_URL}/functions/v1/update-colorworks-google-sheet"

echo "Testing Google Sheets API with appending rows..."
echo "Using function URL: $FUNCTION_URL"

# Test appending rows to a sheet
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d "{
    \"sheetId\": \"$SHEET_ID\",
    \"tabName\": \"Sheet1\",
    \"values\": [
      {
        \"name\": \"Test User\",
        \"email\": \"test@example.com\",
        \"date\": \"$(date +"%Y-%m-%d")\"
      }
    ],
    \"append\": true
  }"

echo -e "\n\nTesting Google Sheets API with updating specific cells..."

# Test updating specific cells
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d "{
    \"sheetId\": \"$SHEET_ID\",
    \"tabName\": \"Sheet1\",
    \"values\": [
      [0, 0, \"Last Updated: $(date)\"],
      [0, 1, \"Test Update\"],
      [0, 2, \"Success\"]
    ]
  }" 