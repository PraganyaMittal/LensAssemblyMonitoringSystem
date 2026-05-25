import os

replacements = [
    ('GenerationNo', 'GenerationNo'),
    ('generationNo', 'generationNo'),
    ('Generation no.', 'Generation no.'),
    ('Generation no.', 'Generation no.'),
    ('generationNo', 'generationNo'),
    ('GenerationNo', 'GenerationNo'),
    ('IDC_GENERATION_NO', 'IDC_GENERATION_NO'),
    ('IDC_STATUS_GENERATIONNO', 'IDC_STATUS_GENERATIONNO')
]

skip_exts = ['.dll', '.exe', '.png', '.zip', '.woff', '.woff2', '.ttf']
skip_dirs = ['node_modules', 'bin', 'obj', '.git', '.vscode']

def run():
    for root, dirs, files in os.walk(r'c:\Projects\MODAL MANAGEMENT\Github Code\6 apr latest\FactoryMonitoring'):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for file in files:
            if any(file.endswith(ext) for ext in skip_exts):
                continue
                
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                orig = content
                for old, new in replacements:
                    content = content.replace(old, new)
                    
                if content != orig:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f'Updated {path}')
            except Exception as e:
                pass

if __name__ == "__main__":
    run()
