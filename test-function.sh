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

echo "Testing ColorWorks Live Event Booking User template (39480325)..."

# Make request to the function
curl -X POST "https://oouphgurrsruwvayrzte.supabase.co/functions/v1/send-unauthenticated-email" \
  -H "Content-Type: application/json" \
  -H "Origin: https://localhost:54321" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{
    "templateId": "39480325",
    "userEmail": "tim@formfilms.com",
    "fromAddress": "team@formfilms.com",
    "templateData": {
      "name": "Tim Hunt",
      "email": "tim@formfilms.com",
      "phone_number": "555-123-4567",
      "job_title": "Test Manager",
      "organization_name": "Test Company",
      "website_url": "https://www.formfilms.com",
      "content_type": "Leadership Development",
      "duration": "2 hours",
      "estimated_attendees": 25,
      "event_formats": ["Interactive Workshop", "Keynote"],
      "event_group_type": "Corporate",
      "event_types": ["Leadership Training"],
      "location_type": "In person",
      "city": "Test City",
      "state": "Test State",
      "event_date": "2025-04-15",
      "company_name": "Form Films",
      "company_address": "123 Test St, Test City, TS 12345"
    }
  }' 