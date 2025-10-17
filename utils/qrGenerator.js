 const QRCode = require('qrcode');

exports.generateQR = async (data) => {
  try {
    const qrCode = await QRCode.toDataURL(data);
    return qrCode;
  } catch (error) {
    throw new Error('QR Code generation failed');
  }
};
