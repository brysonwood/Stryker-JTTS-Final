import type { AdminDashboardData, CustomerSummary, JobDetailRecord, JobSummary, LoginResponse, PartRecord, PhotoRecord, TaskRecord, TimeEntryRecord, UserProfileResponse, UserRecord } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, init);
  let body: any = null;
  try {
    // Some endpoints return empty bodies so we ignore parse errors.
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, body?.error || `Request failed with status ${response.status}`);
  }
  return body as T;
}

function authHeaders(token: string, headers?: HeadersInit) {
  return {
    ...(headers || {}),
    Authorization: `Bearer ${token}`,
  };
}

export function login(email: string, password: string) {
  return requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function logout(token: string) {
  return requestJson<void>('/auth/logout', {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export function refreshAccessToken(refreshToken: string) {
  return requestJson<{ accessToken: string; user?: LoginResponse['user'] }>('/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

export function fetchJobs(token: string) {
  return requestJson<{ jobs: JobSummary[] }>('/jobs', {
    headers: authHeaders(token),
  });
}

export function fetchJob(token: string, jobId: number) {
  return requestJson<{ job: JobDetailRecord }>(`/jobs/${jobId}`, {
    headers: authHeaders(token),
  });
}

export function createTimeEntry(
  token: string,
  payload: {
    jobId: number;
    start: string;
    end?: string;
    duration?: number;
    notes?: string;
    billable?: boolean;
  },
) {
  return requestJson<{ entry: TimeEntryRecord }>('/time-entries', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function initUpload(
  token: string,
  payload: { filename: string; mime: string; size: number; jobId: number },
) {
  return requestJson<{ uploadUrl: string; key: string }>('/media/upload-init', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function completeUpload(
  token: string,
  payload: { key: string; mime: string; size: number; jobId: number },
) {
  return requestJson<{ photo: PhotoRecord }>('/media/complete', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function fetchMediaLink(token: string, photoId: number) {
  return requestJson<{ photo: PhotoRecord; downloadUrl: string }>(`/media/${photoId}`, {
    headers: authHeaders(token),
  });
}

export function deletePhoto(token: string, photoId: number) {
  return requestJson<void>(`/media/${photoId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export function listCustomers(token: string) {
  return requestJson<{ customers: CustomerSummary[] }>('/customers', {
    headers: authHeaders(token),
  });
}

export function createJob(
  token: string,
  payload: { customerId: number; description: string; priority?: number; estimatedHours?: number; assignedToId?: number | null },
) {
  return requestJson<{ job: JobSummary }>('/jobs', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function updateJob(
  token: string,
  jobId: number,
  payload: { description?: string; priority?: number; estimatedHours?: number; assignedToId?: number | null; status?: string },
) {
  return requestJson<{ job: JobSummary }>(`/jobs/${jobId}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function createTask(
  token: string,
  jobId: number,
  payload: { description: string; estimatedHrs?: number; status?: string },
) {
  return requestJson<{ task: TaskRecord }>(`/jobs/${jobId}/tasks`, {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function listParts(token: string, jobId: number) {
  return requestJson<{ parts: PartRecord[] }>(`/jobs/${jobId}/parts`, {
    headers: authHeaders(token),
  });
}

export function addPart(
  token: string,
  jobId: number,
  payload: { sku: string; description?: string; quantity?: number; unitPrice?: number; taxFlag?: boolean },
) {
  return requestJson<{ part: PartRecord }>(`/jobs/${jobId}/parts`, {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function deletePart(token: string, jobId: number, partId: number) {
  return requestJson<void>(`/jobs/${jobId}/parts/${partId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export function listUsers(token: string) {
  return requestJson<{ users: UserRecord[] }>('/users', {
    headers: authHeaders(token),
  });
}

export function fetchUserProfile(token: string, userId: number) {
  return requestJson<UserProfileResponse>(`/users/${userId}/profile`, {
    headers: authHeaders(token),
  });
}

export function createUser(
  token: string,
  payload: { firstName: string; lastName: string; email: string; password: string; role?: string },
) {
  return requestJson<{ user: UserRecord }>('/admin/users', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function updateUser(
  token: string,
  userId: number,
  payload: { firstName?: string; lastName?: string; role?: string; disabled?: boolean; password?: string },
) {
  return requestJson<{ user: UserRecord }>(`/admin/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function createCustomer(
  token: string,
  payload: { name: string; billing?: string },
) {
  return requestJson<{ customer: CustomerSummary }>('/customers', {
    method: 'POST',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function updateTask(
  token: string,
  jobId: number,
  taskId: number,
  payload: { description?: string; estimatedHrs?: number; status?: string },
) {
  return requestJson<{ task: TaskRecord }>(`/jobs/${jobId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

export function fetchAdminDashboard(token: string, days = 30) {
  return requestJson<AdminDashboardData>(`/admin/dashboard?days=${days}`, {
    headers: authHeaders(token),
  });
}

export async function downloadInvoiceDraft(
  token: string,
  options: { format: 'json' | 'csv'; jobId?: number },
) {
  const query = new URLSearchParams({ format: options.format });
  if (options.jobId) {
    query.set('jobId', String(options.jobId));
  }
  const response = await fetch(`${API_BASE}/invoices/export?${query.toString()}`, {
    headers: authHeaders(token),
  });

  // Return the file as a blob with its suggested filename.
  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(response.status, body?.error || `Request failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^\";]+)"?/i);
  const filename = match?.[1] || `invoice-draft.${options.format}`;
  return { blob, filename };
}

export function deleteTimeEntry(token: string, entryId: number) {
  // DELETE /time-entries/:id: remove a time entry (and associated billable hours).
  return requestJson<void>(`/time-entries/${entryId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export function updateUserProfile(
  token: string,
  userId: number,
  payload: { firstName?: string; lastName?: string; email?: string; password?: string; role?: string; disabled?: boolean },
) {
  // PATCH /users/:id: update user profile (used by both admin and self-profile edits).
  return requestJson<{ user: UserRecord }>(`/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(token, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}