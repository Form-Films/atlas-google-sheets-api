/**
 * Examples of how to call the update-colorworks-google-sheet function from the frontend
 * 
 * Note: This is just an example and not meant to be used directly in the frontend.
 * The actual implementation should incorporate proper error handling and UI feedback.
 */

// Constants
const SHEET_ID = 'your-google-sheet-id';
const SHEETS_ENDPOINT = 'https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet';
const SUPABASE_PUBLIC_KEY = 'your-supabase-public-key';

/**
 * Send bulk assessment data to Google Sheets
 */
export async function sendBulkAssessmentToGoogleSheets(
  name: string,
  email: string,
  phoneNumber: string,
  numberOfAssessments: number
): Promise<boolean> {
  try {
    const payload = {
      sheetId: SHEET_ID,
      data: {
        dataType: 'bulk-assessment',
        name,
        email,
        phoneNumber,
        numberOfAssessments
      }
    };

    const response = await fetch(SHEETS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_PUBLIC_KEY}`,
        'Origin': 'https://colorworks-atlas.vercel.app'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Failed to send bulk assessment data to Google Sheets:', error);
    return false;
  }
}

/**
 * Send live event data to Google Sheets
 */
export async function sendLiveEventToGoogleSheets(eventData: {
  name: string;
  email: string;
  phoneNumber: string;
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
}): Promise<boolean> {
  try {
    const payload = {
      sheetId: SHEET_ID,
      data: {
        dataType: 'live-event',
        ...eventData
      }
    };

    const response = await fetch(SHEETS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_PUBLIC_KEY}`,
        'Origin': 'https://colorworks-atlas.vercel.app'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Failed to send live event data to Google Sheets:', error);
    return false;
  }
}

/**
 * Send user signup data to Google Sheets
 */
export async function sendUserSignupToGoogleSheets(
  email: string,
  firstName: string = '',
  lastName: string = '',
  createdDate: string = new Date().toISOString()
): Promise<boolean> {
  try {
    const payload = {
      sheetId: SHEET_ID,
      data: {
        dataType: 'user-signup',
        email,
        firstName,
        lastName,
        createdDate
      }
    };

    const response = await fetch(SHEETS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_PUBLIC_KEY}`,
        'Origin': 'https://colorworks-atlas.vercel.app'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Failed to send user signup data to Google Sheets:', error);
    return false;
  }
}

/**
 * Example of transforming data from the frontend EmailPayload to the format needed for Google Sheets
 */
export function transformBulkAssessmentForSheets(payload: any): any {
  return {
    dataType: 'bulk-assessment',
    name: payload.name,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    numberOfAssessments: payload.numberOfAssessments,
  };
}

export function transformLiveEventForSheets(payload: any): any {
  return {
    dataType: 'live-event',
    name: payload.name,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    jobTitle: payload.jobTitle,
    organizationName: payload.organizationName,
    websiteUrl: payload.websiteUrl,
    estimatedAttendees: payload.estimatedAttendees,
    desiredContentType: payload.desiredContentType,
    desiredDuration: payload.desiredDuration,
    desiredFormats: payload.desiredFormats,
    specialEventInfo: payload.specialEventInfo,
    locationInfo: payload.locationInfo,
    budget: payload.budget,
    eventDate: payload.eventDate,
    interestedInBulkAssessments: payload.interestedInBulkAssessments,
    referralInfo: payload.referralInfo,
  };
} 