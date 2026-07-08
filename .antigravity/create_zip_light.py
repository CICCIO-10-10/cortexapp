import os
import zipfile

src_dir = r"c:\Users\User\Desktop\PROGETTI\cortex"
dst_zip = r"c:\Users\User\Desktop\cortex_light_review.zip"

allowed_files = {'index.html', 'main.js', 'styles.css', 'theme.css', 'service-worker.js', 'manifest.json', 'firestore.rules'}

with zipfile.ZipFile(dst_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file in allowed_files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, src_dir)
                zipf.write(file_path, arcname)

print(f"Zip leggero salvato con successo in: {dst_zip}")
print("File inclusi:")
with zipfile.ZipFile(dst_zip, 'r') as zipf_read:
    for name in zipf_read.namelist():
        print(f"- {name}")
