/**
 * 网易视频云node.js版本上传SDK Demo
 * @version 1.0.0
 * @since 1.0.0
 * @author NetEase_VCloud_FE_Team
 */
let uploadSdk = require('./index');
uploadSdk.init({
    appKey: '[App Key]',
    appSecret: '[App Secret]',
    trunkSize: 4 * 1024 * 1024,
    logLevel: 'INFO'
});
uploadSdk.upload('E:/Hello.mp4');