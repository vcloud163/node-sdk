'use strict';
/**
 * 网易视频云node.js版本上传SDK
 * @version 1.0.0
 * @since 1.0.0
 * @author NetEase_VCloud_FE_Team
 */
let fs = require('fs');
let request = require('request');
let sqlite3 = require('sqlite3').verbose();
let log4js = require('log4js');
let upload = uploads();
let db;
let fd;
let filepath;
let logger;

//配置对象
let config = {
    appKey: 'your app key',
    appSecret: 'your app secret',
    nonce: Math.round(Math.random() * Math.pow(10, 16)).toString(),
    curTime: Math.round(Date.now() / 1000).toString(),
    trunkSize: 4 * 1024 * 1024,
    logLevel: 'INFO'
};
//日志启用
log4js.configure({
    appenders: [{
        type: 'console',
        category: 'upload'
    }]
});
logger = log4js.getLogger('upload');

/**
 * 创建DB
 */
function createDb() {
    db = new sqlite3.Database('vcloud', createTable);
}
/**
 * 创建表
 */
function createTable() {
    let columns = [
        'filepath TEXT',
        'mtime INTEGER',
        'filesize INTEGER',
        'nos_context VARCHAR(256)',
        'nos_bucket VARCHAR(64)',
        'nos_object VARCHAR(256)',
        'nos_token TEXT',
        'created INTEGER'];
    db.run('CREATE TABLE IF NOT EXISTS files (' + columns.join(',') + ')', function () {
        upload.next();
    });
}
/**
 * 获取校验信息
 * @param {String} appSecret App Secret
 * @param {String} nonce 随机值
 * @param {String} curTime 当前时间（秒数）
 */
function getCheckSum(appSecret, nonce, curTime) {
    return require('crypto').createHash('sha1').update(appSecret).update(nonce).update(curTime).digest('hex');
}
/**
 * 获取bucket、token等信息
 * @param {String} filename 文件名
 */
function getInitData(filename) {
    request({
        method: 'post',
        uri: 'http://vcloud.163.com/app/vod/upload/init',
        headers: {
            AppKey: config.appKey,
            Nonce: config.nonce,
            CurTime: config.curTime,
            CheckSum: getCheckSum(config.appSecret, config.nonce, config.curTime)
        },
        json: true,
        body: {
            originFileName: filename
        }
    }, function (err, res, body) {
        if (err || body.code !== 200) {
            upload.throw((err && err.message) || body.msg);
            return false;
        }
        upload.next(body);
    });
}
/**
 * 获取上传地址
 * @param {String} bucketName 桶名
 */
function getIPData(bucketName) {
    request({
        method: 'get',
        uri: 'http://wanproxy.127.net/lbs?version=1.0&bucketname=' + bucketName,
    }, function (err, res, body) {
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
        if (err || body.upload.length < 1) {
            upload.throw((err && err.message) || '上传地址获取失败');
            return false;
        }
        upload.next(body);
    });
}
/**
 * 获取上传断点位置
 * @param {String} uploadIP 上传地址
 * @param {Object} nosData nos信息
 */
function getUploadOffset(uploadIP, nosData) {
    request({
        method: 'get',
        uri: uploadIP + '/' + nosData.nos_bucket + '/' + nosData.nos_object + '?uploadContext&version=1.0&context=' + (nosData.nos_context || ''),
        headers: {
            'x-nos-token': nosData.nos_token
        }
    }, function (err, res, body) {
        upload.next(body);
    });
}
/**
 * 读取文件信息
 * @param {String} filepath 文件路径
 */
function getFileData(filepath) {
    fs.stat(filepath, function (err, stats) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        upload.next(stats);
    });
}
/**
 * 上传分片
 * @param {String} uploadIP 上传地址
 * @param {Object} initData 初始数据
 */
function uploadTrunk(uploadIP, initData) {
    let trunkLength = Math.min(config.trunkSize, initData.filesize - initData.offset);
    let param = '?version=1.0&offset=' + initData.offset + '&complete=' + initData.finish + '&context=' + initData.nos_context;
    let fileBuffer = Buffer.alloc(trunkLength);//, 0, 'utf8'
    fs.readSync(fd, fileBuffer, 0, trunkLength, initData.offset);

    request({
        method: 'post',
        uri: uploadIP + '/' + initData.nos_bucket + '/' + initData.nos_object + param,
        headers: {
            'x-nos-token': initData.nos_token
        },
        body: fileBuffer
    }, function (err, res, body) {
        upload.next(body);
    });
}
/**
 * 查询文件信息
 * @param {Object} fileInfo 文件信息
 */
function getFile(fileInfo) {
    let where = 'WHERE filepath = "' + fileInfo.filepath + '" and mtime = ' + +fileInfo.mtime + ' and filesize = ' + fileInfo.size;
    db.all('SELECT * FROM FILES ' + where, function (err, rows) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        upload.next(rows[0]);
    });
}
/**
 * 判断文件是否已存在（是否需要续传）
 * @param {Object} fileInfo 文件信息
 */
function checkExist(fileInfo) {
    let where = 'WHERE filepath = "' + fileInfo.filepath + '" and mtime = ' + +fileInfo.mtime + ' and filesize = ' + fileInfo.size;
    let sql = 'SELECT COUNT(1) count FROM files ' + where;
    logger.trace('check exist:', sql);
    db.all(sql, function (err, rows) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        if (rows[0].count > 0) {
            upload.next(true);
        } else {
            upload.next(false);
        }
    });
}
/**
 * 保存文件信息
 * @param {Object} fileInfo 文件信息
 */
