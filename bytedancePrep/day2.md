



```bash
(base) chf@pls_dont_change ~ % curl --ssl -v https://houfu72.com/ -o /dev/null
```


```bash
</html>
(base) chf@pls_dont_change ~ % curl --ssl -v https://houfu72.com/ -o /dev/null
Warning: --ssl is an insecure option, consider --ssl-reqd instead
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0*   Trying 185.199.109.153:443...
* Connected to houfu72.com (185.199.109.153) port 443 (#0)
* ALPN: offers h2,http/1.1
} [5 bytes data]
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
} [512 bytes data]
*  CAfile: /Users/chf/anaconda3/ssl/cacert.pem
*  CApath: none
{ [5 bytes data]
* TLSv1.3 (IN), TLS handshake, Server hello (2):
{ [122 bytes data]
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
{ [19 bytes data]
* TLSv1.3 (IN), TLS handshake, Certificate (11):
{ [2583 bytes data]
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
{ [264 bytes data]
* TLSv1.3 (IN), TLS handshake, Finished (20):
{ [36 bytes data]
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
} [1 bytes data]
* TLSv1.3 (OUT), TLS handshake, Finished (20):
} [36 bytes data]
* SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256
* ALPN: server accepted h2
* Server certificate:
*  subject: CN=houfu72.com
*  start date: Mar  5 15:18:20 2025 GMT
*  expire date: Jun  3 15:18:19 2025 GMT
*  subjectAltName: host "houfu72.com" matched cert's "houfu72.com"
*  issuer: C=US; O=Let's Encrypt; CN=R11
*  SSL certificate verify ok.
{ [5 bytes data]
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
{ [193 bytes data]
* using HTTP/2
* h2 [:method: GET]
* h2 [:scheme: https]
* h2 [:authority: houfu72.com]
* h2 [:path: /]
* h2 [user-agent: curl/8.1.1]
* h2 [accept: */*]
* Using Stream ID: 1 (easy handle 0x147015000)
} [5 bytes data]
> GET / HTTP/2
> Host: houfu72.com
> User-Agent: curl/8.1.1
> Accept: */*
> 
{ [5 bytes data]
< HTTP/2 200 
< server: GitHub.com
< content-type: text/html; charset=utf-8
< last-modified: Wed, 12 Mar 2025 16:37:56 GMT
< access-control-allow-origin: *
< strict-transport-security: max-age=31556952
< etag: "67d1b864-144c3"
< expires: Thu, 13 Mar 2025 14:04:37 GMT
< cache-control: max-age=600
< x-proxy-cache: MISS
< x-github-request-id: C35E:101F36:EFC24:107414:67D2E38F
< accept-ranges: bytes
< date: Thu, 13 Mar 2025 13:55:24 GMT
< via: 1.1 varnish
< age: 47
< x-served-by: cache-yyz4546-YYZ
< x-cache: HIT
< x-cache-hits: 1
< x-timer: S1741874125.591713,VS0,VE2
< vary: Accept-Encoding
< x-fastly-request-id: 85d6e5cb6c5a869117343e2f17058cef7c9e5ae3
< content-length: 83139
< 
{ [5 bytes data]
100 83139  100 83139    0     0   385k      0 --:--:-- --:--:-- --:--:--  396k
* Connection #0 to host houfu72.com left intact
```

我server的cert是:
```bash
* Server certificate:
*  subject: CN=houfu72.com
*  start date: Mar  5 15:18:20 2025 GMT
*  expire date: Jun  3 15:18:19 2025 GMT
*  subjectAltName: host "houfu72.com" matched cert's "houfu72.com"
*  issuer: C=US; O=Let's Encrypt; CN=R11
*  SSL certificate verify ok.
```
30天，但应该会自动续费

td的是1年：
```bash
* Server certificate:
*  subject: C=CA; ST=Ontario; L=Toronto; jurisdictionC=CA; O=The Toronto-Dominion Bank; businessCategory=Private Organization; serialNumber=1223766; CN=td.com
*  start date: Apr 26 13:16:53 2024 GMT
*  expire date: Apr 26 13:16:52 2025 GMT
*  subjectAltName: host "www.td.com" matched cert's "www.td.com"
*  issuer: C=US; O=Entrust, Inc.; OU=See www.entrust.net/legal-terms; OU=(c) 2014 Entrust, Inc. - for authorized use only; CN=Entrust Certification Authority - L1M
*  SSL certificate verify ok.
} [5 bytes data]
```


你帮我查缺补漏一下吧，所以http是明文交流，不安全。https是加密之后交流，然后server有证书，client在访问前会向server发hello，然后server返回自己的证书，然后client收到，然后发收到给server，server收到，然后他们开始对话？ssl和tls是一样的流程么。我还知道google根据ssl排序重要性，没ssl的google不给高权重不能被轻易搜到。还有什么我需要回答的，我需要知道的

