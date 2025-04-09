import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest } from "../_shared/validate-request.ts";
import { notifySlack } from "../_shared/notify-slack.ts";

// Define local types to work around TypeScript import issues
// These are simplified versions of the actual types, containing just what we need
type GoogleSpreadsheetWorksheet = {
  addRows: (rows: any[]) => Promise<any>;
  loadCells: () => Promise<void>;
  getCell: (row: number, col: number) => { value: any };
  saveUpdatedCells: () => Promise<void>;
};

type GoogleSpreadsheetType = {
  useServiceAccountAuth: (credentials: { client_email: string; private_key: string }) => Promise<void>;
  loadInfo: () => Promise<void>;
  sheetsByTitle: Record<string, GoogleSpreadsheetWorksheet>;
  addSheet: (options: { title: string }) => Promise<GoogleSpreadsheetWorksheet>;
  title: string;
};

// Data types definitions
type EmailPayloadBase = {
  name: string;
  email: string;
  phoneNumber: string;
};

type BulkAssessmentPayload = EmailPayloadBase & {
  dataType: 'bulk-assessment';
  numberOfAssessments: number;
};

type LiveEventPayload = EmailPayloadBase & {
  dataType: 'live-event';
  jobTitle: string;
  organizationName: string;
  websiteUrl: string;
  estimatedAttendees: number;
  desiredContentType?: string;
  desiredDuration?: string;
  desiredFormats?: string[];
  specialEventInfo?: {
    type: string;
    eventTypes: string[];
    userDefinedEventType?: string;
  };
  locationInfo?: {
    type: 'virtual';
  } | {
    type: 'inPerson' | 'either';
    city: string;
    state: string;
    locationName?: string;
  };
  budget?: number;
  eventDate?: string | { startDate: string; endDate: string };
  interestedInBulkAssessments?: boolean;
  referralInfo: {
    source: string;
    moreInfo: string;
  };
};

type UserSignupPayload = {
  dataType: 'user-signup';
  email: string;
  firstName?: string;
  lastName?: string;
  createdDate: string;
};

type DataPayload = BulkAssessmentPayload | LiveEventPayload | UserSignupPayload;

// Import the actual packages/
//@ts-expect-error
const { GoogleSpreadsheet } = await import("npm:google-spreadsheet@3.3.0");

//@ts-expect-error
const { JWT } = await import("npm:google-auth-library@8.9.0");

// Rate limiting
const RATE_LIMIT_NUM = 10; // Number of requests allowed
const RATE_LIMIT_WINDOW_MS = 60000; // Time window in milliseconds (1 minute)
const ipRequestMap = new Map<string, { count: number; resetTime: number }>();

// Sheet tab names
const BULK_ASSESSMENT_TAB = "Bulk Assessments";
const LIVE_EVENT_TAB = "Live Events";
const USER_SIGNUP_TAB = "User Signups";

// Default Google Sheet ID from environment variable
const DEFAULT_SHEET_ID = Deno.env.get("COLORWORKS_GOOGLE_SHEET_ID");

// Define headers for each sheet type
const BULK_ASSESSMENT_HEADERS = [
  'Name', 'Email', 'Phone Number', 'Number of Assessments', 'Submission Date'
];

const LIVE_EVENT_HEADERS = [
  'Name', 'Email', 'Phone Number', 'Job Title', 'Organization', 'Website',
  'Estimated Attendees', 'Content Type', 'Duration', 'Event Formats',
  'Event Group Type', 'Event Types', 'Custom Event Type', 'Location Type',
  'City', 'State', 'Location Name', 'Budget', 'Event Date',
  'Interested In Bulk Assessments', 'Referral Source', 'Referral Info', 'Submission Date'
];

const USER_SIGNUP_HEADERS = [
  'Email', 'First Name', 'Last Name', 'Created Date', 'Signup Date'
];

console.info("Google Sheets update function started");

