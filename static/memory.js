const Memory = { REVISION: 'α', TYPE: 'CLIENT' };

Memory.users = [];
Memory.games = [];

Memory.gameSettings = { rows: 0, columns: 0, firstturn: false };

Memory.socket = io();

Memory.socket.on('user_logged', function (info) {
    Array.prototype.push.apply(Memory.users, info.users);

    Memory.me = info.you;

    Memory.switchView(Memory.BROWSER_VIEW);
    Memory.usernameDisplayElement.textContent = 'You\'re joined as ' + Memory.me.username + '.';

    Memory.updateUsersDisplay();

    console.debug('LOGGED', info);
});

Memory.socket.on('user_added', function (user) {
    Memory.users.push(user);

    Memory.updateUsersDisplay();

    console.debug('ADDED', user);
});

Memory.socket.on('user_removed', function (user) {
    Memory.users.splice(Memory.users.indexOf(user), 1);

    Memory.updateUsersDisplay();

    console.debug('REMOVED', user);
});

Memory.socket.on('games_refreshed', function (games) {
    Memory.games = games;

    Memory.updateGamesDisplay();

    console.debug('GAMES_REFRESHED', games);
});

Memory.socket.on('join_game', function (game) {
    Memory.enterGame(game);

    Memory.socket.emit('refresh_game');

    console.debug('JOIN', game);
});

Memory.socket.on('other_join_game', function (user) {
    Memory.socket.emit('refresh_game');

    console.debug('OTHER_JOIN', user);
});

Memory.socket.on('other_leave_game', function (user) {
    Memory.socket.emit('refresh_game');

    console.debug('OTHER_LEAVE', user);
});

Memory.socket.on('game_refreshed', function (info) {
    Memory.updateGameView(info);

    console.debug('GAME_REFRESHED', info);
});

Memory.socket.on('game_kick', function () {
    Memory.leaveGame(false);

    console.debug('GAME_KICKED');
});

Memory.socket.on('game_started', function (data) {
    var state = data.state;

    Memory.activeGame.state = state;

    if (data.asked) {
        Memory.activeGame.state.picks = data.asked;
    } else {
        Memory.activeGame.state.picks = [];
    }

    Memory.setupCardDisplay(state.rows, state.columns, data.closedCards);

    Memory.updateGameView();

    console.debug('GAME_STARTED', data);
});

Memory.socket.on('game_turn_played', function (data) {
    if (data.match) {
        Memory.clearPair(data.cardA, data.cardB);
        Memory.activeGame.state.score = data.score;
    } else {
        Memory.activeGame.state.turn++;
    }

    if (data.ended) {
        Memory.activeGame.info.lastScore = Memory.activeGame.state.score;

        delete Memory.activeGame.state;
    }

    Memory.updateGameView();

    console.debug('GAME_TURN_PLAYED', data);
});

Memory.socket.on('game_card_answered', function (data) {
    Memory.flipCard(document.getElementById('game-card-instance-' + data.position), data.value);

    console.debug('GAME_CARD_ANSWERED', data);
});

Memory.LOGIN_VIEW = document.getElementById('login-view');
Memory.BROWSER_VIEW = document.getElementById('browser-view');
Memory.GAME_VIEW = document.getElementById('game-view');

Memory.activeView = Memory.LOGIN_VIEW;

Memory.switchView = function switchView(view) {
    Memory.activeView.style.display = 'none';

    Memory.activeView = view;
    Memory.activeView.style.display = 'block';
};

Memory.usernameInputElement = document.getElementById('username-input');
Memory.usernameDisplayElement = document.getElementById('username-display');
Memory.usersDisplayElement = document.getElementById('users-display');

Memory.gameNameInputElement = document.getElementById('game-name-input');
Memory.gamePasswordInputElement = document.getElementById('game-password-input');
Memory.gameCreateButtonElement = document.getElementById('game-create-button');

Memory.gamesDisplayElement = document.getElementById('games-display');
Memory.gamesRefreshButtonElement = document.getElementById('games-refresh-button');