# HTTP/HTTPS 知识点查缺补漏

您的理解基本正确！我来为您补充一些面试中可能需要的关键点：

## SSL/TLS 的区别与演进
- **SSL与TLS关系**：SSL(Secure Sockets Layer)是TLS(Transport Layer Security)的前身
- 现在行业已停用SSL，全部使用TLS，但人们习惯上仍称为"SSL证书"
- **版本演进**：TLS 1.0 → 1.1 → 1.2 → 1.3，每个版本安全性增强、性能提升
- 面试可能问：**PCI DSS合规要求使用TLS 1.2以上版本**

## HTTPS握手过程的精确细节
您描述的基本流程正确，但面试中可能需要更精确描述：
1. **Client Hello**：客户端发送支持的加密套件列表和随机数
2. **Server Hello**：服务器选择加密套件，发送证书和自己的随机数
3. **客户端验证证书**：检查签名、域名、有效期，生成预主密钥(Pre-master secret)
4. **密钥交换**：客户端用服务器公钥加密预主密钥并发送
5. **建立会话**：双方用随机数和预主密钥派生出会话密钥
6. **安全通信**：使用会话密钥进行对称加密通信

## 面试常见问题
1. **HTTPS如何防止中间人攻击？**
   - 证书验证确保与真实服务器通信
   - 公钥加密确保只有服务器能解密会话建立消息
   - HSTS防止降级攻击

2. **HTTPS常见安全问题**
   - 证书配置错误：过期、域名不匹配、自签名
   - 弱密码套件：支持已知有漏洞的加密算法
   - 混合内容：HTTP资源嵌入到HTTPS页面
   - TLS版本过低：如仍支持TLS 1.0/1.1

3. **性能相关**
   - HTTPS比HTTP慢多少？现代实现下差异很小(约10%延迟)
   - 有哪些HTTPS优化技术？会话复用、OCSP stapling、HTTP/2多路复用

4. **支付系统特有考虑**
   - 双向验证（客户端也需证书）
   - 传输敏感信息的额外加密层
   - PCI DSS合规要求

## 字节测试面试可能问到的技术问题
1. **如何测试HTTPS实现？**
   - 证书验证测试（有效期、信任链、域名）
   - 安全头部测试（HSTS, CSP等）
   - 密码套件测试（禁用弱算法）
   - 协议降级攻击测试

2. **HTTPS测试工具有哪些？**
   - 命令行：OpenSSL, curl, nmap
   - 图形界面：SSL Labs, Qualys SSL Tester
   - 拦截代理：Burp Suite, OWASP ZAP
   - 系统测试：TestSSL.sh

3. **HTTPS对API测试有何影响？**
   - 证书验证处理（忽略或固定）
   - 抓包分析需要额外配置


# HTTP状态码详解

## 状态码分类

HTTP状态码是服务器响应请求时返回的三位数字，分为五大类：

| 分类 | 范围 | 含义 | 测试关注点 |
|-----|-----|-----|----------|
| 1xx | 100-199 | 信息性响应 | 很少测试重点，主要是协议操作 |
| 2xx | 200-299 | 成功 | 数据正确性、响应格式、性能 |
| 3xx | 300-399 | 重定向 | 重定向链完整性、SEO、缓存行为 |
| 4xx | 400-499 | 客户端错误 | 输入验证、权限控制、资源访问 |
| 5xx | 500-599 | 服务器错误 | 服务稳定性、容错能力、监控告警 |

## 必须掌握的核心状态码

### 2xx - 成功状态码

| 状态码 | 含义 | 测试场景 |
|-------|-----|---------|
| **200 OK** | 请求成功 | API返回正确数据、页面正常加载 |
| **201 Created** | 资源创建成功 | 创建用户、上传文件、支付成功 |
| **204 No Content** | 成功但无返回内容 | 删除操作、点赞功能、清空购物车 |

### 3xx - 重定向状态码

| 状态码 | 含义 | 测试场景 |
|-------|-----|---------|
| **301 Moved Permanently** | 永久重定向 | 网站迁移、HTTP→HTTPS、URL规范化 |
| **302 Found** | 临时重定向 | 登录后重定向、维护页面、A/B测试 |
| **304 Not Modified** | 资源未变化 | 缓存验证、资源优化、减少带宽 |

### 4xx - 客户端错误状态码

| 状态码 | 含义 | 测试场景 |
|-------|-----|---------|
| **400 Bad Request** | 请求语法错误 | 表单验证、参数格式错误、JSON格式错误 |
| **401 Unauthorized** | 未认证 | 登录失败、token过期、需要登录 |
| **403 Forbidden** | 已认证但无权限 | 角色权限测试、IP限制、地域限制 |
| **404 Not Found** | 资源不存在 | 无效URL、删除后访问、路由不存在 |
| **405 Method Not Allowed** | 不支持的HTTP方法 | PUT/DELETE限制、API方法限制 |
| **429 Too Many Requests** | 请求频率超限 | 限流测试、DOS防护、API限速 |

