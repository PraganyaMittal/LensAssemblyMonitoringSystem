// TypeScript types for Update Management
// Feature 1: Package Library

export interface UpdatePackage {
    updatePackageId: number;
    packageName: string;
    packageType: 'LAI' | 'Agent';
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
    packageType: 'LAI' | 'Agent';
    version: string;
    description?: string;
}
