var express = require('express');
var app = express();

var winston = require('winston');

var server = require('http').createServer(app);
var port = process.env.PORT || 8000;

var io = require('socket.io')(server);

const Memory = { REVISION: 'α', TYPE: 'SERVER' };

Memory.User = function User(username) {
    this.username = username;

    this.identifier = Memory.User.sequence++;
};

Object.defineProperty(Memory.User.prototype, 'game', {
    get: function () {
        return Memory.userGames[this.identifier];
    },
    set: function (value) {
        Memory.userGames[this.identifier] = value;
    }
});

Memory.User.sequence = 0;

Memory.users = [];
Memory.userSockets = {};
Memory.userGames = {};

Memory.Game = function Game(name, password, author) {
    this.name = name;

    this.identifier = Memory.Game.sequence++;

    if (password) {
        this.locked = true;

        Memory.gameHiddens[this.identifier] = new Memory.GameHidden(this, author, password);
    } else {
        this.locked = false;

        Memory.gameHiddens[this.identifier] = new Memory.GameHidden(this, author);
    }
};

Object.defineProperty(Memory.Game.prototype, 'author', {
    get: function () {
        return Memory.gameHiddens[this.identifier].author;
    },
    set: function (value) {
        Memory.gameHiddens[this.identifier].author = value;
    }
});

Object.defineProperty(Memory.Game.prototype, 'opponent', {
    get: function () {
        return Memory.gameHiddens[this.identifier].opponent;
    },
    set: function (value) {
        Memory.gameHiddens[this.identifier].opponent = value;
    }
});

Object.defineProperty(Memory.Game.prototype, 'password', {
    get: function () {
        return Memory.gameHiddens[this.identifier].password;
    },
    set: function (value) {
        Memory.gameHiddens[this.identifier].password = value;
    }
});

Object.defineProperty(Memory.Game.prototype, 'state', {
    get: function () {
        return Memory.gameStates[this.identifier];
    },
    set: function (value) {
        Memory.gameStates[this.identifier] = value;
    }
});

Memory.GameHidden = function GameHidden(game, author, password) {
    this.author = author;
    this.password = password;

    this.cards = [];
    this.asked = [];

    this.identifier = game.identifier;
};

Memory.GameState = function GameState(game, rows, columns, firstturn) {
    this.identifier = game.identifier;

    this.score = [0, 0];
    this.turn = 0;
    this.firstturn = firstturn;
    this.rows = 0;
    this.columns = 0;

    this.initializeCards(rows, columns);
};

Object.defineProperty(Memory.GameState.prototype, 'cards', {
    get: function () {
        return Memory.gameHiddens[this.identifier].cards;
    },
    set: function (value) {
        Memory.gameHiddens[this.identifier].cards = value;
    }
});

Memory.GameState.prototype.initializeCards = function (rows, columns) {
    let cards = this.cards;

    this.rows = rows;
    this.columns = columns;

    for (var i = 0; i < rows * columns; i++) {
        cards[i] = (i >> 1) | (1 << 16);
    }

    this.shuffleCards();
}

Memory.GameState.prototype.shuffleCards = function () {
    var j, x, i, a = this.cards;

    for (i = a.length; i; i--) {
        j = Math.floor(Math.random() * i);
        x = a[i - 1];
        a[i - 1] = a[j];
        a[j] = x;
    }
}

Memory.GameState.prototype.playTurn = function (user, cards) {
    var gameHiddens = Memory.gameHiddens[this.identifier];
    var turnUser = !!((this.turn + this.firstturn) % 2) ? gameHiddens.opponent : gameHiddens.author;

    var cardA = cards[0], cardB = cards[1];

    if (user.identifier === turnUser.identifier
        && typeof cardA === 'number' && typeof cardB === 'number' && cardA !== cardB
        && (this.cards[cardA] & (1 << 16)) !== 0 && (this.cards[cardB] & (1 << 16)) !== 0) {
        var playedTurn = { cardA: { position: cardA, value: this.cards[cardA] }, cardB: { position: cardB, value: this.cards[cardB] } };

        if (this.cards[cardA] === this.cards[cardB]) {
            this.clearPair(cardA, cardB);

            this.score[((this.turn + this.firstturn) % 2)]++;

            playedTurn.score = this.score;

            playedTurn.match = true;

            if ((this.score[0] + this.score[1]) === this.cards.length / 2) {
                playedTurn.ended = true;

                Memory.endGame(this);
            }
        } else {
            this.turn++;

            playedTurn.match = false;
        }

        gameHiddens.asked.length = 0;

        return playedTurn;
    }
}