### 5xx - 服务器错误状态码

| 状态码 | 含义 | 测试场景 |
|-------|-----|---------|
| **500 Internal Server Error** | 服务器内部错误 | 程序异常、未捕获错误、数据库问题 |
| **502 Bad Gateway** | 网关错误 | 服务器过载、上游服务不可用、超时 |
| **503 Service Unavailable** | 服务不可用 | 定期维护、服务降级、系统过载 |
| **504 Gateway Timeout** | 网关超时 | 长时间操作、后端服务慢、网络问题 |

## 支付系统特有状态码考虑

国际支付系统中，状态码使用有特殊要求：

1. **认证相关**
   - 401应区分"密码错误"和"账户锁定"等不同情况
   - 两步验证失败通常使用**428 Precondition Required**

2. **交易处理**
   - 支付处理中使用**202 Accepted**表示交易已接受但处理中
   - 资金不足应使用**402 Payment Required**或自定义422状态
   - 风控拦截通常使用**403 Forbidden**或自定义451状态

3. **国际化考虑**
   - 地区限制使用**451 Unavailable For Legal Reasons**
   - 货币不支持使用**422 Unprocessable Entity**

## 测试中的状态码验证要点

1. **正向流程**
   - 验证成功操作返回正确的2xx状态码
   - 确认重定向场景使用正确的3xx状态码

2. **边界条件与错误场景**
   - 每种客户端错误有专门的4xx状态码
   - 服务端异常有对应的5xx状态码
   - 非法输入、越界值测试应返回对应4xx码

3. **安全测试**
   - 未授权访问应返回401或403
   - SQL注入尝试应返回400而非500(泄露错误)
   - 限流机制激活应返回429

4. **性能测试**
   - 高负载下关注502/503/504比例
   - 连接数超限通常返回503

## 状态码与响应体的关系

1. **错误状态码必须有明确的错误信息**
   ```json
   {
     "status": "error",
     "code": "INVALID_AMOUNT",
     "message": "金额必须是正数且不超过50000元"
   }
   ```

2. **状态码是HTTP层面，业务状态在响应体中**
   - API可能返回200 OK但业务处理失败
   - 测试应同时验证状态码和响应体内容

## 面试回答技巧

当被问到状态码时：
1. 先简要介绍分类（1xx-5xx的含义）
2. 重点讲解常见状态码（200、404、500等）
3. 结合支付业务场景举例说明
4. 展示测试思维：如何设计测试验证不同状态码

您还有关于HTTP状态码的具体问题吗？或者想了解API测试的其他方面？

> 点赞不能返回状态么，点赞不是会影响ui么，难道不是点赞-返回activate状态-ui改变？我有题就是问微信点赞如何测试？
# 点赞功能的状态返回与测试

您提出了非常好的问题！让我澄清并详细解释:

## 点赞API的状态码选择

实际上，点赞功能有两种常见API设计方式：

1. **返回204 No Content**
   - 优点：减少数据传输，提高性能
   - 缺点：前端需预先处理UI变化
   - 应用场景：高并发、简单交互

2. **返回200 OK + 数据**
   ```json
   {
     "status": "success",
     "liked": true,
     "count": 42,
     "animation": "heart"
   }
   ```
   - 优点：可返回最新点赞数、用户状态等
   - 缺点：增加传输数据量
   - 应用场景：需要实时计数、复杂交互

## 微信点赞的实际工作流程

微信实际使用的是第二种方式，完整流程是：

1. 用户点击点赞按钮
2. 前端先乐观更新UI(立即反馈)
3. 同时发送API请求到服务器
4. 服务器处理并返回200 OK+实际状态
5. 前端根据返回数据微调UI(如果与预期不同)

## 微信点赞功能测试方案

这是个典型面试题，需全面思考测试策略：

### 1. 功能测试
- **基本流程**：点赞、取消点赞动作是否正确触发和显示
- **计数正确性**：点赞数增减是否准确
- **状态同步**：多设备登录同一账号，点赞状态是否同步
- **历史数据**：退出再进入，点赞状态是否保留

### 2. 界面测试
- **动画效果**：点赞动效是否流畅(微信有心形放大动画)
- **UI一致性**：按钮状态、颜色变化是否符合设计
- **多设备适配**：在不同屏幕尺寸设备上显示是否正常

### 3. 性能测试
- **响应速度**：点赞操作反馈是否及时(≤200ms)
- **高并发**：多人同时点赞同一内容的处理
- **网络波动**：弱网环境下点赞体验和状态恢复

