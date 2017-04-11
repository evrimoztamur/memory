# ![Logo for memory](static/logo.png) memory
*A simple memory game using socket.io*

## Running it
There are no components that need to be compiled, so you can simply use `node .` to run the server.

By default, it runs on port 8000 if `$PORT` is not set.

## Playing it
Put in a username to join the lobby. You can create a game there, where you can only have one game going on at a time. A game password is also possible to lock the game down against intruders &ndash; this helps when you only want to play with a friend.

A game must have an author and an opponent present at the same time to be started. After that, just flip cards and try to match them *and don't cheat*.

If the author leaves, the game is removed. If the opponent leaves, the slot remains free again and someone else (or the one who left) can join the game. It will continue as usual.

## Fixing it
### Messy protocol
This is basically an experiment in using [socket.io](https://github.com/socketio/socket.io) to synchronise game states. There are some sanity checks in place for incoming data, but there is no full coverage for all commands. Additionally, there may be certain cases where the synchronisation goes wrong.

One case that's known is the lack of synchronisation for playing a single card and then leaving as an opponent. This messes up the game for a single turn, but gets fixed right after.

Further testing is required to figure these issues out and patch them.

### Interface for errors
The only remaining feature that's necessary to have is error handling in the user interface. Currently, most errors are not handled by the server either; most commands simply silently fail if they cannot be performed. It's a good idea to have errors showing up for incorrect passwords or attempts to play in your opponent's turn.

### Card themes
Not exactly an issue, but an option to switch the card themes should be easy to implement.

### Cowboy code
There wasn't a clear picture in my mind when I began making this, so the code is messier than it should be. However, it is still quite short and... mostly legible.

I will try to address this in the near future.
