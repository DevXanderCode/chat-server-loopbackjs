
const WebSocket = require('ws');
var models = require('./server').models;

let port = process.env.PORT || 8080;

const ws = new WebSocket.Server({
  port
});

const clients = [];

ws.on('connection', (ws) => {
  const getInitialThreads = (userId) => {
    models.Thread.find({
      where: {},
      include: 'Messages',
      order: 'lastUpdated DESC'
    }, (err, threads) => {
      if (!err && threads) {
        threads.map((thread, idx) => {
          // console.log('logging thread.users: ', thread.users);
          models.User.find({
            where: {
              id: {
                inq: thread.users
              }
            }
          }, (err3, users) => {
            // console.log('logging users', users);
            thread.profiles = users;

            if (idx === threads.length - 1) {
              ws.send(
                JSON.stringify({
                  type: 'INITIAL_THREADS',
                  data: threads,
                })
              );
            }
          });
        });
      }
    });
  };

  function login(email, password) {
    console.log('Logging the EM', email, password);
    models.User.login({
      email,
      password
    }, (err, result) => {
      if (err) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: err,
          })
        );
      } else {
        models.User.findOne({
          where: {
            id: result.userId
          },
          include: 'Profile'
        }, (err2, user) => {
          if (err2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              error: err2
            }));
          } else {
            ws.uid = user.id + new Date().getTime().toString();

            const userObject = {
              id: user.id,
              email: user.email,
              ws: ws,
            };
            clients.push(userObject);
            getInitialThreads(user.id);
            console.log('Logging Clients', clients.length, clients);
            ws.send(JSON.stringify({
              type: 'LOGGEDIN',
              data: {
                session: result,
                user: user
              }
            }));
          }
        });
      }
    });
  }

  ws.on('close', (req) => {
    console.log('Request Close', req);
    let clientIndex = -1;
    clients.map((c, i) => {
      if (c.ws._closeCode === req) {
        clientIndex = i;
      }
      if (clientIndex > -1) {
        clients.splice(clientIndex, 1);
      }
      console.log(c.ws._closeCode, c.id);
    });
  });

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
                  error: err,
                })
              );
            } else {
              models.Profile.create({
                  userId: user.id,
                  name: parsed.data.name,
                  email: parsed.data.email,
                  username: parsed.data.username,
                  password: parsed.data.password,
                },
                (profileError, profile) => {
                  if (profileError) {
                    ws.send(
                      JSON.stringify({
                        type: 'error',
                        error: profileError,
                      })
                    );
                  }
                }
              );
            }
          });
          break;
        case 'CONNECT_WITH_TOKEN':
          models.User.findById(parsed.data.userId, (err, user) => {
            if (!err && user) {
              ws.uid = user.id + new Date().getTime().toString();

              const userObject = {
                id: user.id,
                email: user.email,
                ws: ws,
              };

              clients.push(userObject);
              getInitialThreads(user.id);
            }
          });
          break;
        case 'LOGIN':
          login(parsed.data.email, parsed.data.password);
          break;
        case 'SEARCH':
          console.log('searching for :', parsed.data);
          models.User.find({
            where: {
              email: {
                like: parsed.data
              }
            }
          }, (err, users) => {
            if (!err && users) {
              ws.send(
                JSON.stringify({
                  type: 'GOT_USERS',
                  data: {
                    users,
                  },
                })
              );
            }
          });
          break;
        case 'FIND_THREAD':
          console.log('logging parse data', parsed.data[0], parsed.data[1]);
          models.Thread.findOne({
              where: {
                and: [{
                  users: parsed.data[0]
                }, {
                  users: parsed.data[1]
                }],
              },
            },
            (err2, thread) => {
              console.log('Logging Error 2 and thread', err2, thread);
              if (!err2 && thread) {
                console.log('thread exist', thread);
                ws.send(
                  JSON.stringify({
                    type: 'GOT_THREAD',
                    thread,
                    threadExist: true,
                  })
                );
              } else {
                models.Thread.create({
                    lastUpdated: new Date(),
                    users: parsed.data
                  },
                  (err2, thread) => {
                    if (!err2 && thread) {
                      clients
                        .filter((u) => thread.users.indexOf(u.id.toString()) > -1)
                        .map((client) =>
                          client.ws.send(
                            JSON.stringify({
                              type: 'ADD_THREAD',
                              thread,
                              threadExist: false,
                            })
                          )
                        );
                    }
                  }
                );
              }
            }
          );
          break;
        case 'THREAD_LOAD':
          models.Thread.find({
              where: {
                id: parsed.data.threadId
              },
              order: 'date DESC',
              skip: parsed.data.skip,
              limit: 10,
              // include: 'Messages'
            },
            (err, messages) => {
              // getInitialThreads();
              if (!err && messages) {
                console.log('logging messages', JSON.stringify(messages));
                ws.send(
                  JSON.stringify({
                    type: 'GOT_MESSAGES',
                    threadId: parsed.data.threadId,
                    messages,
                  })
                );
              }
            }
          );
          break;
        case 'ADD_MESSAGE':
          models.Thread.findById(parsed.threadId, (err2, thread) => {
            if (!err2 && thread) {
              models.Message.upsert(parsed.message, (err3, message) => {
                if (!err3 && message) {
                  clients
                    .filter((client) => thread.users.indexOf(client.id.toString()) > -1)
                    .map((client) => {
                      client.ws.send(
                        JSON.stringify({
                          type: 'ADD_MESSAGE_TO_THREAD',
                          threadId: parsed.threadId,
                          message,
                        })
                      );
                    });
                }
              });
            }
          });
          getInitialThreads();
          break;
        default:
          console.log('Nothing To See Here');
      }
    }
  });
});