### 4. 容错测试
- **网络中断**：离线点赞后联网，状态是否同步
- **点赞失败**：服务器拒绝时UI是否恢复
- **快速点击**：频繁点击是否正确处理(防抖动)

### 5. 安全测试
- **权限控制**：非好友关系是否能点赞
- **注销账号**：点赞数据处理
- **注入攻击**：尝试修改点赞计数的安全防护

### 6. 特殊场景
- **被删除内容**：点赞的内容被删除后状态处理
- **超大点赞数**：显示999+等特殊处理是否正确
- **自动点赞**：使用脚本模拟快速点赞是否有限流

### 测试报告示例
对于面试，可以提供测试例子：
```
TC-001: 点赞功能基本流程
前置条件: 用户已登录微信，进入朋友圈
步骤:
1. 点击朋友圈文章下方"赞"按钮
预期结果: 
- "赞"图标变为已点赞状态(变色)
- 点赞数字+1
- 用户名出现在点赞列表中
- 网络请求发送POST到服务器
- 返回200状态码和更新后数据
```

这个测试方案展示了您的全面测试思维，从功能、UI、性能到安全都有考虑，非常适合字节跳动测试开发面试使用。

> 但我有个问题，为什么这个也是用http状态码，微信不是网页啊


# 移动应用与HTTP状态码的关系

您提出了非常专业的问题！这涉及到应用架构的理解。

## 原生应用也使用HTTP协议

尽管微信是原生应用而非网页，但：

1. **所有现代应用的后台通信基础**：
   - 原生应用（iOS/Android）与服务器通信主要使用HTTP/HTTPS协议
   - 即使是原生UI，数据传输仍遵循Web协议标准

2. **API通信模式**：
   - 微信的点赞操作发送API请求到腾讯服务器
   - 这些请求使用标准HTTP方法（通常是POST或PUT）
   - 服务器返回标准HTTP状态码和JSON响应

## 微信的具体网络实现

微信确实有些特殊，它使用混合通信架构：

1. **长连接通信**：
   - 微信使用自研的Mars协议栈维持长连接（消息推送、聊天）
   - 这是定制协议，优化了移动网络性能

2. **HTTP通信**：
   - 朋友圈、公众号文章、点赞等功能仍使用HTTP/HTTPS
   - 图片、视频等资源通过HTTPS下载
   - 这部分遵循标准HTTP状态码

## 点赞功能的技术实现

微信点赞功能的技术实现可能是：

```
用户点赞 → 
原生UI立即反馈 → 
APP发起HTTP POST请求 → 
服务器处理返回HTTP 200 + JSON数据 → 
APP解析响应更新UI状态
```

## 测试视角

测试微信点赞功能时需考虑：

1. **网络层测试**：
   - 使用网络代理工具（如Charles）捕获APP的HTTP请求
   - 验证请求格式、响应状态码和数据格式

2. **API测试**：
   - 模拟客户端发送点赞请求
   - 验证各种状态码处理（200正常、403权限不足等）

3. **UI测试**：
   - 不同网络状态下UI反馈（离线、弱网等）
   - 错误状态码下的UI处理

这种理解展示了您对移动应用内部工作原理的深入认识，这在字节跳动测试开发面试中是很大的加分项！


> 我有个问题，我把我前女友删了，但是她给我朋友圈点过的赞还在，是为什么，能看出来什么

# 从技术角度分析微信朋友圈点赞数据处理机制

您的问题实际上涉及微信的数据存储架构和关系处理策略，这是测试中需要考虑的重要边界场景。

## 技术原因分析

这种现象反映了微信的数据库设计策略：

1. **数据分离存储**：
   - 好友关系数据和交互数据(点赞)分别存储在不同数据表
   - 解除好友关系不会级联删除历史交互记录
   
2. **数据完整性保护**：
   - 保留点赞数据维护内容完整性和准确性
   - 删除好友是关系变更，不等同于抹除历史行为

3. **性能考虑**：
   - 级联删除所有相关数据在大型系统中开销很大
   - 保留数据避免复杂的事务处理和一致性问题

## 从测试角度看

这是典型的**边界测试场景**，在测试社交应用时需要关注：

1. **用户关系变更测试**：
   - 好友删除后的数据可见性
   - 历史交互记录的处理策略

2. **数据一致性测试**：
   - 点赞计数是否准确
   - 用户删除后点赞列表中的展示方式

3. **性能影响测试**：
   - 关系变更操作对系统性能影响
   - 大量数据处理的延迟情况

## 技术实现猜测

微信可能采用类似这样的数据模型：
```
用户表(Users) ↔ 好友关系表(Friendships) 
内容表(Posts) ↔ 互动表(Interactions)
```

删除好友只影响`Friendships`表，而不影响`Interactions`表中的历史记录。

