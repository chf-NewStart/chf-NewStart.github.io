import gmplot 
import os
import pygsheets
import http.server
import socketserver
from os import path
import time

my_host_name = 'localhost'
my_port = 3000
my_html_folder_path = 'C:\\Users\\lenovo\\Desktop\\1724'
latitude_list = []

def getGoogleGPS():
    #client = pygsheets.authorize(service_file = "testpygsheets.json")
    #sh = client.open('GPS')
    client = pygsheets.authorize(service_file = "googlesheetgps.json")
    sh = client.open('Havenmet')
    wks = sh.sheet1

    latitude_list = wks.get_col(2, include_tailing_empty=False)[1:]
    longitude_list = wks.get_col(3, include_tailing_empty=False)[1:]

    latitude_list = [float(item) for item in latitude_list]
    longitude_list = [float(item) for item in longitude_list]
    print(longitude_list)

    file_path = "C:\\Users\\lenovo\\Desktop\\Helmet\\route.html"

    content = 'function initialize() {var map = new google.maps.Map(document.getElementById("map_canvas"), {zoom: 20,center: new google.maps.LatLng('+str(latitude_list[0])+', '+str(longitude_list[0])+')});'
    content += 'new google.maps.Polyline({clickable: false,geodesic: true,strokeColor: "#6495ED",strokeOpacity: 1.000000,strokeWeight: 2,map: map,path: ['
    for i, latitude in enumerate(latitude_list):
        content += 'new google.maps.LatLng('+ str(latitude)+','+str(longitude_list[i])+'),'
    content += ']});}'

    with open("C:\\Users\\lenovo\\Desktop\\Helmet\\route.html", "r") as route_file:
        route_content = route_file.read()

    script_start = route_content.find('<script type="text/javascript">')
    script_end = route_content.find('</script>')
    insert_position = script_start + len('<script type="text/javascript">')
    modified_content = (
        route_content[:insert_position]
        + content
        + route_content[script_end:]
    )

    with open('gps.html', 'w') as modified_file:
        modified_file.write(modified_content)
