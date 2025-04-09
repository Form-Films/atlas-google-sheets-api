/**
 * Examples of how to call the update-colorworks-google-sheet function from the frontend
 * 
 * These updated functions don't require the sheet ID, as it's configured in the 
 * edge function's environment variables.
 */

// Constants
const SHEETS_ENDPOINT = 'https://oouphgurrsruwvayrzte.supabase.co/functions/v1/update-colorworks-google-sheet';
//@ts-ignore
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_PUBLIC_KEY;

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
 * Integration example with existing ColorWorks Plus registration flow
 */
export async function sendColorWorksPlusRegistrationToGoogleSheets(payload: {
  email: string;
  createdDate: string;
  loginUrl: string;
}): Promise<boolean> {
  return sendUserSignupToGoogleSheets(
    payload.email,
    '', // First name (not available in current payload)
    '', // Last name (not available in current payload)
    payload.createdDate
  );
}

/**
 * Example of integrating with the existing Email Payload from front-end
 */
export async function sendBulkAssessmentFromEmailPayload(
  payload: {
    type: 'bulk-assessment';
    name: string;
    email: string;
    phoneNumber: string;
    numberOfAssessments: number;
  }
): Promise<boolean> {
  return sendBulkAssessmentToGoogleSheets(
    payload.name,
    payload.email,
    payload.phoneNumber,
    payload.numberOfAssessments
  );
}

/**
 * Example of integrating with the existing Email Payload from front-end
 */
export async function sendLiveEventFromEmailPayload(
  payload: {
    type: 'live-event';
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
  }
): Promise<boolean> {
  // Data needs formatting to match the expected format
  return sendLiveEventToGoogleSheets({
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
    referralInfo: payload.referralInfo
  });
} 