这种设计体现了数据完整性和系统性能之间的权衡，这也是测试大型分布式系统时需要关注的重要方面。


> 有意思。可以仔细讲讲这个么
## 测试视角

测试微信点赞功能时需考虑：

网络层测试：
使用网络代理工具（如Charles）捕获APP的HTTP请求
验证请求格式、响应状态码和数据格式

API测试：
模拟客户端发送点赞请求
验证各种状态码处理（200正常、403权限不足等）

UI测试：
不同网络状态下UI反馈（离线、弱网等）
错误状态码下的UI处理

# 深入测试微信点赞功能 - 完整测试方案

## 1. 网络层测试详解

### 抓包分析
使用Charles/Fiddler/mitmproxy等代理工具分析APP网络请求：

**具体步骤**：
1. 设置移动设备代理(WiFi设置 → 配置代理)
2. 安装Charles根证书(解密HTTPS)
3. 过滤"朋友圈/点赞"相关请求
4. 触发点赞操作并捕获请求

**捕获分析**：
```http
POST https://api.weixin.qq.com/cgi-bin/moments/like
Content-Type: application/json
Authorization: Bearer xxxx...

{
  "content_id": "12345678",
  "scene": 1,
  "action": 1  // 1=点赞, 0=取消点赞
}
```

**响应分析**：
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "ret": 0,
  "errmsg": "ok",
  "like_status": 1,
  "total_count": 42
}
```

### 网络测试场景
1. **正常网络**：验证请求/响应格式、参数加密
2. **弱网模拟**：
   - 使用Charles的Throttle功能限制带宽至2G网络(50KB/s)
   - 验证重试机制和超时处理
3. **网络异常恢复**：
   - 触发点赞→立即切断网络→恢复网络
   - 验证同步机制是否正常工作

### 安全测试
1. **请求篡改**：修改请求参数尝试给其他人的内容点赞
2. **重放攻击**：重复发送相同请求测试服务器防重放机制
3. **频率限制**：短时间内发送多次请求测试限流机制

## 2. API测试深入

### 模拟客户端
使用Postman或自动化脚本模拟客户端：

**Python模拟请求示例**：
```python
import requests

def test_like_api():
    headers = {
        'Authorization': 'Bearer xxx',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'content_id': '12345678',
        'scene': 1,
        'action': 1
    }
    
    response = requests.post(
        'https://api.weixin.qq.com/cgi-bin/moments/like',
        headers=headers,
        json=payload
    )
    
    assert response.status_code == 200
    assert response.json()['ret'] == 0
    assert response.json()['like_status'] == 1
```

### 状态码与异常场景测试
系统地测试各种返回状态：

1. **200 OK**：正常点赞/取消
2. **400 Bad Request**：
   - 参数错误(缺少content_id)
   - 格式错误(非JSON)
3. **401 Unauthorized**：
   - 未登录或token过期
   - 测试方法: 使用过期token发送请求
4. **403 Forbidden**：
   - 无权限(点赞已删除内容)
   - 被对方拉黑但尝试点赞
5. **429 Too Many Requests**：
   - 快速点赞触发频率限制
   - 测试方法: 1秒内发送10次点赞请求
6. **500/502 Server Error**：
   - 服务端异常处理
   - 测试方法: 服务降级时的行为

### 业务规则验证
1. **重复点赞**：对已点赞内容再次点赞
2. **点赞权限**：非好友可见内容的点赞权限
3. **特殊内容**：
   - 长文章vs短内容点赞
   - 带图片vs纯文本点赞
   - 视频内容点赞

## 3. UI测试扩展

### 自动化UI测试
使用Appium或UITEST框架：

**测试脚本示例(Appium+Python)**：
```python
def test_like_button_ui():
    # 定位并点击点赞按钮
    like_button = driver.find_element_by_id("com.tencent.mm:id/like_button")
    initial_state = like_button.get_attribute("selected")
    like_button.click()
    
    # 等待网络请求完成
    WebDriverWait(driver, 5).until(
        lambda x: like_button.get_attribute("selected") != initial_state
    )
    
    # 验证UI状态变化
    assert like_button.get_attribute("selected") != initial_state
    
    # 验证点赞数变化
    like_count = driver.find_element_by_id("com.tencent.mm:id/like_count")
    assert int(like_count.text) > 0
