// Client-side validation utilities
// Provides validation for forms and user inputs

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Constants
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB
const MAX_MESSAGE_LENGTH = 500;
const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_ATTACHMENTS_SIZE = 50 * 1024 * 1024; // 50MB

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validation functions
export const validators = {
  required: (value: any, fieldName: string): string | null => {
    if (value === null || value === undefined || value === '') {
      return `${fieldName} is required`;
    }
    return null;
  },

  string: (value: any, fieldName: string): string | null => {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      return `${fieldName} must be a string`;
    }
    return null;
  },

  number: (value: any, fieldName: string): string | null => {
    if (value !== null && value !== undefined && (typeof value !== 'number' || isNaN(value))) {
      return `${fieldName} must be a number`;
    }
    return null;
  },

  integer: (value: any, fieldName: string): string | null => {
    if (value !== null && value !== undefined && (!Number.isInteger(value) || isNaN(value))) {
      return `${fieldName} must be an integer`;
    }
    return null;
  },

  positive: (value: number, fieldName: string): string | null => {
    if (value !== null && value !== undefined && value <= 0) {
      return `${fieldName} must be positive`;
    }
    return null;
  },

  minLength: (value: string, min: number, fieldName: string): string | null => {
    if (value !== null && value !== undefined && value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },

  maxLength: (value: string, max: number, fieldName: string): string | null => {
    if (value !== null && value !== undefined && value.length > max) {
      return `${fieldName} must not exceed ${max} characters`;
    }
    return null;
  },

  email: (value: string, fieldName: string): string | null => {
    if (value && !EMAIL_REGEX.test(value)) {
      return `${fieldName} must be a valid email address`;
    }
    return null;
  },

  uuid: (value: string, fieldName: string): string | null => {
    if (value && !UUID_REGEX.test(value)) {
      return `${fieldName} must be a valid UUID`;
    }
    return null;
  },

  array: (value: any, fieldName: string): string | null => {
    if (value !== null && value !== undefined && !Array.isArray(value)) {
      return `${fieldName} must be an array`;
    }
    return null;
  },

  maxArrayLength: (value: any[], max: number, fieldName: string): string | null => {
    if (value && value.length > max) {
      return `${fieldName} must not exceed ${max} items`;
    }
    return null;
  },

  date: (value: any, fieldName: string): string | null => {
    if (value && isNaN(Date.parse(value))) {
      return `${fieldName} must be a valid date`;
    }
    return null;
  },

  futureDate: (value: string, fieldName: string): string | null => {
    if (value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return `${fieldName} must be a valid date`;
      }
      if (date < new Date()) {
        return `${fieldName} must be in the future`;
      }
    }
    return null;
  },
};

