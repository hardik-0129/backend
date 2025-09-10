const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const authentication = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234567890', { algorithms: ['HS256'] });
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT Error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Role-based authorization middleware
const authorizationRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${role} role required.`
      });
    }
    next();
  };
};

module.exports = authentication;
module.exports.authorizationRole = authorizationRole;


