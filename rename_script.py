import os
import re

# Specific exact string replacements
# We do larger/more specific strings first to avoid partial replacements messing up later ones.
REPLACEMENTS = {
    "FactoryMonitoringSystem": "LensAssemblyMonitoringSystem",
    "factoryMonitoringSystem": "lensAssemblyMonitoringSystem",
    
    "FactoryMonitoringWeb": "LensAssemblyMonitoringWeb",
    "factoryMonitoringWeb": "lensAssemblyMonitoringWeb",
    
    "FactoryMonitoringException": "LensAssemblyMonitoringException",
    
    "FactoryMonitoringDB": "LensAssemblyMonitoringDB",
    
    "FactoryMonitoring": "LensAssemblyMonitoring",
    "factoryMonitoring": "lensAssemblyMonitoring",
    "factory-monitoring": "lens-assembly-monitoring",
    
    "FactoryService": "LensAssemblyService",
    "factoryService": "lensAssemblyService",
    
    "FactoryAgentSingleInstanceMutex": "LensAssemblyAgentSingleInstanceMutex",
    "FactoryAgentClass": "LensAssemblyAgentClass",
    "FACTORYAGENT": "LENSASSEMBLYAGENT",
    "FactoryAgent": "LensAssemblyAgent",
    "factoryAgent": "lensAssemblyAgent",
    
    "factory-react-ui": "lens-assembly-react-ui",
    
    "FactoryDbContextModelSnapshot": "LensAssemblyDbContextModelSnapshot",
    "FactoryDbContext": "LensAssemblyDbContext",
    "factoryDbContext": "lensAssemblyDbContext",
    
    "FactoryMCRepository": "LensAssemblyMCRepository",
    "IFactoryMCRepository": "ILensAssemblyMCRepository",
    "FactoryMCs": "LensAssemblyMCs",
    "FactoryMC": "LensAssemblyMC",
    "factoryMC": "lensAssemblyMC",
    
    "FactoryPC": "LensAssemblyPC",
    "factoryPC": "lensAssemblyPC",
    
    "FactoryUpdatePipe": "LensAssemblyUpdatePipe",
    "FactoryUpdateService": "LensAssemblyUpdateService",
    
    "FactoryLogs": "LensAssemblyLogs",
    "FactoryDownloads": "LensAssemblyDownloads",
    "FactoryUploads": "LensAssemblyUploads",
    
    "factory-main": "lens-assembly-main",
    "factory-sidebar": "lens-assembly-sidebar",
    "factory-theme": "lens-assembly-theme",
    "factory-container": "lens-assembly-container",
}

EXCLUDE_DIRS = {".git", "node_modules", "bin", "obj", ".vs", "x64", "Debug", "Release", "build"}
FILE_EXTENSIONS = {".cs", ".cpp", ".h", ".tsx", ".ts", ".js", ".css", ".sql", ".sln", ".csproj", ".vcxproj", ".filters", ".user", ".html", ".bat", ".md", ".json"}

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return # Skip binary or non-utf8
    
    original = content
    for old, new in REPLACEMENTS.items():
        content = content.replace(old, new)
        
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated content inside: {filepath}")

def main():
    root_dir = r"c:\Projects\MODAL MANAGEMENT\Github Code\16 mar Latest\FactoryMonitoring"
    
    # 1. Update file contents
    print("--- PHASE 1: Content Replacement ---")
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Exclude directories
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext in FILE_EXTENSIONS or filename in ("package.json", "package-lock.json", ".env"):
                filepath = os.path.join(dirpath, filename)
                replace_in_file(filepath)
                
    # 2. Rename files
    print("\n--- PHASE 2: File Renaming ---")
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for filename in filenames:
            new_filename = filename
            for old, new in REPLACEMENTS.items():
                if old in new_filename:
                    new_filename = new_filename.replace(old, new)
            if new_filename != filename:
                old_path = os.path.join(dirpath, filename)
                new_path = os.path.join(dirpath, new_filename)
                os.rename(old_path, new_path)
                print(f"Renamed file: {filename} -> {new_filename}")

    # 3. Rename directories (bottom-up)
    print("\n--- PHASE 3: Directory Renaming ---")
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        for dirname in dirnames:
            if dirname in EXCLUDE_DIRS:
                continue
            new_dirname = dirname
            for old, new in REPLACEMENTS.items():
                if old in new_dirname:
                    new_dirname = new_dirname.replace(old, new)
            if new_dirname != dirname:
                old_path = os.path.join(dirpath, dirname)
                new_path = os.path.join(dirpath, new_dirname)
                os.rename(old_path, new_path)
                print(f"Renamed dir: {dirname} -> {new_dirname}")
                
    # Finally, rename the root directory if we want, but let's just rename contents for now.
    # The workspace root is c:\Projects\MODAL MANAGEMENT\Github Code\16 mar Latest\FactoryMonitoring
    # Renaming the workspace root itself might break the terminal CWD, so let's do that separately or warn.
    new_root_dir = root_dir.replace("FactoryMonitoring", "LensAssemblyMonitoring")
    print(f"\nNOTE: Root directory {root_dir} can be renamed manually to {new_root_dir} if desired.")

if __name__ == "__main__":
    main()
