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

#=================================================
# Test Bulk Assessment Data
#=================================================
echo -e "\n\nTesting Bulk Assessment data..."

curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Origin: https://colorworks-atlas.vercel.app" \
  -d "{
    \"sheetId\": \"$SHEET_ID\",
    \"data\": {
      \"dataType\": \"bulk-assessment\",
      \"name\": \"John Doe (Test)\",
      \"email\": \"test-john@example.com\",
      \"phoneNumber\": \"123-456-7890\",
      \"numberOfAssessments\": 25
    }
  }"

#=================================================
# Test Live Event Data
#=================================================
echo -e "\n\nTesting Live Event data..."

curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Origin: https://colorworks-atlas.vercel.app" \
  -d "{
    \"sheetId\": \"$SHEET_ID\",
    \"data\": {
      \"dataType\": \"live-event\",
      \"name\": \"Jane Smith (Test)\",
      \"email\": \"test-jane@example.com\",
      \"phoneNumber\": \"987-654-3210\",
      \"jobTitle\": \"HR Director\",
      \"organizationName\": \"Test Corp\",
      \"websiteUrl\": \"https://test-corp.example.com\",
      \"estimatedAttendees\": 30,
      \"desiredContentType\": \"Team Building\",
      \"desiredDuration\": \"2 hours\",
      \"desiredFormats\": [\"Interactive\", \"Presentation\"],
      \"specialEventInfo\": {
        \"type\": \"Conference\",
        \"eventTypes\": [\"Annual\", \"Company-wide\"],
        \"userDefinedEventType\": \"Test Summit\"
      },
      \"locationInfo\": {
        \"type\": \"inPerson\",
        \"city\": \"Atlanta\",
        \"state\": \"GA\",
        \"locationName\": \"Test Conference Center\"
      },
      \"budget\": 5000,
      \"eventDate\": \"2023-07-15\",
      \"interestedInBulkAssessments\": true,
      \"referralInfo\": {
        \"source\": \"Test Source\",
        \"moreInfo\": \"This is a test submission\"
      }
    }
  }"

#=================================================
# Test User Signup Data
#=================================================
echo -e "\n\nTesting User Signup data..."

curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Origin: https://colorworks-atlas.vercel.app" \
  -d "{
    \"sheetId\": \"$SHEET_ID\",
    \"data\": {
      \"dataType\": \"user-signup\",
      \"email\": \"test-user@example.com\",
      \"firstName\": \"Test\",
      \"lastName\": \"User\",
      \"createdDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
    }
  }"

echo -e "\n\nTests completed. Check the Google Sheet for results."
echo "Sheet URL: https://docs.google.com/spreadsheets/d/$SHEET_ID/" 