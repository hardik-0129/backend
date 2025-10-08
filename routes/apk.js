const express = require('express');
const router = express.Router();
// Switch to filesystem-only controller
const apkController = require('../controllers/apkFsController');
const authentication = require('../middleware/adminAuth');

// Get all APKs
router.get('/', authentication, apkController.getAllApks);

// Get single APK
router.get('/:id', authentication, apkController.getApkById);

// Upload new APK
router.post('/upload', authentication, apkController.uploadApk, apkController.uploadNewApk);

// Update APK
router.put('/:id', authentication, apkController.updateApk);

// Delete APK
router.delete('/:id', authentication, apkController.deleteApk);

// Download APK
router.get('/:id/download', apkController.downloadApk);

// Toggle APK status
router.patch('/:id/toggle-status', authentication, apkController.toggleApkStatus);

module.exports = router;
