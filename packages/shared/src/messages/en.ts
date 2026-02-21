export const en: Record<string, string> = {
  // Budget
  'error.budgetExceeded':
    'Your AI team has reached its monthly usage limit. Please upgrade your plan or contact support.',

  // Widget errors (pre-session — always English per design, but included for completeness)
  'error.sessionFailed': 'Unable to create session',
  'error.unauthorized': 'Unauthorized',
  'error.forbidden': 'Forbidden',
  'error.tooManyRequests': 'Too many requests',
  'error.messageTooLong': 'Message required (1-4000 chars)',

  // Knowledge
  'error.knowledgeNotFound': 'Knowledge entry not found',
  'error.knowledgeUploadFailed': 'Failed to upload knowledge entry',

  // Billing
  'error.billingNoSubscription': 'No active subscription found',
  'error.billingAlreadySubscribed': 'You already have an active subscription',

  // Generic
  'error.generic': 'Something went wrong. Please try again.',
  'error.notFound': 'Not found',
};