```

### 视觉效果测试
微信点赞有特殊动画效果：

1. **动画测试**：
   - 使用录屏分析动画帧率(应≥30fps)
   - 测量动画时长(通常300-500ms)
2. **视觉一致性**：
   - 使用Applitools等工具比较不同设备UI一致性
   - 检查字体、颜色、图标是否符合设计规范

### 离线测试场景
1. **离线点赞**：
   - 飞行模式下点赞
   - 恢复网络后同步状态
2. **快速切换场景**：
   - 点赞时立即切换到其他页面
   - 验证后台同步机制

### 用户体验测试
1. **触摸区域测试**：
   - 测试点赞按钮的有效触摸区域是否足够大(≥44pt)
   - 测试误触发概率
2. **性能影响**：
   - 测量点赞操作前后内存使用变化
   - 电量消耗测试(批量操作)

## 测试自动化策略

对于字节跳动这样的公司，完整的测试自动化非常重要：

1. **分层测试架构**：
   - 单元测试: 点赞业务逻辑
   - 集成测试: API响应处理
   - E2E测试: 完整点赞流程

2. **CI/CD集成**：
   - 提交代码自动触发API测试
   - 夜间运行完整UI测试套件
   - 性能基准测试自动比较

3. **测试数据管理**：
   - 使用模拟服务器(Mock Server)提供稳定测试数据
   - 构建独立测试环境隔离生产数据

这种全方位测试方法不仅验证功能正确性，还确保用户体验的流畅和系统性能的稳定，完全符合字节跳动对测试开发工程师的期望。面试中展示这种深入思考和系统化测试方法，会给面试官留下很专业的印象。


> 这个charles根证书是什么，如果有这个岂不是可以随便破译https了？

# Charles根证书和HTTPS安全性详解

您提出了一个非常专业的网络安全问题！这确实涉及到HTTPS的核心安全机制。

## Charles根证书的工作原理

Charles(和Fiddler、mitmproxy等工具)实际上是在执行一个**受控的中间人攻击**：

```
设备 ←→ Charles代理 ←→ 服务器
```

正常HTTPS连接中：
- 设备直接与服务器建立加密连接
- 只有设备和服务器能解密通信内容

使用Charles时：
1. 设备与Charles建立第一个加密连接
2. Charles与真实服务器建立第二个加密连接
3. Charles在中间解密、查看、再加密数据

## 为什么需要安装根证书？

安装Charles根证书告诉您的设备："信任Charles签发的证书"。这样当Charles动态生成伪造的"weixin.qq.com"证书时，您的设备不会显示安全警告。

## 安全隐患与防护

您的担忧非常正确！这确实存在安全风险：

### 潜在风险
如果用户安装了恶意根证书，攻击者确实可以：
- 解密HTTPS流量
- 查看敏感信息
- 篡改通信内容

### 系统防护措施
1. **操作系统警告**：
   - iOS/Android要求用户手动确认安装根证书
   - iOS需要在设置中额外启用证书

2. **应用程序防护**：
   - **证书固定(Certificate Pinning)**：微信、银行APP等会硬编码预期的证书信息
   - 即使安装了Charles证书，启用了证书固定的应用仍会拒绝连接

例如尝试抓包微信、支付宝等金融功能时，通常会看到：
```
SSL Handshake Failed: 客户端拒绝了证书
```
这就是证书固定在保护通信安全。

## 测试人员的平衡点

作为测试开发工程师，理解这些机制很重要：
1. **合理使用**：仅在开发测试环境使用抓包工具
2. **测试证书固定**：验证敏感应用是否正确实现了证书固定机制
3. **安全审计**：检测是否有未实现证书固定的安全隐患

在字节跳动面试中，展示这种安全意识是一个很大的加分项，特别是对于处理支付数据的国际业务！


> 硬核一点的需要上手的问题：
>  1.导入员工信息数据的软件界面，怎么做测试
> 2.有一个界面的菜单字符显示不居中，开发人员修复后，如何进行回归测试
> 3.一段代码，边界问题


> 1 导入员工信息数据的软件界面，怎么做测试

```python
import pandas as pd # pandas not panda


test_cases = [
    ("valid.csv", "success!"),#happy path
    ("empty.csv", "err, file empty"), #unhappy, empty file
    ("whatisthis.txt", "err, wrong file type"), # unhappy, wrong file type
    ("noinfo.csv", "err, no info found"),# unhappy, missing info
]

def import_data(file):
    if file[-3:]!="csv":
        return "err, wrong file type"
    try:
        data = pd.read_csv(file) # dont forget the file
        if data.isnull().values.any():
            return "err, no info found"
        elif data.empty: # not empty()
            return "err, file empty"
    except Exception as e:
        return f"err, {e}"

    return "success!" # 是success！而不是success


def test_import_data(case):
    for file, expacted in case:
        assert import_data(file) == expacted, f"failed. for file {file}, expected {expacted}"

test_import_data(test_cases)

```

> 2.有一个界面的菜单字符显示不居中，开发人员修复后，如何进行回归测试

```python
from selenium import webdriver
from selenium.webdriver.common.by import By

