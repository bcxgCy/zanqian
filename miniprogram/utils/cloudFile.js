function getExt(filePath) {
  const cleanPath = String(filePath || '').split('?')[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

function uploadImage(filePath, folder) {
  if (!filePath) return Promise.reject(new Error('缺少图片路径'));
  if (!wx.cloud) return Promise.reject(new Error('当前基础库不支持云能力'));

  // 上传到云存储后保存 fileID，避免本地临时路径在换设备或重装后失效。
  const ext = getExt(filePath);
  const cloudPath =
    (folder || 'images') +
    '/' +
    Date.now() +
    '_' +
    Math.floor(Math.random() * 1000000) +
    '.' +
    ext;

  return wx.cloud.uploadFile({
    cloudPath,
    filePath,
  }).then((res) => res.fileID);
}

module.exports = {
  uploadImage,
};
