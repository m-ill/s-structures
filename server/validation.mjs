import { ApiError } from './router.mjs';

export const TEXT_LIMITS = {
  projectName: 120,
  projectDescription: 2000,
  revisionNote: 1000,
};

export function requiredText(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION', `${field} is required.`);
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new ApiError(400, 'VALIDATION', `${field} must be 1-${maxLength} characters.`);
  }
  return text;
}

export function optionalText(value, field, maxLength) {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION', `${field} must be a string.`);
  }
  if (value.length > maxLength) {
    throw new ApiError(400, 'VALIDATION', `${field} must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}