def test_alignment():
    driver = webdriver.Chrome()
    driver.get("https://target.com")

    # get elem
    menu_item = driver.find_element(By.CSS_SELECTOR, ".menu-item")
    container = driver.find_element(By.CSS_SELECTOR, ".menu-container")

    # get position
    menu_item_rect = menu_item.rect
    container_rect = container.rect

    # center point
    menu_center_x = menu_rect['x'] + menu_rect['width'] / 2
    container_center_x = container_rect['x'] + container_rect['width'] / 2
    
    # 验证居中 (允许1-2像素的误差)
    assert abs(menu_center_x - container_center_x) <= 2, "菜单文本未居中"
    
    driver.quit()    
```

> 3.一段代码，边界问题

```python
def agefunc(age):
    if age >=0 and age < 18: 
        return "kid"
    elif age >=18 and age< 60:
        return  "working force"
    else:
        return "elder"

test_cases = [
    (0, "kid"),
    (18, "working force"),
    (60, "elder"),
    (360, "elder")
]

def test_agefunc(case):
    """
    test age functions using 0,18,60,360, detail see testcases above
    """
    for age, cat in case:
        assert agefunc(age) == cat

test_agefunc(test_cases)

```

让我们从第一个实际练习开始：为登录功能设计测试用例。

### 登录功能测试用例设计

**功能描述**：用户可以通过账号和密码登录系统，系统验证后允许访问或显示错误信息。

**测试用例**：

1. **正常登录测试**
   - 输入正确的用户名和密码
   - 预期结果：登录成功，跳转到主页

2. **密码错误测试**
   - 输入正确的用户名，错误的密码
   - 预期结果：登录失败，显示"密码错误"提示

3. **用户名不存在测试**
   - 输入不存在的用户名和任意密码
   - 预期结果：登录失败，显示"用户不存在"提示

4. **空字段测试**
   - 测试1：用户名为空，密码有值
   - 测试2：用户名有值，密码为空
   - 测试3：用户名和密码都为空
   - 预期结果：无法提交表单，显示必填字段提示

5. **长度边界测试**
   - 测试1：用户名达到最大长度(例如50字符)
   - 测试2：用户名超过最大长度
   - 测试3：密码达到最小长度(例如6字符)
   - 测试4：密码低于最小长度
   - 预期结果：符合要求的可登录，不符合要求的显示错误提示

6. **特殊字符测试**
   - 测试1：用户名包含特殊字符(如@#$%)
   - 测试2：密码包含特殊字符
   - 预期结果：根据系统规则决定是否允许

7. **SQL注入测试**
   - 在用户名或密码字段输入SQL注入语句，如 `' OR 1=1 --`
   - 预期结果：登录失败，不出现SQL错误

8. **记住登录测试**
   - 测试1：勾选"记住我"选项并登录
   - 测试2：关闭浏览器后重新打开
   - 预期结果：勾选后，关闭浏览器重新打开不需要重新登录

9. **锁定账户测试**
   - 连续输入错误密码多次(例如5次)
   - 预期结果：账户被锁定，显示相应提示

10. **会话超时测试**
    - 登录后保持不活动状态一段时间(例如30分钟)
    - 预期结果：会话超时，需要重新登录



```python

test_cases = [
    (("usr123", "123456"),"success")
    (("usr123", "123426"),"err, wrong pwd")
    (("usr0", "123456"),"err, user does not exist")
    (("usr0", "1234522121216"),"err, user does not exist")
    (("", "123456"),"err, empty username")
]

def test_signin(case):
    for usr, expected in case:
        usr_name = usr[0]
        if not usr_name:
            return "err, user does not exist"
        usr_pwd = usr[1]
        # here i send those by postman from client to server
        # parse the response
        # get code and pwd
        if code!=200 and usr_name not in list?:
            return "err, usr does not exist"
        
        if usr_pwd == pwd:
            return "success"
        if usr_pwd != required_pwd:
            return "err, wrong pwd"

test_signin(test_cases)

```


> sorting

不同的排序算法适合不同类型的数字串，选择合适的排序算法需要考虑多种因素：

1. **快速排序(Quick Sort)** - 适合大多数随机数据
   - 优点：平均情况下效率高，时间复杂度 O(n log n)
   - 缺点：最坏情况下可能退化为 O(n²)
   - 适用场景：大型随机数据集，如用户成绩统计

2. **归并排序(Merge Sort)** - 适合稳定性要求高的场景
   - 优点：稳定排序，任何情况下都是 O(n log n)
   - 缺点：需要额外空间
   - 适用场景：金融交易记录等需要保持相同值的原始顺序的数据

3. **插入排序(Insertion Sort)** - 适合几乎已排序的数据
   - 优点：对于几乎排序好的数据非常快
   - 缺点：一般情况效率较低 O(n²)
   - 适用场景：日志时间戳等本身接近有序的数据

