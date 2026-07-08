import os
import zipfile

src_dir = r"c:\Users\User\Desktop\PROGETTI\cortex"
dst_zip = r"c:\Users\User\Desktop\cortex_review.zip"

excluded_exts = {'.png', '.jpg', '.jpeg', '.svg', '.gif', '.mp3', '.mp4', '.wav', '.ico', '.ttf', '.woff', '.woff2'}
excluded_dirs = {'.firebase', '.agent', '.git', 'node_modules', 'venv', '__pycache__', 'store_assets', 'play_store_package'}

with zipfile.ZipFile(dst_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(src_dir):
        # Exclude forbidden directories
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in excluded_exts:
                continue
            if file.startswith('.env') and not file.endswith('.example') and not file.endswith('.template'):
                continue
                
            file_path = os.path.join(root, file)
            # Skip script itself
            if file == 'create_zip.py':
                continue
                
            arcname = os.path.relpath(file_path, src_dir)
            zipf.write(file_path, arcname)

print(f"Zip salvato con successo in: {dst_zip}")
print("File inclusi:")
with zipfile.ZipFile(dst_zip, 'r') as zipf_read:
    for name in zipf_read.namelist():
        print(f"- {name}")
