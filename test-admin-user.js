const axios = require('axios');

// Test script to verify the admin create user API
async function testCreateUser() {
  try {
    const testUser = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      password: 'testpassword123',
      freeFireUsername: 'TestPlayer',
      wallet: 100,
      isAdmin: false
    };

    console.log('Testing admin create user API...');
    console.log('Request URL: http://localhost:5000/api/admin/users');
    console.log('Request Body:', testUser);

    const response = await axios.post('http://localhost:5000/api/admin/users', testUser, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      }
    });

    console.log('Response Status:', response.status);
    console.log('Response Data:', response.data);
  } catch (error) {
    console.error('Error testing API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Uncomment the line below to run the test
// testCreateUser();

console.log('Test script created. To run the test:');
console.log('1. Start the backend server: npm start');
console.log('2. Get an admin token from login');
console.log('3. Replace YOUR_ADMIN_TOKEN_HERE with the actual token');
console.log('4. Uncomment the testCreateUser() call and run: node test-admin-user.js');
