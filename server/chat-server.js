const WebSocket = require('ws');
var models = require('./server').models;

const ws = new WebSocket.Server({ port: 8080 });

ws.on('connection', (ws) => {
	ws.on('message', (message) => {
		console.log('Got Message', JSON.parse(message));

		let parsed = JSON.parse(message);

		if (parsed) {
			switch (parsed.type) {
				case 'SIGNUP':
					models.User.create(parsed.data, (err, user) => {
						if (err) {
							ws.send(
								JSON.stringify({
									type: 'ERROR',
									error: err
								})
							);
						} else {
							models.Profile.create(
								{
									userId: user.id,
									name: parsed.data.name,
									email: parsed.data.email,
									username: parsed.data.username,
									password: parsed.data.password
								},
								(profileError, profile) => {
									if (profileError) {
										ws.send(
											JSON.stringify({
												type: 'error',
												error: profileError
											})
										);
									}
								}
							);
						}
					});

				default:
					console.log('Nothing To See Here');
			}
		}
	});
});