// Helper function to check if EdgeRuntime exists and use waitUntil
async function useEdgeRuntimeWaitUntil(promise: Promise<any>): Promise<void> {
  // Check if EdgeRuntime exists with typeof to avoid reference errors
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && 'waitUntil' in EdgeRuntime) {
    // @ts-ignore - We've checked that it exists and has waitUntil
    EdgeRuntime.waitUntil(promise);
  } else {
    // If EdgeRuntime is not available, just await the promise
    await promise;
  }
}

/**
 * Helper function to get service account credentials from various sources
 * Prioritizes:
 * 1. Local file (for development)
 * 2. Environment variable (for production)
 */
async function getServiceAccountCreds() {
  let serviceAccountCreds: any = null;
  
  try {
    // Skip local file reading in production mode to avoid errors
    // In development, manual handling would be needed
    
    // Try to get from base64 encoded environment variable (new method)
    try {
      console.info("Attempting to read base64 encoded service account key...");
      const base64Key = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
      
      if (base64Key) {
        // Decode from base64
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(
          Uint8Array.from(atob(base64Key), c => c.charCodeAt(0))
        );
        
        serviceAccountCreds = JSON.parse(jsonStr);
        
        // Verify we have the required fields
        if (serviceAccountCreds.client_email && serviceAccountCreds.private_key) {
          console.info("Service account key decoded from base64 successfully");
          return serviceAccountCreds;
        }
      }
    } catch (error) {
      const base64Error = error as Error;
      console.warn("Could not decode base64 key:", base64Error.message);
    }
    
    // Otherwise, get from environment variable (for production)
    console.info("Attempting to read service account key from environment variable...");
    const rawServiceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}";
    
    // Try direct parsing
    serviceAccountCreds = JSON.parse(rawServiceAccountKey);
    
    // If result is a string, we have double encoding
    if (typeof serviceAccountCreds === 'string') {
      console.info("Service account key is double-encoded. Parsing again...");
      serviceAccountCreds = JSON.parse(serviceAccountCreds);
    }
    
    // Verify we have the required fields
    if (!serviceAccountCreds.client_email || !serviceAccountCreds.private_key) {
      throw new Error("Missing required fields in service account credentials");
    }
    
    console.info("Service account key loaded from environment variable successfully");
    return serviceAccountCreds;
  } catch (error) {
    const typedError = error as Error;
    console.error("Error getting service account credentials:", typedError);
    
    // Last resort: Try to use regex to extract required fields
    try {
      console.info("Attempting to extract service account fields with regex...");
      const rawText = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}";
      const emailMatch = rawText.match(/"client_email"\s*:\s*"([^"]+)"/);
      const keyMatch = rawText.match(/"private_key"\s*:\s*"([^"]+)"/);
      
      if (emailMatch && keyMatch) {
        let privateKey = keyMatch[1].replace(/\\n/g, "\n");
        // Handle potential double escaping
        privateKey = privateKey.replace(/\\\\n/g, "\\n");
        
        serviceAccountCreds = {
          client_email: emailMatch[1],
          private_key: privateKey
        };
        
        console.info("Service account fields extracted successfully with regex");
        return serviceAccountCreds;
      } else {
        throw new Error("Could not extract client_email and private_key");
      }
    } catch (regexError) {
      const typedRegexError = regexError as Error;
      console.error("Regex extraction failed:", typedRegexError);
      throw new Error(`Cannot parse service account credentials: ${typedError.message}`);
    }
  }
}

/**
 * Format event date for spreadsheet
 */
function formatEventDate(eventDate: string | { startDate: string; endDate: string } | undefined): string {
  if (!eventDate) return '';
  return typeof eventDate === 'string'
    ? eventDate
    : `${eventDate.startDate} - ${eventDate.endDate}`;
}

/**
 * Ensure sheet has headers
 */
