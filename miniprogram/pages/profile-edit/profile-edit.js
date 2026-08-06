const storage = require('../../utils/storage');
const cloudFile = require('../../utils/cloudFile');

Page({
  data: {
    user: {},
    nickName: '',
    avatarUrl: '',
  },

  onLoad() {
    this.loadUser();
  },

  loadUser() {
    wx.showLoading({ title: '加载中' });
    storage.getUser()
      .then((user) => {
        this.setData({
          user,
          nickName: user.nickName || '',
          avatarUrl: user.avatarUrl || '',
        });
      })
      .catch((err) => {
        wx.showToast({ title: '资料加载失败', icon: 'none' });
        console.warn('资料加载失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    wx.showLoading({ title: '上传中' });
    // 微信头像临时路径不能长期保存，上传云存储后再写入用户资料。
    cloudFile.uploadImage(avatarUrl, 'user-avatars')
      .then((fileID) => {
        this.setData({ avatarUrl: fileID });
      })
      .catch((err) => {
        wx.showToast({ title: '头像上传失败', icon: 'none' });
        console.warn('用户头像上传失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  onNickNameBlur(e) {
    this.setData({ nickName: (e.detail.value || '').trim() });
  },

  saveProfile() {
    const user = Object.assign({}, this.data.user, {
      nickName: this.data.nickName || '存钱达人',
      avatarUrl: this.data.avatarUrl || '',
    });
    wx.showLoading({ title: '保存中' });
    storage.saveUser(user)
      .then(() => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        wx.showToast({ title: '保存失败', icon: 'none' });
        console.warn('保存资料失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },
});