Memory.gameNameDisplayElement = document.getElementById('game-name-display');
Memory.gamePlayersDisplayElement = document.getElementById('game-players-display');
Memory.gameLeaveButtonElement = document.getElementById('game-leave-button');

Memory.gameRowsInputElement = document.getElementById('game-rows-input');
Memory.gameColumnsInputElement = document.getElementById('game-columns-input');
Memory.gamefirstturnButtonElement = document.getElementById('game-firstturn-button');
Memory.gameStartButtonElement = document.getElementById('game-start-button');

Memory.gameSettingsViewElement = document.getElementById('game-settings-view');

Memory.gameBoardViewElement = document.getElementById('game-board-view');
Memory.gameCardDisplayElement = document.getElementById('game-card-display');

Memory.updateUsersDisplay = function updateUsersDisplay() {
    if (Memory.activeView === Memory.BROWSER_VIEW) {
        if (Memory.users.length > 1) {
            Memory.usersDisplayElement.textContent = 'There are ' + (Memory.users.length - 1) + ' other users online.';
        } else {
            Memory.usersDisplayElement.textContent = 'You seem to be the only one online.';
        }
    }
};

Memory.updateGamesDisplay = function updateGamesDisplay() {
    if (Memory.activeView === Memory.BROWSER_VIEW) {
        Memory.gamesRefreshButtonElement.value = 'Refresh games';

        if (Memory.games.length > 0) {
            Memory.gamesDisplayElement.innerHTML = '';

            for (var i = 0; i < Memory.games.length; i++) {
                var game = Memory.games[i];

                var gameEntryElement = document.createElement('p');
                var gameInfoElement = document.createElement('span');
                var gameJoinButtonElement = document.createElement('input');

                gameEntryElement.classList.add('flex-row');

                gameInfoElement.textContent = '#' + game.identifier + ' ' + game.name;
                gameInfoElement.classList.add('flex-grow');

                gameJoinButtonElement.type = 'button';

                gameEntryElement.appendChild(gameInfoElement);

                if (game.full) {
                    gameJoinButtonElement.value = 'Game full!';
                    gameJoinButtonElement.disabled = true;
                } else {
                    gameJoinButtonElement.value = 'Join game';

                    if (game.locked) {
                        var gamePasswordElement = document.createElement('input');

                        gamePasswordElement.type = 'text';
                        gamePasswordElement.placeholder = 'Password';
                        gamePasswordElement.style.marginRight = '8px';

                        (function (identifier) {
                            gameJoinButtonElement.addEventListener('click', function () {
                                if (Memory.activeView === Memory.BROWSER_VIEW && !Memory.activeGame) {
                                    Memory.socket.emit('refresh_games');
                                    Memory.socket.emit('join_game', { identifier: identifier, password: gamePasswordElement.value });
                                }
                            });
                        })(game.identifier);

                        gameEntryElement.appendChild(gamePasswordElement);
                    } else {
                        (function (identifier) {
                            gameJoinButtonElement.addEventListener('click', function () {
                                if (Memory.activeView === Memory.BROWSER_VIEW && !Memory.activeGame) {
                                    Memory.socket.emit('refresh_games');
                                    Memory.socket.emit('join_game', { identifier: identifier });
                                }
                            });
                        })(game.identifier);
                    }
                }

                gameEntryElement.appendChild(gameJoinButtonElement);

                Memory.gamesDisplayElement.appendChild(gameEntryElement);
            }
        } else {
            Memory.gamesDisplayElement.textContent = 'There aren\'t any games available right now, you can create one yourself!';
        }
    }
};

Memory.cardTemplateElement = document.createElement('div');

{
    Memory.cardTemplateElement.classList.add('card');

    var cardImage = document.createElement('img');

    cardImage.src = '/card.svg';

    Memory.cardTemplateElement.appendChild(cardImage);
}

Memory.cardImageElement = document.createElement('img');

Memory.cardImageElement.classList.add('card-image');

Memory.cardImageElements = [Memory.cardImageElement, Memory.cardImageElement.cloneNode(true)];