async function ensureSheetHasHeaders(
  sheet: GoogleSpreadsheetWorksheet, 
  headers: string[]
): Promise<void> {
  try {
    // Load first row to check if headers exist
    await sheet.loadCells();
    
    // Check if first cell is empty
    const firstCell = sheet.getCell(0, 0);
    if (!firstCell.value) {
      console.info("Sheet is missing headers. Adding them now...");
      
      // Add headers as first row
      for (let i = 0; i < headers.length; i++) {
        const cell = sheet.getCell(0, i);
        cell.value = headers[i];
      }
      
      await sheet.saveUpdatedCells();
      console.info("Headers added successfully");
    } else {
      console.info("Headers already exist in sheet");
    }
  } catch (error) {
    console.error("Error ensuring headers:", error);
    throw error;
  }
}

/**
 * Format bulk assessment data for spreadsheet
 */
function formatBulkAssessmentData(data: BulkAssessmentPayload): Record<string, any> {
  return {
    'Name': data.name,
    'Email': data.email,
    'Phone Number': data.phoneNumber,
    'Number of Assessments': data.numberOfAssessments,
    'Submission Date': new Date().toISOString(),
  };
}

/**
 * Format live event data for spreadsheet
 */
function formatLiveEventData(data: LiveEventPayload): Record<string, any> {
  const eventDate = formatEventDate(data.eventDate);
  
  return {
    'Name': data.name,
    'Email': data.email,
    'Phone Number': data.phoneNumber,
    'Job Title': data.jobTitle,
    'Organization': data.organizationName,
    'Website': data.websiteUrl,
    'Estimated Attendees': data.estimatedAttendees,
    'Content Type': data.desiredContentType || '',
    'Duration': data.desiredDuration || '',
    'Event Formats': Array.isArray(data.desiredFormats) ? data.desiredFormats.join(', ') : '',
    'Event Group Type': data.specialEventInfo?.type || '',
    'Event Types': Array.isArray(data.specialEventInfo?.eventTypes) ? 
      data.specialEventInfo.eventTypes.join(', ') : '',
    'Custom Event Type': data.specialEventInfo?.userDefinedEventType || '',
    'Location Type': data.locationInfo?.type || '',
    'City': data.locationInfo && 'city' in data.locationInfo ? data.locationInfo.city : '',
    'State': data.locationInfo && 'state' in data.locationInfo ? data.locationInfo.state : '',
    'Location Name': data.locationInfo && 'locationName' in data.locationInfo ? data.locationInfo.locationName : '',
    'Budget': data.budget || '',
    'Event Date': eventDate,
    'Interested In Bulk Assessments': data.interestedInBulkAssessments ? 'Yes' : 'No',
    'Referral Source': data.referralInfo.source,
    'Referral Info': data.referralInfo.moreInfo,
    'Submission Date': new Date().toISOString(),
  };
}

/**
 * Format user signup data for spreadsheet
 */
