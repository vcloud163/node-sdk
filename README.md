# Node-SDK 说明
## 1 简介
Node-SDK是用于服务器端点播上传的软件开发工具包，提供简单、便捷的方法，方便用户开发上传视频或图片文件的功能。
## 2 功能特性
1. 文件上传
2. 断点续传

## 3 开发准备
### 3.1 环境配置
1. 安装Node.js（0.11.x 以上版本）；
2. 执行`npm i vcloud-node-sdk --save`安装依赖包。

### 3.2 模块引入
```js
let uploadSdk = require('vcloud-node-sdk');
```

## 4 使用说明
### 4.1 初始化
接入视频云点播，需要拥有一对有效的 AppKey 和 AppSecret 进行签名认证，可通过如下步骤获得：

1. 开通视频云点播服务；
2. 登陆视频云开发者平台，通过管理控制台->账户信息获取 AppKey 和 AppSecret。

在获取到 AppKey 和 AppSecret 之后，可按照如下方式进行初始化：

```js
uploadSdk.init({
    appKey: '[App Key]',
    appSecret: '[App Secret]',
    trunkSize: 4 * 1024 * 1024,
    logLevel: 'INFO'
});
```

**配置项说明：**

1. appKey：AppKey
2. appSecret：AppSecret
3. trunkSize：分片大小，最大4MB
4. logLevel：日志级别，支持：'ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'

### 4.2 文件上传
调用upload接口，传入文件路径即可完成文件上传，路径支持相对路径（相对于index.js文件）或绝对路径（推荐）。

示例：

```js
uploadSdk.upload('E:/Hello.mp4');
```
### 4.3 断点续传
upload接口同时支持断点续传，只需传入同一文件的路径再次调用upload接口即可，SDK会自动查询断点并进行续传。

示例：

```js
uploadSdk.upload('E:/Hello.mp4');
```
## 5 版本更新记录
v1.0.3

1. Node-SDK初始版本，提供点播上传的基本功能，包括：文件上传、断点续传等。