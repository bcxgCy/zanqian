/**
 * 房间定时任务云函数
 *
 * 触发方式：云开发定时触发器
 *
 * 功能：
 * 1. 每日打卡提醒（20:00）
 * 2. 自动生成周报（周一 10:00）
 *
 * 配置方式：
 * 在微信开发者工具中，右键此文件夹 → 配置定时触发器
 * - Cron表达式示例：
 *   - 每天20:00: "0 0 20 * * * *"
 *   - 周一10:00: "0 0 10 * * 1"
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  console.log('【roomScheduler】定时任务触发', { event, time: new Date().toISOString() });

  const action = event.action || 'dailyReminder';

  try {
    switch (action) {
      case 'dailyReminder':
        return await handleDailyReminder();

      case 'weeklyReport':
        return await handleWeeklyReport();

      default:
        return { code: -1, error: `未知任务类型: ${action}` };
    }
  } catch (err) {
    console.error('【roomScheduler】执行失败', err);
    return { code: -2, error: err.message };
  }
};

/**
 * 每日打卡提醒
 * 调用 room 云函数的 sendDailyReminder 接口
 */
async function handleDailyReminder() {
  console.log('【roomScheduler】开始执行每日提醒任务');

  const result = await cloud.callFunction({
    name: 'room',
    data: {
      action: 'sendDailyReminder',
    },
  });

  console.log('【roomScheduler】每日提醒任务完成', result.result);

  return result.result;
}

/**
 * 自动生成周报
 * 遍历所有开启了 autoReport 的房间，自动生成周报
 */
async function handleWeeklyReport() {
  console.log('【roomScheduler】开始执行周报生成任务');

  const db = cloud.database();
  const _ = db.command;

  // 查询所有开启自动周报的活跃房间
  const roomsResult = await db.collection('rooms')
    .where({
      status: 'active',
      autoReport: true,
    })
    .field({ _id: 1, ownerOpenid: 1, roomName: 1 })
    .get();

  console.log(`【roomScheduler】找到 ${roomsResult.data.length} 个需要生成周报的房间`);

  const results = [];

  for (const room of roomsResult.data) {
    try {
      // 调用 room 云函数生成周报
      const reportResult = await cloud.callFunction({
        name: 'room',
        data: {
          action: 'generateWeeklyReport',
          roomId: room._id,
          // 使用房主身份调用（定时任务无用户上下文，需要特殊处理）
          // 这里直接传入房主openid作为参数
          _asOwner: room.ownerOpenid,
        },
      });

      // 如果配置了自动推送，则发送通知
      if (reportResult.result.code === 0 && room.reportPush) {
        const pushResult = await cloud.callFunction({
          name: 'room',
          data: {
            action: 'sendWeeklyReport',
            roomId: room._id,
            _asOwner: room.ownerOpenid,
          },
        });

        results.push({
          roomId: room._id,
          roomName: room.roomName,
          success: true,
          pushSent: pushResult.result.code === 0,
        });
      } else {
        results.push({
          roomId: room._id,
          roomName: room.roomName,
          success: reportResult.result.code === 0,
          error: reportResult.result.error,
        });
      }
    } catch (err) {
      console.error(`【roomScheduler】处理房间 ${room._id} 失败`, err);
      results.push({
        roomId: room._id,
        roomName: room.roomName,
        success: false,
        error: err.message,
      });
    }
  }

  console.log(`【roomScheduler】周报任务完成，共处理 ${results.length} 个房间`);

  return {
    code: 0,
    data: {
      action: 'weeklyReport',
      processedCount: results.length,
      successCount: results.filter(r => r.success).length,
      results,
      processTime: new Date(),
    },
  };
}
