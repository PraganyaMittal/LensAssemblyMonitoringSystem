

export interface UpdatePackage {
    updatePackageId: number;
    packageType: 'Bundle' | 'LAI';
    version: string;
    fileName: string;
    storagePath?: string;
    fileSize: number;
    fileHash: string;
    description?: string;
    uploadedBy: string;
    uploadedDate: string;
}

export interface PackageListResponse {
    packages: UpdatePackage[];
    totalCount: number;
    page: number;
    pageSize: number;
}

export type TargetType = 'All' | 'ByVersion' | 'ByLine' | 'SelectedMCs';
export type ScheduleType = 'Immediate' | 'Scheduled';
export type ScheduleStatus = 'Pending' | 'Dispatching' | 'InProgress' | 'Completed' | 'PartiallyCompleted' | 'Cancelled' | 'Failed' | 'Halted';
export type DeploymentStatus = 'Queued' | 'Dispatched' | 'Downloading' | 'Installing' | 'Completed' | 'Failed' | 'Cancelled' | 'Skipped' | 'Blocked';

export interface UpdateSchedule {
    updateScheduleId: number;
    scheduleName: string;
    targetType: TargetType;
    targetFilter?: string;
    scheduleType: ScheduleType;
    scheduledTimeUtc?: string;
    status: ScheduleStatus;
    totalTargetCount: number;
    createdBy: string;
    createdDateUtc: string;
    dispatchedDateUtc?: string;
    completedDateUtc?: string;
    cancelledBy?: string;
    cancelledDateUtc?: string;
    packageType: string;
    packageVersion: string;
    
    completedCount?: number;
    failedCount?: number;
    inProgressCount?: number;
    queuedCount?: number;
    
    isRollback?: boolean;
    originalScheduleId?: number;
    haltReason?: string;
    haltedAtMCId?: number;
}

export interface UpdateDeployment {
    updateDeploymentId: number;
    mcId: number;
    lineNumber?: number;
    mcNumber?: number;
    status: DeploymentStatus;
    attemptCount: number;
    maxAttempts: number;
    previousVersion?: string;
    startedDateUtc?: string;
    completedDateUtc?: string;
    errorMessage?: string;
    
    executionOrder?: number;
    reportedAgentVersion?: string;
    reportedServiceVersion?: string;
    reportedUpdaterVersion?: string;
}

export interface ScheduleListResponse {
    schedules: UpdateSchedule[];
    totalCount: number;
    page: number;
    pageSize: number;
}

export interface ScheduleDetailResponse {
    schedule: UpdateSchedule;
    deployments: UpdateDeployment[];
}

export interface CreateScheduleRequest {
    packageId: number;
    scheduleName: string;
    targetType: TargetType;
    targetFilter?: string;
    scheduleType: ScheduleType;
    scheduledTimeUtc?: string;
}

// Unified scan result used by both Bundle and LAI scanning
export interface ScanResult {
    success: boolean;
    errorMessage?: string;
    version?: string;
    packageName?: string;
    releaseNotes?: string;
    buildDate?: string;
    verifiedBy?: string;
    fileSizeBytes?: number;
    fileHash?: string;
}

// Unified register request for both Bundle and LAI
export interface RegisterPackageRequest {
    networkPath: string;
    version: string;
    fileName?: string;
    releaseNotes?: string;
    fileHash?: string;
    fileSizeBytes?: number;
    registeredBy?: string;
}

// Keep backward compat aliases
export type LAIScanResult = ScanResult;
export type LAIRegisterRequest = RegisterPackageRequest;
