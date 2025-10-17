 const { Expo } = require('expo-server-sdk');
const User = require('../models/User');
const Notification = require('../models/Notification');

const expo = new Expo();

exports.sendPushNotification = async (userId, { title, message, data }) => {
  try {
    const user = await User.findById(userId);
    
    if (!user || !user.pushToken) {
      console.log('No push token found for user');
      return;
    }

    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.log('Invalid Expo push token');
      return;
    }

    const messages = [{
      to: user.pushToken,
      sound: 'default',
      title,
      body: message,
      data,
    }];

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (let chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification:', error);
      }
    }

    // Save notification to database
    await Notification.create({
      user: userId,
      title,
      message,
      type: data?.type || 'system',
    });

    return tickets;
  } catch (error) {
    console.error('Push notification error:', error);
  }
};