Memory.setupCardDisplay = function setupCardDisplay(rows, columns, closedCards) {
    Memory.gameCardDisplayElement.innerHTML = '';

    for (var i = 0; i < rows; i++) {
        var currentRow = document.createElement('div');

        for (var j = 0; j < columns; j++) {
            var currentCard = Memory.cardTemplateElement.cloneNode(true);

            currentCard.id = 'game-card-instance-' + (i * columns + j);

            if (closedCards && !closedCards[i * columns + j]) {
                currentCard.style.transform = 'scale(0, 0)';
            }

            currentRow.appendChild(currentCard);
        }

        Memory.gameCardDisplayElement.appendChild(currentRow);
    }
};

Memory.flipCard = function flipCard(card, value) {
    var cardImageElement;

    for (var i = 0; i < Memory.cardImageElements.length; i++) {
        cardImageElement = Memory.cardImageElements[i];

        if (!cardImageElement.parentNode) break;
    }

    if (cardImageElement.parentNode) {
        Memory.closeCards();
    }

    value &= 0xFFFF;

    cardImageElement.src = '/faces/' + value + '.png';

    card.appendChild(cardImageElement);
}

Memory.closeCards = function closeCards() {
    for (var i = 0; i < Memory.cardImageElements.length; i++) {
        var cardImageElement = Memory.cardImageElements[i];

        if (cardImageElement.parentNode) {
            cardImageElement.parentNode.removeChild(cardImageElement);
        }
    }
}

Memory.clearPair = function clearPair(cardA, cardB) {
    document.getElementById('game-card-instance-' + cardA.position).style.transform = 'scale(0, 0)';

    document.getElementById('game-card-instance-' + cardB.position).style.transform = 'scale(0, 0)';
}

Memory.updateGameView = function updateGameView(info) {
    if (Memory.activeView === Memory.GAME_VIEW && Memory.activeGame) {
        if (info) {
            Memory.activeGame.info = info;
        }

        if (Memory.activeGame.info) {
            var activeInfo = Memory.activeGame.info;
            var amAuthor = activeInfo.author.identifier === Memory.me.identifier;
            var yourOpponent = amAuthor ? activeInfo.opponent : activeInfo.author;

            Memory.gameNameDisplayElement.textContent = Memory.activeGame.name;

            Memory.gameSettingsViewElement.style.display = 'none';
            Memory.gameBoardViewElement.style.display = 'none';

            if (Memory.activeGame.state) {
                var state = Memory.activeGame.state;

                var turnUser = !!((state.turn + state.firstturn + !amAuthor) % 2);

                Memory.gameNameDisplayElement.textContent += ' (' + state.score[0] + ' \u2013 ' + state.score[1] + ')';

                if (turnUser) {
                    if (yourOpponent) {
                        Memory.gamePlayersDisplayElement.textContent = 'It\'s the turn for ' + yourOpponent.username;
                    } else {
                        Memory.gamePlayersDisplayElement.textContent = 'It\'s the turn for your opponent';
                    }
                } else {
                    Memory.gamePlayersDisplayElement.textContent = 'It\'s now your turn';
                }

                Memory.gameBoardViewElement.style.display = 'flex';
            } else {
                if (yourOpponent) {
                    Memory.gamePlayersDisplayElement.textContent = 'It\'s you versus ' + yourOpponent.username;
                } else {
                    Memory.gamePlayersDisplayElement.textContent = 'It\'s just you here right now';
                }

                if (activeInfo.lastScore) {
                    if (activeInfo.lastScore[0] === activeInfo.lastScore[1]) {
                        Memory.gamePlayersDisplayElement.textContent += '\n Last round was a draw (' + activeInfo.lastScore[0] + ' \u2013 ' + activeInfo.lastScore[1] + ')';
                    } else if (activeInfo.lastScore[0] > activeInfo.lastScore[1]) {
                        Memory.gamePlayersDisplayElement.textContent += '\n' + activeInfo.author.username + ' won the last round (' + activeInfo.lastScore[0] + ' \u2013 ' + activeInfo.lastScore[1] + ')';
                    } else {
                        Memory.gamePlayersDisplayElement.textContent += '\n' + activeInfo.opponent.username + ' won the last round (' + activeInfo.lastScore[0] + ' \u2013 ' + activeInfo.lastScore[1] + ')';
                    }
                }

                if (amAuthor) {
                    Memory.gameSettingsViewElement.style.display = 'flex';
                    Memory.gamefirstturnButtonElement.value = 'First turn: ' + (Memory.gameSettings.firstturn ? 'Opponent' : 'Author');
                }
            }
        }
    }
};

