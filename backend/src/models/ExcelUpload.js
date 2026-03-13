const mongoose = require('mongoose');

const excelUploadSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    deviceId: { type: String, index: true },
    keyword: { type: String },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number },
  },
  {
    collection: 'Excel-Uploads',
    timestamps: true,
  }
);

module.exports = mongoose.model('ExcelUpload', excelUploadSchema);
