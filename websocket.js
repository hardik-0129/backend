
const socketio = require('socket.io');
let io;

function initSocket(server) {
	io = socketio(server, { cors: { origin: '*' } });
	io.on('connection', (socket) => {
		socket.on('join', (userId) => {
			socket.join(userId);
		});
	});
}

function emitWalletUpdate(userId, newBalance) {
	if (io) {
        
		io.to(userId).emit('walletUpdate', { balance: newBalance });
	}
}

module.exports = { initSocket, emitWalletUpdate };
