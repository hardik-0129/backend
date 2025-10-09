const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Ensure upload dir
const UPLOAD_DIR = path.join(__dirname, '../uploads/apk');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Auto-incrementing naming scheme: alpha_lions_vXXX.apk
    try {
      const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.toLowerCase().endsWith('.apk'));
      let max = 0;
      for (const f of files) {
        const m = f.match(/alpha_lions_v(\d{3})\.apk$/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > max) max = n;
        }
      }
      const next = (max + 1).toString().padStart(3, '0');
      const name = `alpha_lions_v${next}.apk`;
      cb(null, name);
    } catch (e) {
      // Fallback to preserving original name
      let original = file.originalname || 'app.apk';
      if (!original.toLowerCase().endsWith('.apk')) original += '.apk';
      cb(null, original);
    }
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' || file.originalname.toLowerCase().endsWith('.apk')) {
      return cb(null, true);
    }
    cb(new Error('Only APK files are allowed!'));
  }
});

exports.uploadApk = upload.single('apkFile');

function mapFileToApk(fileName) {
  const fullPath = path.join(UPLOAD_DIR, fileName);
  const stats = fs.statSync(fullPath);
  return {
    _id: fileName,
    name: fileName,
    version: '',
    description: '',
    fileName,
    filePath: fullPath,
    fileSize: stats.size,
    downloadCount: 0,
    isActive: true,
    uploadDate: stats.ctime,
    metadata: { packageName: '', minSdkVersion: '', targetSdkVersion: '', permissions: [], features: [] },
    uploadedBy: null
  };
}

exports.getAllApks = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.toLowerCase().endsWith('.apk'));
    const filtered = search ? files.filter(f => f.toLowerCase().includes(String(search).toLowerCase())) : files;
    const start = (parseInt(page) - 1) * parseInt(limit);
    const slice = filtered.slice(start, start + parseInt(limit));
    const apks = slice.map(mapFileToApk);
    res.status(200).json({
      success: true,
      apks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(filtered.length / parseInt(limit)) || 0,
        totalApks: filtered.length,
        hasNextPage: start + parseInt(limit) < filtered.length,
        hasPrevPage: start > 0
      }
    });
  } catch (error) {
    console.error('Get All APKs Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch APKs', details: error.message });
  }
};

exports.getApkById = async (req, res) => {
  try {
    const { id } = req.params; // filename
    const filePath = path.join(UPLOAD_DIR, id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'APK not found' });
    }
    return res.status(200).json({ success: true, apk: mapFileToApk(id) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch APK', details: error.message });
  }
};

// Public: get latest APK by semantic filename (alpha_lions_vXYZ.apk) or newest mtime
exports.getLatestApk = async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.toLowerCase().endsWith('.apk'));
    if (!files.length) {
      return res.status(404).json({ success: false, error: 'No APK files found' });
    }
    let latestByNumber = null;
    let maxNum = -1;
    for (const f of files) {
      const m = f.match(/alpha_lions_v(\d{3,})\.apk$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) {
          maxNum = n;
          latestByNumber = f;
        }
      }
    }
    let latest = latestByNumber;
    if (!latest) {
      // fallback: pick most recently modified
      latest = files
        .map(name => ({ name, mtime: fs.statSync(path.join(UPLOAD_DIR, name)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime)[0].name;
    }
    return res.status(200).json({
      success: true,
      fileName: latest,
      url: `/uploads/apk/${latest}`,
      downloadUrl: `/api/apk/${latest}/download`,
      version: latest.match(/alpha_lions_v(\d{3,})/i)?.[1] || null
    });
  } catch (error) {
    console.error('Get Latest APK Error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve latest APK', details: error.message });
  }
};

exports.uploadNewApk = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'APK file is required' });
    }
    const apk = {
      _id: req.file.filename,
      name: req.file.originalname || req.file.filename,
      version: '',
      description: '',
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      uploadedBy: null,
      metadata: { packageName: '', minSdkVersion: '', targetSdkVersion: '', permissions: [], features: [] },
      isActive: true,
      uploadDate: new Date()
    };
    res.status(201).json({ success: true, message: 'APK uploaded successfully', apk });
  } catch (error) {
    console.error('Upload APK Error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to upload APK', details: error.message });
  }
};

exports.updateApk = async (req, res) => {
  try {
    const { id } = req.params; // current filename
    const { newFileName } = req.body; // target filename
    const oldPath = path.join(UPLOAD_DIR, id);
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ success: false, error: 'APK not found' });
    }
    if (!newFileName || !newFileName.toLowerCase().endsWith('.apk')) {
      return res.status(400).json({ success: false, error: 'newFileName ending with .apk is required' });
    }
    const newPath = path.join(UPLOAD_DIR, newFileName);
    fs.renameSync(oldPath, newPath);
    return res.status(200).json({ success: true, message: 'APK renamed successfully', apk: mapFileToApk(newFileName) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update APK', details: error.message });
  }
};

exports.deleteApk = async (req, res) => {
  try {
    const { id } = req.params; // filename
    const filePath = path.join(UPLOAD_DIR, id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'APK not found' });
    }
    fs.unlinkSync(filePath);
    res.status(200).json({ success: true, message: 'APK deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete APK', details: error.message });
  }
};

exports.downloadApk = async (req, res) => {
  try {
    const { id } = req.params; // filename
    const filePath = path.join(UPLOAD_DIR, id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'APK file not found on server' });
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${id}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to download APK', details: error.message });
  }
};

exports.toggleApkStatus = async (req, res) => {
  return res.status(200).json({ success: true, message: 'No-op in filesystem mode' });
};