Memory.GameState.prototype.askForCard = function (user, card) {
    var gameHiddens = Memory.gameHiddens[this.identifier];
    var turnUser = !!((this.turn + this.firstturn) % 2) ? gameHiddens.opponent : gameHiddens.author;

    if (user.identifier === turnUser.identifier && typeof card === 'number' && gameHiddens.asked.length < 2) {
        gameHiddens.asked.push(card);

        return { position: card, value: this.cards[card] };
    }
}

Memory.GameState.prototype.clearPair = function clearPair(a, b) {
    this.cards[a] &= 0xFFFF;
    this.cards[b] &= 0xFFFF;
}

Memory.Game.sequence = 0;

Memory.games = [];
Memory.gameHiddens = {};
Memory.gameStates = {};

Memory.getGameFromIdentifier = function getGameFromIdentifier(identifier) {
    for (var i = 0; i < Memory.games.length; i++) {
        if (Memory.games[i].identifier === identifier) {
            return Memory.games[i];
        }
    }

    return null;
};

Memory.leaveGame = function leaveGame(user) {
    var game = user.game;

    if (game) {
        if (game.author === user) {
            Memory.removeGame(game);
        } else if (game.opponent === user) {
            user.game = undefined;
            game.opponent = undefined;

            Memory.userSockets[game.author.identifier].emit('other_leave_game', user);
        }
    }
}

Memory.removeGame = function removeGame(game) {
    Memory.games.splice(Memory.games.indexOf(game), 1);

    if (game.author && Memory.userSockets[game.author.identifier]) {
        Memory.userSockets[game.author.identifier].emit('game_kick');
        game.author.game = undefined;
    }

    if (game.opponent && Memory.userSockets[game.opponent.identifier]) {
        Memory.userSockets[game.opponent.identifier].emit('game_kick');
        game.opponent.game = undefined;
    }

    Memory.endGame(game);

    delete Memory.gameHiddens[game.identifier];
};

Memory.endGame = function endGame(game) {
    delete Memory.gameStates[game.identifier];

    Memory.gameHiddens[game.identifier].cards = [];
    Memory.gameHiddens[game.identifier].asked = [];
};

