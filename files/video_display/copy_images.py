##### Copy all images in a directory to another directory
# import glob
# import shutil
# import os
# src_dir = "D:/LYM/Toronto/2023Fall/ECE1724F1(Wearable_AI)/Project-Website/video_display/images"
# dst_dir = "copy_images"
# image_extensions = ["*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.tiff"]
# for extension in image_extensions:
#     for jpgfile in glob.iglob(os.path.join(src_dir, extension)):
#         shutil.copy(jpgfile, dst_dir)



##### Delete the contents of a folder
# import os, shutil
# folder = 'copy_images'
# for filename in os.listdir(folder):
#     file_path = os.path.join(folder, filename)
#     try:
#         if os.path.isfile(file_path) or os.path.islink(file_path):
#             os.unlink(file_path)
#         elif os.path.isdir(file_path):
#             shutil.rmtree(file_path)
#     except Exception as e:
#         print('Failed to delete %s. Reason: %s' % (file_path, e))


#####  Copy all image files generated in the last two minutes from one folder to another
import os
import shutil
from datetime import datetime, timedelta
src_dir = 'D:/Edge Downloads'
dst_dir = 'copy_images'
image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']
now = datetime.now()
time_delta = now - timedelta(minutes=2)
for filename in os.listdir(src_dir):
    file_path = os.path.join(src_dir, filename)
    if os.path.isfile(file_path) and os.path.splitext(filename)[1].lower() in image_extensions:
        file_timestamp = datetime.fromtimestamp(os.path.getctime(file_path))
        if file_timestamp > time_delta:
            shutil.copy(file_path, dst_dir)

print("Files copied successfully.")

