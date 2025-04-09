 //@ts-ignore
import type { ProjectBackpack } from "../types/projectBackpack";

const EMAIL_ENDPOINT = 'https://oouphgurrsruwvayrzte.supabase.co/functions/v1/send-unauthenticated-email';
 //@ts-ignore
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_PUBLIC_KEY;

// Currently, only these email addresses are allowed as from addresses
const FROM_EMAIL = 'team@atlasinteractive.io';

const COMPANY_INFO = {
  name: "ColorWorks",
  address: "123 Main Street, Atlanta, GA 30328"
} as const;


export type EmailPayloadBase = {
  name: string;
  email: string;
  phoneNumber: string;
};

export type BulkAssessmentEmailPayload = EmailPayloadBase & {
  type: 'bulk-assessment';
  numberOfAssessments: number;
};

export type LiveEventEmailPayload = EmailPayloadBase & {
  type: 'live-event';
  estimatedAttendees: number;
  jobTitle: string;
  organizationName: string;
  websiteUrl: string;
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

export type EmailPayload = BulkAssessmentEmailPayload | LiveEventEmailPayload;

type EmailRequest = {
  templateId: string;
  userEmail: string;
  fromAddress: string;
  templateData: Record<string, string | number>;
};

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  try {
    const emailRequests: EmailRequest[] = [];

    if (payload.type === 'bulk-assessment') {
      // User confirmation email
      emailRequests.push({
        templateId: '39480760', // Bulk Assessments User template
        userEmail: payload.email,
        fromAddress: FROM_EMAIL, // Only allowed from addresses
        templateData: {
          name: payload.name,
          email: payload.email,
          phone_number: payload.phoneNumber,
          number_of_assessments: payload.numberOfAssessments,
          company_name: COMPANY_INFO.name,
          company_address: COMPANY_INFO.address
        }
      });

      // Staff notification email
      emailRequests.push({
        templateId: '39480324', // Bulk Assessments Staff template
        userEmail: 'team@atlasinteractive.io',
        fromAddress: FROM_EMAIL, // Only allowed from addresses
        templateData: {
          name: payload.name,
          email: payload.email,
          phone_number: payload.phoneNumber,
          number_of_assessments: payload.numberOfAssessments,
          company_name: COMPANY_INFO.name,
          company_address: COMPANY_INFO.address
        }
      });
    } else {
      // Live event booking
      const eventDate = formatEventDate(payload.eventDate);
      const locationData = getLocationData(payload.locationInfo);
      const commonTemplateData = {
        name: payload.name,
        email: payload.email,
        phone_number: payload.phoneNumber,
        job_title: payload.jobTitle,
        organization_name: payload.organizationName,
        website_url: payload.websiteUrl,
        content_type: payload.desiredContentType,
        duration: payload.desiredDuration,
        estimated_attendees: payload.estimatedAttendees,
        event_formats: Array.isArray(payload.desiredFormats) ? payload.desiredFormats : [],
        event_group_type: payload.specialEventInfo?.type,
        event_types: Array.isArray(payload.specialEventInfo?.eventTypes) ? 
          payload.specialEventInfo.eventTypes : [],
        custom_event_type: payload.specialEventInfo?.userDefinedEventType,
        ...locationData,
        budget: payload.budget?.toString(),
        event_date: eventDate || '',
        company_name: COMPANY_INFO.name,
        company_address: COMPANY_INFO.address
      };

      // User confirmation email
      emailRequests.push({
        templateId: '39480325', // Live Event Booking User template
        userEmail: payload.email,
        fromAddress: FROM_EMAIL, // Only allowed from addresses
        //@ts-ignore
        templateData: commonTemplateData
      });

      // Staff notification email
      emailRequests.push({
        templateId: '39480738', // Live Event Booking Staff template
        userEmail: 'team@atlasinteractive.io',
        fromAddress: FROM_EMAIL, // Only allowed from addresses
         //@ts-ignore
        templateData: {
          ...commonTemplateData,
          referral_source: payload.referralInfo.source,
          referral_info: payload.referralInfo.moreInfo
        }
      });
    }

    // Send all emails
    const responses = await Promise.all(
      emailRequests.map(request =>
        fetch(EMAIL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_PUBLIC_KEY}`,
            'Origin': 'https://colorworks-atlas.vercel.app'
          },
          body: JSON.stringify(request),
        })
      )
    );

    // Check if all emails were sent successfully
    const allSuccessful = responses.every(response => response.ok);
    if (!allSuccessful) {
      throw new Error('One or more emails failed to send');
    }

    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

function formatEventDate(eventDate: LiveEventEmailPayload['eventDate']): string | undefined {
  if (!eventDate) return undefined;
  return typeof eventDate === 'string'
    ? eventDate
    : `${eventDate.startDate} - ${eventDate.endDate}`;
}

function getLocationData(locationInfo: LiveEventEmailPayload['locationInfo']) {
  return {
    location_type: locationInfo?.type,
    city: locationInfo && 'city' in locationInfo ? locationInfo.city : undefined,
    state: locationInfo && 'state' in locationInfo ? locationInfo.state : undefined,
    location_name: locationInfo && 'locationName' in locationInfo ? locationInfo.locationName : undefined,
  };
}

export function transformBulkAssessmentInfo(info: NonNullable<ProjectBackpack['bulkAssessmentsInfo']>): BulkAssessmentEmailPayload {
  if (!info.userContactInfo || typeof info.numberOfAssessments !== 'number') {
    throw new Error('Invalid bulk assessment info: missing required fields');
  }

  return {
    type: 'bulk-assessment',
    name: info.userContactInfo.name,
    email: info.userContactInfo.email,
    phoneNumber: info.userContactInfo.phoneNumber,
    numberOfAssessments: info.numberOfAssessments,
  };
}

export function transformLiveEventInfo(info: NonNullable<ProjectBackpack['bookLiveEventInfo']>): LiveEventEmailPayload {
  if (!info.userContactInfo || typeof info.estimatedAttendees !== 'number') {
    throw new Error('Invalid live event info: missing required fields');
  }

  return {
    type: 'live-event',
    name: info.userContactInfo.name,
    email: info.userContactInfo.email,
    phoneNumber: info.userContactInfo.phoneNumber,
    jobTitle: info.userContactInfo.jobTitle,
    organizationName: info.userContactInfo.organizationName,
    websiteUrl: info.userContactInfo.websiteUrl,
    estimatedAttendees: info.estimatedAttendees,
    desiredContentType: info.desiredContentType,
    desiredDuration: info.desiredDuration,
    desiredFormats: info.desiredFormats,
    specialEventInfo: info.specialEventInfo,
    locationInfo: info.locationInfo,
    budget: info.budget,
    eventDate: info.eventDate,
    interestedInBulkAssessments: info.interestedInBulkAssessments,
    referralInfo: info.userContactInfo.referralInfo,
  };
}

export interface ColorWorksPlusRegistrationPayload {
  email: string;
  createdDate: string;
  loginUrl: string;
}

export async function sendColorWorksPlusRegistrationEmail(payload: ColorWorksPlusRegistrationPayload): Promise<boolean> {
  try {
    const emailRequest = {
      templateId: '39480875', // Welcome ColorWorks Plus template
      userEmail: payload.email,
      fromAddress: FROM_EMAIL, // Only allowed from addresses
      templateData: {
        email: payload.email,
        created_date: payload.createdDate,
        login_url: payload.loginUrl,
        company_name: COMPANY_INFO.name,
        company_address: COMPANY_INFO.address
      }
    };

    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_PUBLIC_KEY}`,
        'Origin': 'https://colorworks-atlas.vercel.app'
      },
      body: JSON.stringify(emailRequest),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to send ColorWorks Plus registration email:', error);
    return false;
  }
}
