const Blog = require('../models/Blog');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Get all blogs
exports.getAllBlogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);

    const total = await Blog.countDocuments();
    const pages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, pages);

    const blogs = await Blog.find()
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      blogs,
      page: currentPage,
      limit,
      total,
      pages
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      msg: 'Server error'
    });
  }
};

// Get single blog
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        msg: 'Blog not found'
      });
    }
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({
      success: false,
      msg: 'Server error'
    });
  }
};

// Create new blog
exports.createBlog = async (req, res) => {
  try {
    const { title, image, head, body } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        msg: 'Title and body are required'
      });
    }

    const blog = new Blog({
      title,
      image,
      head,
      body
    });

    await blog.save();

    res.status(201).json({
      success: true,
      msg: 'Blog created successfully',
      blog
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({
      success: false,
      msg: 'Server error'
    });
  }
};

// Update blog
exports.updateBlog = async (req, res) => {
  try {
    const { title, image, head, body } = req.body;
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        msg: 'Blog not found'
      });
    }

    if (title !== undefined) blog.title = title;
    if (image !== undefined) blog.image = image;
    if (head !== undefined) blog.head = head;
    if (body !== undefined) blog.body = body;

    await blog.save();

    res.json({
      success: true,
      msg: 'Blog updated successfully',
      blog
    });
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({
      success: false,
      msg: 'Server error'
    });
  }
};

// Delete blog
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        msg: 'Blog not found'
      });
    }

    await Blog.findByIdAndDelete(id);

    res.json({
      success: true,
      msg: 'Blog deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({
      success: false,
      msg: 'Server error'
    });
  }
};

// Upload blog cover image
exports.uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, msg: 'No image file uploaded' });
    }

    // Ensure directory exists
    const uploadsDir = path.join(__dirname, '../uploads/blogs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `blog-${Date.now()}.jpg`;
    const outputPath = path.join(uploadsDir, filename);

    await sharp(req.file.buffer)
      .resize(1600, 900, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true, mozjpeg: true })
      .toFile(outputPath);

    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/blogs/${filename}`;
    return res.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Error uploading blog image:', error);
    return res.status(500).json({ success: false, msg: 'Image upload failed' });
  }
};