// Letter validation
export function validateLetter(data: {
  title?: string;
  content?: string;
  recipients?: string[];
  attachments?: any[];
  unlockDate?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  if (data.title !== undefined) {
    const titleError = validators.maxLength(data.title, MAX_TITLE_LENGTH, 'Title');
    if (titleError) errors.push({ field: 'title', message: titleError });
  }

  if (data.content !== undefined) {
    const contentError = validators.maxLength(data.content, MAX_CONTENT_LENGTH, 'Content');
    if (contentError) errors.push({ field: 'content', message: contentError });
  }

  if (data.recipients !== undefined) {
    const recipientsArrayError = validators.array(data.recipients, 'Recipients');
    if (recipientsArrayError) {
      errors.push({ field: 'recipients', message: recipientsArrayError });
    } else {
      const recipientsLengthError = validators.maxArrayLength(data.recipients, MAX_RECIPIENTS, 'Recipients');
      if (recipientsLengthError) errors.push({ field: 'recipients', message: recipientsLengthError });
    }
  }

  if (data.attachments !== undefined) {
    const attachmentsArrayError = validators.array(data.attachments, 'Attachments');
    if (attachmentsArrayError) {
      errors.push({ field: 'attachments', message: attachmentsArrayError });
    } else {
      const attachmentsLengthError = validators.maxArrayLength(data.attachments, MAX_ATTACHMENTS, 'Attachments');
      if (attachmentsLengthError) {
        errors.push({ field: 'attachments', message: attachmentsLengthError });
      } else {
        // Validate attachment sizes
        let totalSize = 0;
        for (let i = 0; i < data.attachments.length; i++) {
          const attachment = data.attachments[i];
          if (attachment && attachment.size) {
            if (attachment.size > MAX_ATTACHMENT_SIZE) {
              errors.push({
                field: `attachments[${i}]`,
                message: `Attachment size exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit`
              });
            }
            totalSize += attachment.size;
          }
        }
        if (totalSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
          errors.push({
            field: 'attachments',
            message: `Total attachments size exceeds ${MAX_TOTAL_ATTACHMENTS_SIZE / 1024 / 1024}MB limit`
          });
        }
      }
    }
  }

  if (data.unlockDate !== undefined && data.unlockDate) {
    const dateError = validators.futureDate(data.unlockDate, 'Unlock date');
    if (dateError) errors.push({ field: 'unlockDate', message: dateError });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Duel validation
export function validateDuel(data: {
  title?: string;
  opponentName?: string;
  stake?: string;
  deadline?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  if (data.title !== undefined) {
    const titleError = validators.maxLength(data.title, MAX_TITLE_LENGTH, 'Title');
    if (titleError) errors.push({ field: 'title', message: titleError });
  }

  if (data.opponentName !== undefined) {
    const opponentError = validators.maxLength(data.opponentName, 100, 'Opponent name');
    if (opponentError) errors.push({ field: 'opponentName', message: opponentError });
  }

  if (data.stake !== undefined) {
    const stakeError = validators.maxLength(data.stake, 200, 'Stake');
    if (stakeError) errors.push({ field: 'stake', message: stakeError });
  }

  if (data.deadline !== undefined && data.deadline) {
    const dateError = validators.futureDate(data.deadline, 'Deadline');
    if (dateError) errors.push({ field: 'deadline', message: dateError });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Gift validation
export function validateGift(data: {
  recipientId?: number;
  giftType?: string;
  message?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  if (data.recipientId !== undefined) {
    const recipientError = validators.integer(data.recipientId, 'Recipient ID');
    if (recipientError) {
      errors.push({ field: 'recipientId', message: recipientError });
    } else {
      const positiveError = validators.positive(data.recipientId, 'Recipient ID');
      if (positiveError) errors.push({ field: 'recipientId', message: positiveError });
    }
  }

  if (data.giftType !== undefined) {
    const typeError = validators.required(data.giftType, 'Gift type');
    if (typeError) errors.push({ field: 'giftType', message: typeError });
  }

  if (data.message !== undefined && data.message) {
    const messageError = validators.maxLength(data.message, MAX_MESSAGE_LENGTH, 'Message');
    if (messageError) errors.push({ field: 'message', message: messageError });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Profile validation
export function validateProfile(data: {
  title?: string;
  bio?: string;
  avatarId?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];

  if (data.title !== undefined && data.title) {
    const titleError = validators.maxLength(data.title, 100, 'Title');
    if (titleError) errors.push({ field: 'title', message: titleError });
  }

  if (data.bio !== undefined && data.bio) {
    const bioError = validators.maxLength(data.bio, 1000, 'Bio');
    if (bioError) errors.push({ field: 'bio', message: bioError });
  }

  if (data.avatarId !== undefined && data.avatarId) {
    const avatarError = validators.maxLength(data.avatarId, 100, 'Avatar ID');
    if (avatarError) errors.push({ field: 'avatarId', message: avatarError });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Squad validation
export function validateSquad(data: {
  name?: string;
  description?: string;
  members?: any[];
}): ValidationResult {
  const errors: ValidationError[] = [];

  if (data.name !== undefined) {
    const nameError = validators.maxLength(data.name, 100, 'Name');
    if (nameError) errors.push({ field: 'name', message: nameError });
  }

  if (data.description !== undefined && data.description) {
    const descError = validators.maxLength(data.description, 500, 'Description');
    if (descError) errors.push({ field: 'description', message: descError });
  }

  if (data.members !== undefined) {
    const membersArrayError = validators.array(data.members, 'Members');
    if (membersArrayError) {
      errors.push({ field: 'members', message: membersArrayError });
    } else {
      const membersLengthError = validators.maxArrayLength(data.members, 50, 'Members');
      if (membersLengthError) errors.push({ field: 'members', message: membersLengthError });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export constants for use in components
export const VALIDATION_LIMITS = {
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_RECIPIENTS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENTS_SIZE,
};
