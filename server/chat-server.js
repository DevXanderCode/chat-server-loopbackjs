const WebSocket = require('ws');
var models = require('./server').models;

const ws = new WebSocket.Server({ port: 8080 });

ws.on('connection', (ws) => {
	ws.on('message', (message) => {
		console.log('Got Message', JSON.parse(message));
	});
});