4. **计数排序(Counting Sort)** - 适合有限范围的整数
   - 优点：时间复杂度为 O(n+k)，k为数据范围
   - 缺点：只适用于特定范围的整数
   - 适用场景：学生成绩(0-100)，年龄统计等

5. **基数排序(Radix Sort)** - 适合长整数或字符串
   - 优点：可以处理大数，时间复杂度 O(nk)，k为数字位数
   - 缺点：需要额外空间
   - 适用场景：手机号码、身份证号等长数字序列

6. **堆排序(Heap Sort)** - 适合需要找出最大/最小元素的场景
   - 优点：时间复杂度稳定为 O(n log n)
   - 缺点：不稳定排序
   - 适用场景：优先队列，需要持续取出最大/最小值的情况

选择排序算法时应考虑：数据规模、数据特性(是否接近有序)、内存限制以及是否需要排序稳定性。

我很乐意考考你！关于这些排序算法，我来问几个问题：

1. 快速排序在最坏情况下会退化为O(n²)，请问是什么样的输入数据会导致这种情况发生？
> 完全倒叙（应该说，每个都不在自己的位子上的时候，完全倒叙的话，median可能不变位置如果是奇数），因为这样每个往前测试1个新元素，都需要跟前面的每一个元素对比并互换

>> 我答错了我以为你问我mergesort，快速排序最坏情况发生在输入数据已经有序（正序或逆序）时。这是因为如果选择第一个或最后一个元素作为基准（pivot），每次划分都会导致一个分区为空，另一个分区包含n-1个元素，形成了深度为n的递归，时间复杂度变为O(n²)。通过随机选择基准或三数取中可以降低这种情况发生的概率。
 
2. 归并排序的空间复杂度是多少？它为什么被称为"稳定排序"？
> O(n)? 不知道为什么稳定，大概是不受元素一开始被排序的程度的影响，但为什么稳定，大概是因为不论如何都是sort+merge，永远都是O(nlogn) runtime，我也不知道
>> 归并排序：
空间复杂度确实是O(n)，正确！
"稳定排序"指的是相同值的元素在排序前后相对位置不变。例如，若有两个相同分数的学生A和B，排序前A在B前面，排序后A仍在B前面。归并排序在合并过程中可以保留这种顺序，因此它是稳定的。这对于多关键字排序很重要。

3. 计数排序的时间复杂度是O(n+k)，当k远大于n时，计数排序还适合使用吗？为什么？
> 远大于肯定不适合用了吧,如果n=100； k=100000000；那n^2才10000，远远小于n+k，即可以用其他的排序方法
>>计数排序与k值：
完全正确！当k远大于n时，计数排序不再高效。正如你所说，当k=10⁸而n=100时，其他O(n log n)甚至O(n²)的算法都会更快。计数排序适合k较小的场景，如0-100分的成绩排序。

4. 堆排序和快速排序的时间复杂度平均都是O(n log n)，为什么在实际应用中快速排序通常更受欢迎？
> 快速是平均最快的，因为很难到达最差情况（因为纯随机）？不知道
>> 你的直觉不错！快速排序更受欢迎主要是因为：
在大多数实际场景中，它的常数因子更小（每次操作消耗更少）
快速排序利用缓存更有效，具有更好的局部性
随机选择基准可以使最坏情况很罕见
快速排序是原地排序，不需要额外空间
堆也不需要，但是不稳定（原地排序）

5. 基数排序和计数排序都不基于比较，它们的核心区别是什么？什么情况下基数排序比计数排序更适合？
> 他们应该核心都是frequency，使用场景区别是基数是用大数字，计数是小范围。但可以讲一下么 这个我不太懂这两个sorting
>> 基数排序vs计数排序：
你的理解基本正确。核心区别是：
计数排序：直接计算每个值出现的次数，适用于较小范围的整数
基数排序：按位排序，从最低有效位到最高有效位，适用于长整数和字符串
基数排序适合：
数据范围很大但位数较少的情况（如10位电话号码）
当计数排序所需的k值过大时
排序字符串等多位元素时

请回答你知道的问题，我会给你反馈！


> What is the SDLC (software dev life cycle)?

- process of developing software
- each part of the cycle: 
    - entry and exit criteria + expected deliverables
1. requirements gathering
2. design
3. development
4. test
5. deploy
6. maintenance


> What is the SDTC (software testing life cycle)?

- the testing process of SDLC
- purpose: 
    - process of testing,
    - find errors
    to ensure the quality of the product
- each part of the cycle: 
    - entry and exit criteria + expected deliverables
1. requirements analysis
2. test planning
3. test case development
4. set up env
5. test execution
6. test closure



> What is a test plan, what should be in it?

- blueprint of running tests
    - to ensure software is working as expected.
- detailed documentation :
    - testing scope
    - strategy
    - objectives
    - schedules
    - estimations
    - resources required
    - deadline of the project


