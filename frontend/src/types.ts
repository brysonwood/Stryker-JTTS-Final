export interface SessionUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface CustomerSummary {
  id: number;
  name: string;
  billing?: string | null;
}

export interface TaskRecord {
  id: number;
  description: string;
  estimatedHrs?: number | null;
  status: string;
}

export interface PartRecord {
  id: number;
  sku: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  taxFlag: boolean;
}

export interface TimeEntryRecord {
  id: number;
  start: string;
  end?: string | null;
  duration?: number | null;
  notes?: string | null;
  billable: boolean;
  userId: number;
  user?: SessionUser;
  task?: TaskRecord | null;
}

export interface PhotoRecord {
  id: number;
  key: string;
  thumbnailKey?: string | null;
  mime: string;
  size: number;
  gps?: unknown;
  createdAt: string;
  uploaderId: number;
  uploader?: SessionUser;
}

export interface JobSummary {
  id: number;
  description: string;
  priority: number;
  status: string;
  estimatedHours?: number | null;
  createdAt: string;
  customer: CustomerSummary;
  assignedTo?: SessionUser | null;
  tasks: TaskRecord[];
}

export interface JobDetailRecord extends JobSummary {
  timeEntries: TimeEntryRecord[];
  parts: PartRecord[];
  photos: PhotoRecord[];
}

export interface LoginResponse extends AuthSession {}

export interface DashboardPoint {
  id: number;
  label: string;
  minutes?: number;
  hours?: number;
  cost?: number;
  count?: number;
  billableHours?: number;
}

export interface DashboardJobRollup {
  id: number;
  label: string;
  customer: string;
  status: string;
  priority: number;
  createdAt: string;
  assignedToId?: number | null;
  assignedTo?: string | null;
  totalHours: number;
  billableHours: number;
  partsCost: number;
}

export interface UserProfileStats {
  assignedJobs: number;
  openJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  timeEntries: number;
  loggedHours: number;
  billableHours: number;
  lastEntryAt?: string | null;
}

export interface UserProfileAssignedJob {
  id: number;
  label: string;
  customer: string;
  status: string;
  priority: number;
  createdAt: string;
}

export interface UserProfileWorkedJob {
  id: number;
  label: string;
  customer: string;
}

export interface UserProfileEntry {
  id: number;
  start: string;
  duration: number;
  billable: boolean;
  notes?: string | null;
  jobId?: number | null;
  jobLabel: string;
  customer: string;
}

export interface UserProfileResponse {
  profile: UserRecord;
  displayName: string;
  stats: UserProfileStats;
  recentAssignedJobs: UserProfileAssignedJob[];
  workedJobs: UserProfileWorkedJob[];
  recentEntries: UserProfileEntry[];
}

export interface UserRecord {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export interface AdminDashboardData {
  windowDays: number;
  generatedAt: string;
  totals: {
    jobs: number;
    timeEntries: number;
    loggedHours: number;
    billableHours: number;
    partsCost: number;
    openJobs: number;
    inProgressJobs: number;
    unassignedJobs: number;
  };
  charts: {
    timeByEmployee: DashboardPoint[];
    billableByEmployee: DashboardPoint[];
    hoursByJob: DashboardPoint[];
    partsCosts: DashboardPoint[];
    jobsByStatus: DashboardPoint[];
    hoursTrend: DashboardPoint[];
  };
  jobs: DashboardJobRollup[];
}