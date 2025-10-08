const express = require('express');
const router = express.Router();
const {
  getAllBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  uploadBlogImage
} = require('../controllers/blogController');
const multer = require('multer');
const authentication = require('../middleware/adminAuth');
const upload = multer({ storage: multer.memoryStorage() });
const auth = require('../middleware/adminAuth');

// Public routes
router.get('/', getAllBlogs);
router.get('/:id', getBlogById);

// Protected routes (admin only)
router.post('/', auth, createBlog);
router.put('/:id', auth, updateBlog);
router.delete('/:id', auth, deleteBlog);
router.post('/upload-image', authentication, upload.single('image'), uploadBlogImage);

module.exports = router;
