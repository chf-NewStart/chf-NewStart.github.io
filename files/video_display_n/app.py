import cv2
from flask import Flask, render_template, url_for, request, jsonify
from avitomp4 import avitomp4
import download_frame
import threading
import os
from urllib.parse import unquote
from urllib.parse import quote
import time
import pygsheets
download_thread = None

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('helmet.html')

@app.route('/convert_video')
def convert_video():
    global download_thread
    if download_thread is None or not download_thread.is_alive() or download_frame.end_flag:
        download_frame.execute_flag = True
        download_thread = threading.Thread(target=download_frame.click_button_repeatedly)
        download_thread.start()
        print("Downloading started")
        download_frame.end_flag = False 
        time.sleep(1)
    else:
        print("Downloading is running")

    image_folder = 'images'
    output_video = 'video.avi'
    image_extension = 'png'

    images = [img for img in os.listdir(image_folder) if img.endswith(f".{image_extension}")]
    frame = cv2.imread(os.path.join(image_folder, images[0]))
    height, width, layers = frame.shape

    output_folder = os.path.join('static', 'video')
    os.makedirs(output_folder, exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*'XVID')
    video_path = os.path.join(output_folder, 'video.mp4')
    video = cv2.VideoWriter(video_path, fourcc, 5, (width, height))

    for image in images:
        img = cv2.imread(os.path.join(image_folder, image))
        video.write(img)

    video.release()

    video_converter = avitomp4()
    input_file_path = os.path.join(os.path.dirname(__file__), output_video)
    output_file_path = video_converter.avi_to_web_mp4(input_file_path)

    # return render_template('video.html', video_url=url_for('static', filename=f'video/{output_file_path}'))
    relative_path = os.path.relpath(output_file_path, os.path.join(os.path.dirname(__file__), 'static', 'video'))
    relative_path = relative_path.replace(os.sep, '/')

    return render_template('video.html', video_url=url_for('static', filename=f'video/{quote(relative_path)}'))

@app.route('/helmet.html')
def helmet():

    download_frame.execute_flag = False
    print("Stop Downloading!")
    return render_template('helmet.html')

@app.route('/get_new_data')
def get_new_data():
    client = pygsheets.authorize(service_file = "googlesheetgps.json")
    sh = client.open('Havenmet')
    wks = sh.sheet1
    date_list = wks.get_col(8, include_tailing_empty=False)[1:]
    
    indexs = [i for i, element in enumerate(date_list) if element == date_list[-1]]

    latitude_list = wks.get_col(2, include_tailing_empty=False)[1:]
    longitude_list = wks.get_col(3, include_tailing_empty=False)[1:]

    latitude_list = [float(latitude_list[i]) for i in indexs]
    longitude_list = [float(longitude_list[i]) for i in indexs]


    
    new_data = {
        'latitudes': latitude_list,
        'longitudes': longitude_list
    }
    print(new_data)

    return jsonify(new_data)

@app.route('/route.html')
def route():
    download_frame.execute_flag = False
    #client = pygsheets.authorize(service_file = "testpygsheets.json")
    #sh = client.open('GPS')
    client = pygsheets.authorize(service_file = "googlesheetgps.json")
    sh = client.open('Havenmet')
    wks = sh.sheet1


    date_list = wks.get_col(8, include_tailing_empty=False)[1:]
    print(date_list)
    late_date = date_list[-1]
    print(date_list[-1])
    selected_value = request.args.get('selected', default=late_date)
    indexs = [i for i, element in enumerate(date_list) if element == selected_value]
    
    date_list = [s.strip() for s in date_list if s.strip()]
    unique_dates = []
    for date in date_list:
        if date not in unique_dates:
            unique_dates.append(date)
    

    std_date_list = wks.get_col(1, include_tailing_empty=False)[1:]
    std_date_list = [s.strip() for s in std_date_list if s.strip()]
    std_unique_dates = []
    for date in std_date_list:
        if date not in std_unique_dates:
            std_unique_dates.append(date)
    
    print(unique_dates)
    print(std_unique_dates)


    latitude_list = wks.get_col(2, include_tailing_empty=False)[1:]
    longitude_list = wks.get_col(3, include_tailing_empty=False)[1:]

    latitude_list = [float(latitude_list[i]) for i in indexs]
    longitude_list = [float(longitude_list[i]) for i in indexs]
    
    return render_template('route.html', stduniquedate = std_unique_dates, selectedvalue = selected_value, dates = unique_dates, latitudes = latitude_list, longitudes = longitude_list)

@app.route('/story.html')
def story():
    download_frame.execute_flag = False
    print("Stop Downloading!")
    return render_template('story.html')

@app.route('/collision.html')
def collision():
    download_frame.execute_flag = False
    print("Stop Downloading!")
    return render_template('collision.html')

@app.route('/about.html')
def about():
    download_frame.execute_flag = False
    print("Stop Downloading!")
    return render_template('about.html')

@app.route('/video.html')
def video():
    download_frame.execute_flag = False
    print("Stop Downloading!")
    return render_template('video.html')

if __name__ == '__main__':
    app.run(debug=True)