Memory.enterGame = function enterGame(game) {
    Memory.activeGame = game;

    Memory.switchView(Memory.GAME_VIEW);
    Memory.updateGameView();
};

Memory.leaveGame = function leaveGame(broadcast) {
    Memory.updateGameView();
    Memory.closeCards();

    delete Memory.activeGame;

    Memory.switchView(Memory.BROWSER_VIEW);

    if (broadcast) {
        Memory.socket.emit('leave_game');
    }

    Memory.socket.emit('refresh_games');
};

Memory.usernameInputElement.addEventListener('keydown', function (event) {
    if (Memory.activeView === Memory.LOGIN_VIEW && event.key === 'Enter') {
        var username = Memory.usernameInputElement.value;

        if (username !== '') {
            Memory.socket.emit('add_user', { username: username });
        }
    }
});

Memory.gameCreateButtonElement.addEventListener('click', function () {
    if (Memory.activeView === Memory.BROWSER_VIEW) {
        var name = Memory.gameNameInputElement.value, password = Memory.gamePasswordInputElement.value;

        if (name !== '') {
            if (password !== '') {
                Memory.socket.emit('create_game', { name: name, password: password });
            } else {
                Memory.socket.emit('create_game', { name: name });
            }

            Memory.gameNameInputElement.value = '';
            Memory.gamePasswordInputElement.value = '';
        }
    }
});

Memory.gamesRefreshButtonElement.addEventListener('click', function () {
    if (Memory.activeView === Memory.BROWSER_VIEW) {
        Memory.gamesRefreshButtonElement.value = 'Refreshing games...';

        Memory.socket.emit('refresh_games');
    }
});

Memory.gameLeaveButtonElement.addEventListener('click', function () {
    if (Memory.activeView === Memory.GAME_VIEW && Memory.activeGame) {
        Memory.leaveGame(true);
    }
});

Memory.gamefirstturnButtonElement.addEventListener('click', function () {
    if (Memory.activeView === Memory.GAME_VIEW && Memory.activeGame) {
        Memory.gameSettings.firstturn = !Memory.gameSettings.firstturn;
        Memory.updateGameView();
    }
});

Memory.gameStartButtonElement.addEventListener('click', function () {
    if (Memory.activeView === Memory.GAME_VIEW && Memory.activeGame) {
        Memory.gameSettings.rows = parseInt(Memory.gameRowsInputElement.value),
            Memory.gameSettings.columns = parseInt(Memory.gameColumnsInputElement.value);

        if (isNaN(Memory.gameSettings.rows) || isNaN(Memory.gameSettings.columns)) {
            Memory.gameStartButtonElement.value = 'Invalid rows or columns';
        } else {
            Memory.gameStartButtonElement.value = 'Start game';

            Memory.socket.emit('request_start_game', Memory.gameSettings);
        }
    }
});

Memory.gameCardDisplayElement.addEventListener('click', function (event) {
    if (Memory.activeView === Memory.GAME_VIEW && Memory.activeGame && Memory.activeGame.state) {
        var state = Memory.activeGame.state;
        var amAuthor = Memory.activeGame.info.author.identifier === Memory.me.identifier;
        var turnUser = !!((state.turn + state.firstturn + amAuthor) % 2);

        if (turnUser) {
            if (event.target.parentNode.id.startsWith('game-card-instance-')) {
                var card = parseInt(event.target.parentNode.id.substring(19));
                var picks = state.picks;

                picks.push(card);

                Memory.socket.emit('request_ask_for_card', card);

                if (picks.length == 2) {
                    Memory.socket.emit('request_play_turn', picks);

                    picks.length = 0;
                }
            }
        }
    }
});