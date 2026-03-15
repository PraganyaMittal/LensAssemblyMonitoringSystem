


export interface UpdatePackage {
    updatePackageId: number;
    packageName: string;
    packageType: 'Bundle';
    version: string;
    fileName: string;
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

export interface UploadPackageRequest {
    file: File;
    packageName: string;
    packageType: 'Bundle';
    version: string;
    description?: string;
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
    packageName: string;
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

export interface MCTarget {
    mcId: number;
    lineNumber: number;
    mcNumber: number;
    modelVersion: string;
    isOnline: boolean;
    
    agentVersion?: string;
    serviceVersion?: string;
    autoUpdaterVersion?: string;
    laiVersion?: string;
    ipcConnected?: boolean;
    ipcLastPingMs?: number;
}





export interface LAIScanResult {
    success: boolean;
    errorMessage?: string;
    version?: string;
    packageName?: string;
    releaseNotes?: string;
    buildDate?: string;
    verifiedBy?: string;
    fileSizeBytes?: number;
}

export interface LAIRegisterRequest {
    networkPath: string;
    version: string;
    packageName: string;
    releaseNotes?: string;
    targetLineNumber: number;
    registeredBy?: string;
}

export interface LAIRelease {
    laiReleaseId: number;
    version: string;
    sharedPath: string;
    packageName: string;
    releaseNotes?: string;
    targetLineNumber: number;
    registeredBy: string;
    registeredDateUtc: string;
    status: 'Registered' | 'Deploying' | 'Completed' | 'Failed';
    completedDateUtc?: string;
    errorMessage?: string;
}