function saveFile(fileInfo) {
    let sql = 'INSERT INTO files (filepath, mtime, filesize, created, nos_token, nos_object, nos_bucket, nos_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    let values = [fileInfo.filepath, fileInfo.mtime, fileInfo.filesize, fileInfo.created, fileInfo.nos_token, fileInfo.nos_object, fileInfo.nos_bucket, ''];
    logger.trace('save file:', sql, values);
    db.run(sql, values, function (err) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        upload.next();
    });
}
/**
 * 上传成功后删除文件信息
 * @param {Object} fileInfo 文件信息
 */
function removeFile(fileInfo) {
    let where = 'WHERE filepath = "' + fileInfo.filepath + '" and mtime = ' + +fileInfo.mtime + ' and filesize = ' + fileInfo.size;
    let sql = 'DELETE FROM files ' + where;
    logger.trace('remove file:', sql);
    db.run(sql, function (err) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        upload.next();
    });
}
/**
 * 保存context信息
 * @param {Object} fileInfo 文件信息
 */
function saveContext(fileInfo) {
    let where = 'WHERE filepath = "' + fileInfo.filepath + '" and mtime = ' + +fileInfo.mtime + ' and filesize = ' + fileInfo.filesize;
    let sql = 'UPDATE files SET nos_context = ?' + where;
    logger.trace('save context:', sql);
    db.run(sql, [fileInfo.nos_context], function (err) {
        if (err) {
            upload.throw(err.message);
            return false;
        }
        upload.next();
    })
}
/**
 * 文件上传入口
 */
function * uploads() {
    try {
        let fileData = yield getFileData(filepath);
        fileData.filepath = fs.realpathSync(filepath);
        fileData.filename = filepath.split(/[\\/]/i).pop();
        let fileExist = yield checkExist(fileData);
        let initData = {};

        if (fileExist) {
            initData = yield getFile(fileData);
        } else {
            initData = yield getInitData(fileData.filename);
            initData = {
                filepath: fileData.filepath,
                mtime: fileData.mtime,
                filesize: fileData.size,
                created: +new Date(),
                nos_token: initData.ret.xNosToken,
                nos_object: initData.ret.object,
                nos_bucket: initData.ret.bucket,
                nos_context: ''
            };
            yield saveFile(initData);
        }
        let nosData = yield getIPData(initData.nos_bucket);
        let uploadOffset = 0;
        if (fileExist && initData.nos_context) {
            uploadOffset = yield getUploadOffset(nosData.upload[0], initData);
            if (typeof uploadOffset === 'string') {
                uploadOffset = JSON.parse(uploadOffset);
            }
            uploadOffset = uploadOffset.offset || 0;
            logger.info('last offset:', uploadOffset);
        }
        logger.debug('file info:', initData);
        logger.trace('nos data:', nosData);
        logger.info('upload start...');
        logger.info('upload init progress:', (uploadOffset / fileData.size * 100).toFixed(2) + '%');

        while (uploadOffset < fileData.size) {
            initData.offset = uploadOffset;
            initData.finish = false;
            if (uploadOffset + config.trunkSize >= fileData.size) {
                initData.finish = true;
            }
            let trunkResult = yield uploadTrunk(nosData.upload[0], initData);
            logger.debug('trunk upload result:', trunkResult);
            if (typeof trunkResult === 'string') {
                trunkResult = JSON.parse(trunkResult);
            }
            initData.nos_context = trunkResult.context;
            if (initData.nos_context && initData.nos_context.toLowerCase() !== 'null') {
                yield saveContext(initData);
            }
            uploadOffset += config.trunkSize;
            if (initData.finish) {
                uploadOffset = fileData.size;
            }
            logger.info('upload progress:', (uploadOffset / fileData.size * 100).toFixed(2) + '%');
        }
        yield removeFile(fileData);
        logger.info('upload success.');
        logger.info('File upload path:', 'http://nos.netease.com/' + initData.nos_bucket + '/' + initData.nos_object);
    } catch (e) {
        logger.error(e);
    }
}

module.exports = {
    /**
     * 初始化
     * @param {Object} conf 配置对象
     *     {Number}[appKey] App Key,
     *     {Number}[appSecret] App Secret,
     *     {Number}[trunkSize=4*1024*1024] 分片大小，最大值：4MB,
     *     {Number}[logLevel='INFO'] 'INFO'
     * @returns {mixed}
     */
    init: function (conf) {
        let logLevels = ['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'];
        if (conf.logLevel && logLevels.includes(conf.logLevel)) {
            config.logLevel = conf.logLevel;
        }
        logger.setLevel(config.logLevel);

        if (!conf.appKey || !conf.appSecret) {
            logger.error('请传入appKey和appSecret。');
            return false;
        }
        if (conf.trunkSize > config.trunkSize) {
            logger.warn('分片大小超过最大限制（4MB），将设为上限值。');
        }
        config.appKey = conf.appKey;
        config.appSecret = conf.appSecret;
        config.trunkSize = Math.min(config.trunkSize, conf.trunkSize);
    },
    /**
     * 上传API
     * @param filePath 上传文件路径（相对路径或绝对路径）
     * @returns {mixed}
     */
    upload: function (filePath) {
        if (!config.appKey || !config.appSecret) {
            logger.error('appKey或appSecret无效。');
            return false;
        }
        filepath = filePath;
        fs.open(filePath, 'r', function (err, result) {
            if (err) {
                logger.error(err.message);
                return false;
            }
            fd = result;
            createDb();
        });
    }
};