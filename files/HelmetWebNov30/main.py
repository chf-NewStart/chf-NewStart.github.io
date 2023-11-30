import gmplot 
import os
import pygsheets
import http.server
import socketserver
from os import path
import time
import gooleGPS

my_host_name = 'localhost'
my_port = 3000
my_html_folder_path = 'C:\\Users\\lenovo\\Desktop\\Helmet'
latitude_list = []

'''
def getGoogleGPS():
    #client = pygsheets.authorize(service_file = "googlesheetgps.json")
    client = pygsheets.authorize(service_file = "testpygsheets.json")
    # 打开谷歌表格testPygSheets
    #sh = client.open('Havenmet')
    sh = client.open('GPS')
    #获取表格中的而第一张工作表
    wks = sh.sheet1
    # 更新A1数据
    date_list = wks.get_col(1, include_tailing_empty=False)[1:]
    late_date = date_list[-1]
    indexs = [i for i, element in enumerate(date_list) if element == late_date]

    latitude_list = wks.get_col(2, include_tailing_empty=False)[1:]
    longitude_list = wks.get_col(3, include_tailing_empty=False)[1:]

    #latitude_list = [float(item) for item in latitude_list]
    #longitude_list = [float(item) for item in longitude_list]
    latitude_list = [float(latitude_list[i]) for i in indexs]
    longitude_list = [float(longitude_list[i]) for i in indexs]
    print(longitude_list)

    file_path = "C:\\Users\\lenovo\\Desktop\\Helmet\\route.html"
    
    #latitude_list = [ 30.3358376, 30.307977, 30.3216419, 30.3358376] 
    #longitude_list = [ 77.8701919, 78.048457, 78.0413095,77.9201919]
    
    gmap3 = gmplot.GoogleMapPlotter(latitude_list[0],longitude_list[0], 13) 
    
    gmap3.scatter( latitude_list, longitude_list, '# FF0000',size = 20, marker = False )  
    gmap3.plot(latitude_list, longitude_list,'cornflowerblue', edge_width = 2.5) 
    gmap3.draw(file_path)

    with open("C:\\Users\\lenovo\\Desktop\\Helmet\\route.html", "r") as route_file:
        route_content = route_file.read()

    with open("headfoot.html", "r") as new_file:
        headfoot = new_file.read()

    with open("style.html", "r") as new_file:
        style = new_file.read()
    
    script_start = route_content.find('</script>')
    script_end = route_content.find('<script type="text/javascript">')

    body_start = route_content.find('<body style="margin:0px; padding:0px;" onload="initialize()">')
    body_end = route_content.find('</body>', body_start)
    

    insert_position = script_start + len('</script>')
    modified_content = (
        route_content[:insert_position]
        + style
        + route_content[insert_position:script_end]
        + headfoot
        + route_content[script_end:]
    )

    with open('route.html', 'w') as modified_file:
        modified_file.write(modified_content)
    
'''

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):

    def _set_headers(self):
        content_path = self.getPath()
        content = self.getContent(content_path)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)

    def getPath(self):
        if self.path == '/':
            content_path = path.join(my_html_folder_path, "helmet.html")
        elif self.path == '/route' or self.path == '/route.html':
            gooleGPS.getGoogleGPS()
            print(latitude_list)
            content_path = path.join(my_html_folder_path, "GPS.html")
        elif self.path == '/collision' or self.path == '/collision.html':
            content_path = path.join(my_html_folder_path, "collision.html")
        elif self.path == '/story' or self.path == '/story.html':
            content_path = path.join(my_html_folder_path, "story.html")
        elif self.path == '/video' or self.path == '/video.html':
            content_path = path.join(my_html_folder_path, "video.html")
        else:
            content_path = path.join(my_html_folder_path, "about.html")
        return content_path

    def getContent(self, content_path):
        with open(content_path, mode='r', encoding='utf-8') as f:
            content = f.read()
        return bytes(content, 'utf-8')

    def do_GET(self):
        self._set_headers()
        self.wfile.write(self.getContent(self.getPath()))


my_handler = MyHttpRequestHandler

with socketserver.TCPServer(("", my_port), my_handler) as httpd:
    print("Http Server Serving at port", my_port)
    print("localhost:3000")
    httpd.serve_forever()


