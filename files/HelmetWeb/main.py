import gmplot 
import os
import pygsheets
import http.server
import socketserver
from os import path
import time

my_host_name = 'localhost'
my_port = 3000
my_html_folder_path = 'C:\\Users\\lyhsd\\Desktop\\Helmet'
latitude_list = []

def getGoogleGPS():
    client = pygsheets.authorize(service_file = "testpygsheets.json")
    # 打开谷歌表格testPygSheets
    sh = client.open('GPS')
    #获取表格中的而第一张工作表
    wks = sh.sheet1
    # 更新A1数据
    latitude_list = wks.get_col(2, include_tailing_empty=False)[1:]
    longitude_list = wks.get_col(3, include_tailing_empty=False)[1:]

    latitude_list = [float(item) for item in latitude_list]
    longitude_list = [float(item) for item in longitude_list]
    print(longitude_list)

    file_path = "C:\\Users\\lyhsd\\Desktop\\Helmet\\sheet.html"
    
    #latitude_list = [ 30.3358376, 30.307977, 30.3216419, 30.3358376] 
    #longitude_list = [ 77.8701919, 78.048457, 78.0413095,77.9201919]
    
    gmap3 = gmplot.GoogleMapPlotter(latitude_list[0], 
                                    longitude_list[0], 13) 
    
    # scatter method of map object  
    # scatter points on the google map 
    gmap3.scatter( latitude_list, longitude_list, '# FF0000', 
                                size = 20, marker = False ) 
    
    # Plot method Draw a line in 
    # between given coordinates 
    gmap3.plot(latitude_list, longitude_list,  
            'cornflowerblue', edge_width = 2.5) 
    
    gmap3.draw(file_path)
    print("finish draw")

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
            content_path = path.join(my_html_folder_path, "index.html")
        elif self.path == '/route':
            getGoogleGPS()
            print(latitude_list)
            print("after call")
            content_path = path.join(my_html_folder_path, "sheet.html")
        else:
            content_path = path.join(my_html_folder_path, "second.html")
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

