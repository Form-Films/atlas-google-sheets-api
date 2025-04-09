# ColorWorks Google Sheets API

This repository contains a Supabase Edge Function that records data from the ColorWorks application into Google Sheets. The implementation supports three types of data:

1. Bulk Assessments information
2. Live Event booking information
3. User Signup information

## Technical Implementation

The Edge Function provides a REST API for updating Google Sheets:

- Endpoint: `https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <SUPABASE_PUBLIC_KEY>`
  - `Origin: https://colorworks-atlas.vercel.app`

## API Request Format

```json
{
  "sheetId": "<GOOGLE_SHEET_ID>",
  "data": {
    "dataType": "bulk-assessment" | "live-event" | "user-signup",
    ...fields specific to the data type
  }
}
```

**Note:** The `sheetId` parameter is optional. If not provided, the function will use the `COLORWORKS_GOOGLE_SHEET_ID` environment variable. This approach is recommended for security reasons to avoid exposing the Sheet ID in front-end code.

### Data Types

#### Bulk Assessment

The `data` object for bulk assessments should include:

```json
{
  "dataType": "bulk-assessment",
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "123-456-7890",
  "numberOfAssessments": 10
}
```

#### Live Event

The `data` object for live events should include:

```json
{
  "dataType": "live-event",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phoneNumber": "123-456-7890",
  "jobTitle": "HR Director",
  "organizationName": "ABC Corp",
  "websiteUrl": "https://abccorp.com",
  "estimatedAttendees": 25,
  "desiredContentType": "Team Building",
  "desiredDuration": "2 hours",
  "desiredFormats": ["Interactive", "Presentation"],
  "specialEventInfo": {
    "type": "Conference",
    "eventTypes": ["Annual", "Company-wide"],
    "userDefinedEventType": "Leadership Summit"
  },
  "locationInfo": {
    "type": "inPerson",
    "city": "Atlanta",
    "state": "GA",
    "locationName": "Conference Center"
  },
  "budget": 5000,
  "eventDate": "2023-06-15",
  "interestedInBulkAssessments": true,
  "referralInfo": {
    "source": "Google",
    "moreInfo": "Searched for team building"
  }
}
```

Note: `eventDate` can also be an object with `startDate` and `endDate` properties.

#### User Signup

The `data` object for user signups should include:

```json
{
  "dataType": "user-signup",
  "email": "user@example.com",
  "firstName": "Alex",
  "lastName": "Johnson",
  "createdDate": "2023-05-01T12:00:00Z"
}
```

## Google Sheets Structure

The data is stored in a Google Sheet with the following tabs:

1. **Bulk Assessments**: Records bulk assessment requests
2. **Live Events**: Records live event bookings
3. **User Signups**: Records user signups

If a tab doesn't exist, it will be created automatically.

## Development

To modify the implementation:

1. Update the Supabase edge function in `supabase/functions/update-colorworks-google-sheet/index.ts`
2. Deploy using the Supabase CLI:

```bash
supabase functions deploy update-colorworks-google-sheet
```

## Configuration

### Setting the Google Sheet ID

To set the default Google Sheet ID as an environment variable:

```bash
npx supabase secrets set COLORWORKS_GOOGLE_SHEET_ID="your-google-sheet-id"
```

## Integration Examples

See `examples/send-to-sheets.ts` for examples of how to integrate with the API from your frontend code.

## Environment Variables

The function requires the following environment variables:

- `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`: Base64-encoded Google service account credentials
- `GOOGLE_SERVICE_ACCOUNT_KEY`: JSON string of Google service account credentials (fallback)
- `COLORWORKS_GOOGLE_SHEET_ID`: Default Google Sheet ID to use if not provided in requests