function formatUserSignupData(data: UserSignupPayload): Record<string, any> {
  return {
    'Email': data.email,
    'First Name': data.firstName || '',
    'Last Name': data.lastName || '',
    'Created Date': data.createdDate,
    'Signup Date': new Date().toISOString(),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    // Rate limiting check
    const now = Date.now();
    const ipData = ipRequestMap.get(clientIp) || {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };

    if (now > ipData.resetTime) {
      // Reset window has passed, reset counter
      ipData.count = 1;
      ipData.resetTime = now + RATE_LIMIT_WINDOW_MS;
    } else {
      // Increment counter
      ipData.count++;
    }

    ipRequestMap.set(clientIp, ipData);

    if (ipData.count > RATE_LIMIT_NUM) {
      return new Response(
        JSON.stringify({ error: "Too many requests, please try again later" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate request format and authorization
    const validation = await validateRequest(req);
    if (!validation.success) {
      return validation.response as Response;
    }

    // Parse the request body
    const { sheetId: requestSheetId, data } = await req.json();
    
    // Use the provided sheetId or fall back to the default
    const sheetId = requestSheetId || DEFAULT_SHEET_ID;

    // Validate we have a sheet ID
    if (!sheetId) {
      return new Response(
        JSON.stringify({ 
          error: "No sheet ID provided in request and no default sheet ID configured in environment" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!data || typeof data !== 'object') {
      return new Response(
        JSON.stringify({
          error: "Missing or invalid parameter: data should be an object",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine the data type and format
    let tabName: string;
    let formattedData: Record<string, any>;
    let headers: string[] = [];

    if ('dataType' in data) {
      switch (data.dataType) {
        case 'bulk-assessment':
          tabName = BULK_ASSESSMENT_TAB;
          formattedData = formatBulkAssessmentData(data as BulkAssessmentPayload);
          headers = BULK_ASSESSMENT_HEADERS;
          break;
        case 'live-event':
          tabName = LIVE_EVENT_TAB;
          formattedData = formatLiveEventData(data as LiveEventPayload);
          headers = LIVE_EVENT_HEADERS;
          break;
        case 'user-signup':
          tabName = USER_SIGNUP_TAB;
          formattedData = formatUserSignupData(data as UserSignupPayload);
          headers = USER_SIGNUP_HEADERS;
          break;
        default:
          return new Response(
            JSON.stringify({ error: "Invalid data type" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
      }
    } else {
      // Legacy support for the original API format
      const { tabName: requestedTabName, values } = data;
      tabName = requestedTabName;
      formattedData = values;
      // For legacy format, we don't need to set headers as the user would handle that
    }

    // Get service account credentials using the helper function
    const serviceAccountCreds = await getServiceAccountCreds();
    console.info("Successfully retrieved service account credentials");
    console.info("Service account client_email:", serviceAccountCreds.client_email);
    console.info("Service account private_key length:", serviceAccountCreds.private_key.length);

    // Initialize the Google Sheets document
    console.info("Initializing Google Spreadsheet...");
    const doc = new GoogleSpreadsheet(sheetId) as GoogleSpreadsheetType;
    
    // Initialize auth with the service account
    console.info("Authenticating with service account...");
    await doc.useServiceAccountAuth({
      client_email: serviceAccountCreds.client_email,
      private_key: serviceAccountCreds.private_key,
    });
    
    console.info("Loading spreadsheet info...");
    await doc.loadInfo();
    console.info("Spreadsheet loaded successfully:", doc.title);

    // Access the specified worksheet (tab)
    let sheet: GoogleSpreadsheetWorksheet;
    try {
      sheet = doc.sheetsByTitle[tabName];
      if (!sheet) {
        // Create new sheet if it doesn't exist
        console.info(`Creating new sheet: ${tabName}`);
        sheet = await doc.addSheet({ title: tabName });
        
        // For new sheets, add headers immediately
        if (headers.length > 0) {
          await ensureSheetHasHeaders(sheet, headers);
        }
      } else if (headers.length > 0) {
        // For existing sheets, ensure headers exist
        await ensureSheetHasHeaders(sheet, headers);
      }
    } catch (error) {
      const typedError = error as Error;
      const errorMessage = typedError.message;
      return new Response(
        JSON.stringify({ error: `Error accessing sheet: ${errorMessage}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Add the formatted data as a row
    try {
      if (Array.isArray(formattedData)) {
        // Handle legacy format (array of arrays)
        await sheet.addRows(formattedData);
      } else {
        // Handle new format (single record)
        await sheet.addRows([formattedData]);
      }
    } catch (error) {
      // Notify admin about error via Slack
      const typedError = error as Error;
      const errorMessage = typedError.message;
      const slackMessage = `Error updating Google Sheet: ${errorMessage}`;

      // Use our helper function for EdgeRuntime waitUntil
      await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

      return new Response(JSON.stringify({ error: slackMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Data added to Google Sheet successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // Notify admin about error via Slack
    const typedError = error as Error;
    const errorMessage = typedError.message;
    const slackMessage = `Unexpected error in update-colorworks-google-sheet function: ${errorMessage}`;

    // Use our helper function for EdgeRuntime waitUntil
    await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

    return new Response(JSON.stringify({ error: slackMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
