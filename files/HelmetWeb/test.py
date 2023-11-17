import socket
import re
 
 
def client_exec(client):
    """根据不同的地址返回不同的页面"""
    # 获取用户发送的数据
    recv_data = client.recv(1024).decode('utf-8')
 
    # 提取用户请求的地址
    match = re.match('[^/]+(/[^ ]*) ', recv_data)
 
    if match:
        # 说明有数据
        recv_path = match.group(1)
        if recv_path == '/':
            recv_path = '/index.html'
    else:
        # 说明没数据
        client.close()
        return
 
    # 响应行
    response_line = 'HTTP/1.1 200 OK\r\n'
 
    # 响应头
    response_head = 'Content-Type: text/html; charset=utf-8\r\n'
 
    # 判断请求地址
    if recv_path == '/index.html':
        response_body = '首页'
    elif recv_path == '/route.html':  # Add this condition for the 'Route' page
        with open('./route.html', 'r') as f:  # Assuming 'route.html' is your Route page
            response_body = f.read()
    elif recv_path == '/second.html':
        with open('./index.html', 'r') as f:
            response_body = f.read()
    else:
        response_line = 'HTTP/1.1 400 NOT FOUND\r\n'
        response_body = '页面不存在'
 
    response_data = response_line + response_head + '\r\n' + response_body
 
    # 发送响应数据
    client.send(response_data.encode('utf-8'))
 
    # 关闭客户端
    client.close()
 
 
def main():
    # 初始化套接字
    tcp_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
 
    # 綁定ip地址和端口(重用)
    tcp_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, True)
    tcp_server.bind(('', 3000))
 
    # 设置被动模式
    tcp_server.listen(128)
 
    # 循环接收用户请求
    while True:
        client, address = tcp_server.accept()
        client_exec(client)
    # 关闭
    tcp_server.close()
 
 
if __name__ == '__main__':
    main()