io.on('connection', function (socket) {
    socket.on('add_user', function (data) {
        winston.info('add_user', data);

        if (socket.user) {
            return;
        }

        if (data.username) {
            socket.user = new Memory.User(data.username);

            socket.emit('user_logged', { you: socket.user, users: Memory.users });
            socket.emit('games_refreshed', Memory.games);

            Memory.users.push(socket.user);
            Memory.userSockets[socket.user.identifier] = socket;

            for (var identifier in Memory.userSockets) {
                Memory.userSockets[identifier].emit('user_added', socket.user);
            }
        }
    });

    socket.on('create_game', function (data) {
        winston.info('create_game', data);

        if (socket.user) {
            if (!socket.user.game && data.name) {
                socket.user.game = new Memory.Game(data.name, data.password, socket.user);

                Memory.games.push(socket.user.game);

                socket.emit('join_game', socket.user.game);
            }
        }
    });

    socket.on('join_game', function (data) {
        winston.info('join_game', data);

        if (socket.user) {
            var game = Memory.getGameFromIdentifier(data.identifier);

            if (game && !game.opponent && game.password === data.password) {
                socket.user.game = game;
                game.opponent = socket.user;

                socket.emit('join_game', game);

                if (game.state) {
                    var gameHiddens = Memory.gameHiddens[game.identifier];
                    var asked = gameHiddens.asked;
                    var state = game.state;
                    var turnUser = !!((state.turn + state.firstturn) % 2) ? gameHiddens.opponent : gameHiddens.author;

                    var closedCards = [];

                    for (var i = 0; i < state.rows * state.columns; i++) {
                        closedCards[i] = state.cards[i] >> 16;
                    }

                    var info = { state: game.state, closedCards: closedCards };

                    if (turnUser === socket.user) {
                        info.asked = asked;
                    }

                    socket.emit('game_started', info);

                    for (var i = 0; i < asked.length; i++) {
                        socket.emit('game_card_answered', { position: asked[i], value: game.state.cards[asked[i]] });
                    }
                }

                if (game.author !== socket.user) {
                    Memory.userSockets[game.author.identifier].emit('other_join_game', socket.user);
                }
            }
        }
    });

    socket.on('refresh_game', function () {
        if (socket.user) {
            var game = socket.user.game;

            if (game) {
                var info = { author: game.author, opponent: game.opponent };

                socket.emit('game_refreshed', info);
            }
        }
    });

    socket.on('leave_game', function () {
        if (socket.user) {
            Memory.leaveGame(socket.user);
        }
    });

    socket.on('request_start_game', function (data) {
        winston.info('request_start_game', data);

        if (socket.user) {
            var rows = data.rows,
                columns = data.columns,
                firstturn = data.firstturn,
                game = socket.user.game;

            if (game && !game.state && game.author === socket.user && game.opponent && typeof rows === 'number' && typeof columns === 'number' && typeof firstturn === 'boolean') {
                if (rows >= 4 && rows <= 10 && columns >= 4 && columns <= 10) {
                    game.state = new Memory.GameState(game, rows, columns, firstturn);

                    socket.emit('game_started', { state: game.state });
                    Memory.userSockets[game.opponent.identifier].emit('game_started', { state: game.state });
                }
            }
        }
    });

    socket.on('request_play_turn', function (data) {
        winston.info('request_play_turn', data);

        if (socket.user) {
            var game = socket.user.game;

            if (game && game.state) {
                var playedTurn = game.state.playTurn(socket.user, data);
                var otherPlayer = game.author === socket.user ? game.opponent : game.author;

                if (playedTurn) {
                    socket.emit('game_turn_played', playedTurn);
                    Memory.userSockets[otherPlayer.identifier].emit('game_turn_played', playedTurn);
                }
            }
        }
    });

    socket.on('request_ask_for_card', function (data) {
        winston.info('request_ask_for_card', data);

        if (socket.user) {
            var game = socket.user.game;

            if (game && game.state) {
                var askedCard = game.state.askForCard(socket.user, data);
                var otherPlayer = game.author === socket.user ? game.opponent : game.author;

                if (askedCard) {
                    socket.emit('game_card_answered', askedCard);
                    Memory.userSockets[otherPlayer.identifier].emit('game_card_answered', askedCard);
                }
            }
        }
    });

    socket.on('refresh_games', function (data) {
        winston.info('refresh_games', data);

        if (socket.user) {
            for (var i = 0; i < Memory.games.length; i++) {
                Memory.games[i].full = !!(Memory.games[i].opponent);
            }

            socket.emit('games_refreshed', Memory.games);
        }
    });

    socket.on('disconnect', function () {
        winston.info('disconnect');

        if (socket.user) {
            Memory.users.splice(Memory.users.indexOf(socket.user), 1);
            delete Memory.userSockets[socket.user.identifier];

            Memory.leaveGame(socket.user);

            for (var identifier in Memory.userSockets) {
                Memory.userSockets[identifier].emit('user_removed', socket.user);
            }
        }
    });
});

winston.add(new winston.transports.File({ filename: __dirname + '/logs/latest.log' }));

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

app.use(express.static(__dirname + '/static'));
